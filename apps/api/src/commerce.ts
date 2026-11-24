import { Prisma, type PrismaClient } from '@prisma/client';
import {
  computeFeeSnapshot,
  parseRateCard,
  quoteRateCard,
  rankDeliveryOptions,
  resolveRule,
  sellerArrangedOption,
  type CommercialRule,
  type CouponSpec,
  type DeliveryQuote,
  type FeeSnapshot,
} from '@ninted/domain';
import { HttpError } from './http.js';
import { ContractCourier, type CourierParty } from './couriers.js';
import { decryptString } from './secrets.js';
import type { Env } from './env.js';

export async function loadRules(prisma: PrismaClient): Promise<CommercialRule[]> {
  const rows = await prisma.commercialSetting.findMany();
  return rows.map((row) => ({
    id: row.id,
    key: row.key,
    sellerType: row.sellerType,
    categoryId: row.categoryId,
    valueType: row.valueType,
    valueNumber: row.valueNumber,
    valueJson: row.valueJson,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    createdAt: row.createdAt,
  }));
}

export async function activeCoupon(prisma: PrismaClient, code: string | undefined, at: Date): Promise<CouponSpec & { code: string; id: string } | null> {
  if (!code) return null;
  const coupon = await prisma.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  if (!coupon || !coupon.active) throw new HttpError(400, 'That coupon is not active');
  if (coupon.startsAt > at || (coupon.endsAt && coupon.endsAt <= at)) throw new HttpError(400, 'That coupon is outside its dates');
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) {
    throw new HttpError(400, 'That coupon has been fully used');
  }
  return {
    id: coupon.id,
    code: coupon.code,
    bpsOff: coupon.bpsOff,
    fixedOffKobo: coupon.fixedOffKobo,
    maxDiscountKobo: coupon.maxDiscountKobo,
    fundedBy: coupon.fundedBy,
  };
}

export async function deliveryOptions(input: {
  prisma: PrismaClient;
  env: Env;
  fromState: string;
  toState: string;
  weightGrams: number | null;
  rules: CommercialRule[];
  at: Date;
  sellerId: string;
}): Promise<{ options: DeliveryQuote[]; warnings: string[] }> {
  const warnings: string[] = [];
  const options: DeliveryQuote[] = [sellerArrangedOption()];
  if (!input.weightGrams) {
    warnings.push('Add a parcel weight to the listing before courier prices can be quoted');
    return { options, warnings };
  }
  const seller = await input.prisma.sellerProfile.findUnique({ where: { userId: input.sellerId } });
  const sellerType = seller?.type ?? 'INDIVIDUAL';
  const rateRule = resolveRule(input.rules, 'DELIVERY_RATE_CARD', { sellerType, categoryId: null, at: input.at });
  const card = parseRateCard(rateRule?.valueJson);
  if (card) {
    const quote = quoteRateCard(card, {
      from: input.fromState,
      to: input.toState,
      weightGrams: input.weightGrams,
      code: 'PLATFORM_RATE',
      label: 'Platform rate card',
      kind: 'PLATFORM_RATE',
    });
    if (quote) options.push(quote);
  }
  if (input.env.phase2) {
    const riderRule = resolveRule(input.rules, 'INTERNAL_RIDER_RATE_CARD', { sellerType, categoryId: null, at: input.at });
    const riderCard = parseRateCard(riderRule?.valueJson);
    if (riderCard) {
      const available = await input.prisma.rider.count({
        where: { status: 'APPROVED', available: true, state: input.fromState },
      });
      if (available > 0) {
        const quote = quoteRateCard(riderCard, {
          from: input.fromState,
          to: input.toState,
          weightGrams: input.weightGrams,
          code: 'NINTED_RIDER',
          label: 'Ninted 9ja rider',
          kind: 'RIDER',
        });
        if (quote) options.push(quote);
      } else {
        warnings.push('No Ninted rider is available in the pickup state');
      }
    }
  }

  const providers = await input.prisma.courierProvider.findMany({ where: { enabled: true } });
  for (const provider of providers) {
    if (!provider.baseUrl || !provider.apiKeyEnc) {
      warnings.push(`${provider.displayName} is enabled but has no API credentials`);
      continue;
    }
    try {
      const courier = new ContractCourier(
        provider.code,
        provider.displayName,
        provider.baseUrl,
        decryptString(provider.apiKeyEnc, input.env.encryptionKey),
      );
      const party = (state: string): CourierParty => ({
        recipient: 'Quote',
        phone: '',
        line1: '',
        city: '',
        state,
      });
      const quotes = await courier.quote({
        pickup: party(input.fromState),
        dropoff: party(input.toState),
        parcel: { weightGrams: input.weightGrams },
      });
      options.push(...quotes);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : `${provider.displayName} did not return a quote`);
    }
  }

  const ranking = resolveRule(input.rules, 'DELIVERY_RANKING', { sellerType, categoryId: null, at: input.at });
  const priority = (ranking?.valueJson as { priority?: string } | null)?.priority === 'SPEED' ? 'SPEED' : 'COST';
  return { options: rankDeliveryOptions(options, priority), warnings };
}

