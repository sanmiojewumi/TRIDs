import { applyBps, assertKobo } from './money.js';

export type SellerType = 'INDIVIDUAL' | 'BUSINESS';
export type DiscountFunding = 'PLATFORM' | 'SELLER';
export type SettingValueType = 'BPS' | 'FIXED_KOBO' | 'JSON';

export const COMMERCIAL_KEYS = [
  'SELLER_COMMISSION_BPS',
  'SELLER_COMMISSION_FIXED_KOBO',
  'BUYER_PROTECTION_BPS',
  'BUYER_PROTECTION_FIXED_KOBO',
  'FEATURED_LISTING_FEE_KOBO',
  'SELLER_SUBSCRIPTION_MONTHLY_KOBO',
  'BUSINESS_SUBSCRIPTION_MONTHLY_KOBO',
  'CAMPAIGN_FEE_KOBO',
  'DELIVERY_RATE_CARD',
  'INTERNAL_RIDER_RATE_CARD',
  'DELIVERY_RANKING',
] as const;

export type CommercialKey = (typeof COMMERCIAL_KEYS)[number];

export interface CommercialRule {
  id?: string;
  key: string;
  sellerType: SellerType | null;
  categoryId: string | null;
  valueType: SettingValueType;
  valueNumber: number | null;
  valueJson: unknown | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  createdAt: Date;
}

export interface FeeLine {
  unitPriceKobo: number;
  quantity: number;
  categoryId: string;
  sellerType: SellerType;
}

export interface CouponSpec {
  bpsOff: number;
  fixedOffKobo: number;
  maxDiscountKobo: number | null;
  fundedBy: DiscountFunding;
}

export interface FeeSnapshot {
  currency: 'NGN';
  pricedAt: string;
  sellerType: SellerType;
  itemsSubtotalKobo: number;
  discountKobo: number;
  couponFunding: DiscountFunding | null;
  buyerProtectionKobo: number;
  deliveryFeeKobo: number;
  deliverySubsidyKobo: number;
  commissionKobo: number;
  commissionCapped: boolean;
  sellerNetKobo: number;
  buyerTotalKobo: number;
  rulesUsed: { key: string; ruleId?: string; value: number }[];
}

function active(rule: CommercialRule, at: Date): boolean {
  return rule.effectiveFrom.getTime() <= at.getTime() && (rule.effectiveTo === null || rule.effectiveTo.getTime() > at.getTime());
}

function specificity(rule: CommercialRule, sellerType: SellerType, categoryId: string | null): number | null {
  if (rule.sellerType && rule.sellerType !== sellerType) return null;
  if (rule.categoryId && rule.categoryId !== categoryId) return null;
  return (rule.sellerType ? 1 : 0) + (rule.categoryId ? 2 : 0);
}

export function resolveRule(
  rules: readonly CommercialRule[],
  key: string,
  ctx: { sellerType: SellerType; categoryId: string | null; at: Date },
): CommercialRule | null {
  const matches = rules
    .filter((rule) => rule.key === key && active(rule, ctx.at))
    .map((rule) => ({ rule, score: specificity(rule, ctx.sellerType, ctx.categoryId) }))
    .filter((entry): entry is { rule: CommercialRule; score: number } => entry.score !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const from = b.rule.effectiveFrom.getTime() - a.rule.effectiveFrom.getTime();
      if (from !== 0) return from;
      return b.rule.createdAt.getTime() - a.rule.createdAt.getTime();
    });
  return matches[0]?.rule ?? null;
}

function numberValue(rule: CommercialRule | null): { value: number; rule?: CommercialRule } {
  if (!rule || rule.valueNumber === null) return { value: 0 };
  if (!Number.isInteger(rule.valueNumber) || rule.valueNumber < 0) {
    throw new Error(`Commercial setting ${rule.key} has an invalid number`);
  }
  if (rule.valueType === 'BPS' && rule.valueNumber > 10_000) {
    throw new Error(`Commercial setting ${rule.key} cannot exceed 100%`);
  }
  return { value: rule.valueNumber, rule };
}