export async function priceSelection(input: {
  prisma: PrismaClient;
  env: Env;
  buyerId: string;
  sellerId: string;
  lines: { productId: string; quantity: number; offerId?: string }[];
  handover: string;
  addressId?: string;
  couponCode?: string;
  at?: Date;
}): Promise<{
  snapshot: FeeSnapshot;
  option: DeliveryQuote;
  products: Prisma.ProductGetPayload<{ include: { seller: true } }>[];
  address: { id: string; recipient: string; phone: string; line1: string; city: string; state: string } | null;
  couponCode: string | null;
  couponId: string | null;
  pricedLines: {
    productId: string;
    quantity: number;
    unitPriceKobo: number;
    title: string;
    categoryId: string;
    condition: Prisma.ProductGetPayload<{ include: { seller: true } }>['condition'];
  }[];
}> {
  const at = input.at ?? new Date();
  if (input.buyerId === input.sellerId) throw new HttpError(400, 'You cannot buy your own listing');
  if (input.lines.length === 0) throw new HttpError(400, 'Choose at least one item');
  const products = await input.prisma.product.findMany({
    where: { id: { in: input.lines.map((line) => line.productId) } },
    include: { seller: true },
  });
  if (products.length !== input.lines.length) throw new HttpError(400, 'A selected item no longer exists');
  if (products.some((product) => product.sellerId !== input.sellerId)) {
    throw new HttpError(400, 'Checkout one seller at a time');
  }
  const address = input.addressId
    ? await input.prisma.address.findFirst({ where: { id: input.addressId, userId: input.buyerId } })
    : null;
  if (input.handover !== 'SELLER_ARRANGED' && !address) throw new HttpError(400, 'Choose a delivery address');

  const rules = await loadRules(input.prisma);
  const weight = products.reduce((sum, product) => sum + (product.weightGrams ?? 0), 0);
  const quoted = await deliveryOptions({
    prisma: input.prisma,
    env: input.env,
    fromState: products[0]!.state,
    toState: address?.state || products[0]!.state,
    weightGrams: products.every((product) => product.weightGrams) ? weight : null,
    rules,
    at,
    sellerId: input.sellerId,
  });
  const option = quoted.options.find((entry) => entry.code === input.handover);
  if (!option) throw new HttpError(400, 'That delivery option is not available');

  const coupon = await activeCoupon(input.prisma, input.couponCode, at);
  const feeLines = [];
  for (const line of input.lines) {
    const product = products.find((item) => item.id === line.productId)!;
    if (product.status !== 'ACTIVE') throw new HttpError(409, `${product.title} is not available`);
    if (line.quantity < 1 || line.quantity > product.quantity - product.reserved) {
      throw new HttpError(409, `${product.title} does not have enough available quantity`);
    }
    let unitPriceKobo = product.priceKobo;
    if (line.offerId) {
      if (line.quantity !== 1) throw new HttpError(400, 'Accepted offers apply to a single item');
      const offer = await input.prisma.offer.findFirst({
        where: {
          id: line.offerId,
          productId: product.id,
          buyerId: input.buyerId,
          status: 'ACCEPTED',
          expiresAt: { gt: at },
        },
      });
      if (!offer) throw new HttpError(400, 'That accepted offer is no longer valid');
      unitPriceKobo = offer.amountKobo;
    }
    feeLines.push({ product, quantity: line.quantity, unitPriceKobo });
  }

  const snapshot = computeFeeSnapshot({
    items: feeLines.map((line) => ({
      unitPriceKobo: line.unitPriceKobo,
      quantity: line.quantity,
      categoryId: line.product.categoryId,
      sellerType: line.product.seller.type,
    })),
    rules,
    at,
    coupon,
    delivery: { feeKobo: option.feeKobo, subsidyKobo: option.subsidyKobo },
  });

  return {
    snapshot,
    option,
    products,
    address,
    couponCode: coupon?.code ?? null,
    couponId: coupon?.id ?? null,
    pricedLines: feeLines.map((line) => ({
      productId: line.product.id,
      quantity: line.quantity,
      unitPriceKobo: line.unitPriceKobo,
      title: line.product.title,
      categoryId: line.product.categoryId,
      condition: line.product.condition,
    })),
  };
}

export async function createOrder(input: {
  prisma: PrismaClient;
  env: Env;
  buyerId: string;
  sellerId: string;
  lines: { productId: string; quantity: number; offerId?: string }[];
  handover: string;
  addressId?: string;
  couponCode?: string;
  idempotencyKey?: string;
  buyerNote?: string;
}) {
  if (input.idempotencyKey) {
    const existing = await input.prisma.order.findFirst({
      where: { buyerId: input.buyerId, idempotencyKey: input.idempotencyKey },
      include: { items: true, shipment: true },
    });
    if (existing) return existing;
  }
  const priced = await priceSelection(input);
  const seller = priced.products[0]!.seller;
  const pickup = {
    recipient: seller.storeName,
    phone: '',
    line1: seller.city || '',
    city: seller.city || '',
    state: priced.products[0]!.state,
  };
  const dropoff = priced.address
    ? {
        recipient: priced.address.recipient,
        phone: priced.address.phone,
        line1: priced.address.line1,
        city: priced.address.city,
        state: priced.address.state,
      }
    : pickup;

  try {
    return await input.prisma.$transaction(async (tx) => {
      for (const line of input.lines) {
        const reserved = await tx.$executeRaw`
          UPDATE "Product"
          SET reserved = reserved + ${line.quantity}
          WHERE id = ${line.productId}
            AND status = 'ACTIVE'
            AND (quantity - reserved) >= ${line.quantity}
        `;
        if (reserved !== 1) throw new HttpError(409, 'An item just sold out');
      }
      const order = await tx.order.create({
        data: {
          buyerId: input.buyerId,
          sellerId: input.sellerId,
          status: 'PENDING_PAYMENT',
          itemsSubtotalKobo: priced.snapshot.itemsSubtotalKobo,
          discountKobo: priced.snapshot.discountKobo,
          buyerProtectionKobo: priced.snapshot.buyerProtectionKobo,
          deliveryFeeKobo: priced.snapshot.deliveryFeeKobo,
          deliverySubsidyKobo: priced.snapshot.deliverySubsidyKobo,
          commissionKobo: priced.snapshot.commissionKobo,
          sellerNetKobo: priced.snapshot.sellerNetKobo,
          buyerTotalKobo: priced.snapshot.buyerTotalKobo,
          feeSnapshot: priced.snapshot as unknown as Prisma.InputJsonValue,
          couponCode: priced.couponCode,
          addressId: priced.address?.id,
          handover: priced.option.code,
          buyerNote: input.buyerNote,
          idempotencyKey: input.idempotencyKey,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          items: {
            create: priced.pricedLines.map((line) => ({
              productId: line.productId,
              title: line.title,
              unitPriceKobo: line.unitPriceKobo,
              quantity: line.quantity,
              categoryId: line.categoryId,
              condition: line.condition,
            })),
          },
          timeline: { create: { status: 'PENDING_PAYMENT', note: 'Fees were snapshotted from the commercial settings in force now' } },
          shipment: {
            create: {
              courierCode: priced.option.code,
              serviceLabel: priced.option.label,
              status: 'PENDING_DISPATCH',
              quoteFeeKobo: priced.option.feeKobo,
              subsidyKobo: priced.option.subsidyKobo,
              weightGrams: priced.products.reduce((sum, product) => sum + (product.weightGrams ?? 0), 0),
              pickupAddress: pickup,
              deliveryAddress: dropoff,
              events: { create: { status: 'PENDING_DISPATCH', source: 'CHECKOUT', note: priced.option.label } },
            },
          },
        },
        include: { items: true, shipment: true },
      });
      if (priced.couponId) {
        await tx.coupon.update({ where: { id: priced.couponId }, data: { redemptions: { increment: 1 } } });
      }
      return order;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && input.idempotencyKey) {
      const existing = await input.prisma.order.findFirst({
        where: { buyerId: input.buyerId, idempotencyKey: input.idempotencyKey },
        include: { items: true, shipment: true },
      });
      if (existing) return existing;
    }
    throw error;
  }
}

export async function releaseReservation(tx: Prisma.TransactionClient, productId: string, quantity: number) {
  await tx.$executeRaw`
    UPDATE "Product" SET reserved = GREATEST(reserved - ${quantity}, 0) WHERE id = ${productId}
  `;
}

export async function expireUnpaidOrders(prisma: PrismaClient): Promise<number> {
  const stale = await prisma.order.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      expiresAt: { lt: new Date() },
      payments: { none: { status: { in: ['INITIATED', 'PENDING', 'SUCCESS'] } } },
    },
    include: { items: true },
  });
  let expired = 0;
  for (const order of stale) {
    const did = await prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id: order.id, status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELLED' },
      });
      if (updated.count !== 1) return false;
      for (const item of order.items) await releaseReservation(tx, item.productId, item.quantity);
      await tx.orderEvent.create({
        data: { orderId: order.id, status: 'CANCELLED', note: 'Payment window expired' },
      });
      await tx.shipment.updateMany({ where: { orderId: order.id }, data: { status: 'CANCELLED' } });
      return true;
    });
    if (did) expired += 1;
  }
  return expired;
}