export function computeFeeSnapshot(input: {
  items: FeeLine[];
  rules: readonly CommercialRule[];
  at: Date;
  coupon?: CouponSpec | null;
  delivery: { feeKobo: number; subsidyKobo: number };
}): FeeSnapshot {
  if (input.items.length === 0) throw new Error('An order needs at least one item');
  const sellerType = input.items[0]!.sellerType;
  if (input.items.some((item) => item.sellerType !== sellerType)) {
    throw new Error('Checkout one seller at a time so fees stay unambiguous');
  }

  const rulesUsed: FeeSnapshot['rulesUsed'] = [];
  const lines = input.items.map((item) => {
    const line = assertKobo(item.unitPriceKobo * item.quantity, 'Line total');
    const bps = numberValue(
      resolveRule(input.rules, 'SELLER_COMMISSION_BPS', {
        sellerType,
        categoryId: item.categoryId,
        at: input.at,
      }),
    );
    if (bps.rule) rulesUsed.push({ key: 'SELLER_COMMISSION_BPS', ruleId: bps.rule.id, value: bps.value });
    return { line, bps: bps.value };
  });
  const itemsSubtotalKobo = assertKobo(
    lines.reduce((sum, line) => sum + line.line, 0),
    'Subtotal',
  );

  const fixed = numberValue(
    resolveRule(input.rules, 'SELLER_COMMISSION_FIXED_KOBO', {
      sellerType,
      categoryId: null,
      at: input.at,
    }),
  );
  if (fixed.rule) rulesUsed.push({ key: 'SELLER_COMMISSION_FIXED_KOBO', ruleId: fixed.rule.id, value: fixed.value });

  const protectionBps = numberValue(
    resolveRule(input.rules, 'BUYER_PROTECTION_BPS', { sellerType, categoryId: null, at: input.at }),
  );
  const protectionFixed = numberValue(
    resolveRule(input.rules, 'BUYER_PROTECTION_FIXED_KOBO', { sellerType, categoryId: null, at: input.at }),
  );
  if (protectionBps.rule) rulesUsed.push({ key: 'BUYER_PROTECTION_BPS', ruleId: protectionBps.rule.id, value: protectionBps.value });
  if (protectionFixed.rule) {
    rulesUsed.push({ key: 'BUYER_PROTECTION_FIXED_KOBO', ruleId: protectionFixed.rule.id, value: protectionFixed.value });
  }

  let discountKobo = 0;
  const coupon = input.coupon ?? null;
  if (coupon) {
    discountKobo = applyBps(itemsSubtotalKobo, coupon.bpsOff) + coupon.fixedOffKobo;
    if (coupon.maxDiscountKobo !== null) discountKobo = Math.min(discountKobo, coupon.maxDiscountKobo);
    discountKobo = Math.min(discountKobo, itemsSubtotalKobo);
  }

  const commissionBase = coupon?.fundedBy === 'SELLER' ? itemsSubtotalKobo - discountKobo : itemsSubtotalKobo;
  let remainingDiscount = coupon?.fundedBy === 'SELLER' ? discountKobo : 0;
  let percentCommission = 0;
  lines.forEach((line, index) => {
    let base = line.line;
    if (coupon?.fundedBy === 'SELLER' && itemsSubtotalKobo > 0) {
      const share =
        index === lines.length - 1 ? remainingDiscount : Math.round((line.line / itemsSubtotalKobo) * discountKobo);
      remainingDiscount -= share;
      base -= share;
    }
    percentCommission += applyBps(base, line.bps);
  });
  let commissionKobo = percentCommission + fixed.value;
  let commissionCapped = false;
  if (commissionKobo > commissionBase) {
    commissionKobo = commissionBase;
    commissionCapped = true;
  }

  const protectionBase = itemsSubtotalKobo - discountKobo;
  const buyerProtectionKobo = applyBps(protectionBase, protectionBps.value) + protectionFixed.value;
  const deliveryFeeKobo = assertKobo(input.delivery.feeKobo, 'Delivery fee');
  const deliverySubsidyKobo = Math.min(deliveryFeeKobo, assertKobo(input.delivery.subsidyKobo, 'Delivery subsidy'));
  const deliveryBuyer = deliveryFeeKobo - deliverySubsidyKobo;

  const sellerNetKobo =
    coupon?.fundedBy === 'SELLER'
      ? itemsSubtotalKobo - discountKobo - commissionKobo
      : itemsSubtotalKobo - commissionKobo;
  const buyerTotalKobo = itemsSubtotalKobo - discountKobo + buyerProtectionKobo + deliveryBuyer;

  return {
    currency: 'NGN',
    pricedAt: input.at.toISOString(),
    sellerType,
    itemsSubtotalKobo,
    discountKobo,
    couponFunding: coupon?.fundedBy ?? null,
    buyerProtectionKobo,
    deliveryFeeKobo,
    deliverySubsidyKobo,
    commissionKobo,
    commissionCapped,
    sellerNetKobo,
    buyerTotalKobo,
    rulesUsed,
  };
}
