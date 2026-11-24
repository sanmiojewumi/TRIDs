import { describe, expect, it } from 'vitest';
import { computeFeeSnapshot, resolveRule, type CommercialRule } from './fees.js';
import { ledgerForCapturedPayment, reconcilePayments } from './ledger.js';

function rule(partial: Partial<CommercialRule> & Pick<CommercialRule, 'key' | 'valueNumber'>): CommercialRule {
  return {
    sellerType: null,
    categoryId: null,
    valueType: partial.key.endsWith('BPS') ? 'BPS' : 'FIXED_KOBO',
    valueJson: null,
    effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...partial,
  };
}

const at = new Date('2026-06-01T00:00:00Z');

describe('commercial rules', () => {
  it('uses a zero fee when the owner has not set a charge', () => {
    const snapshot = computeFeeSnapshot({
      items: [{ unitPriceKobo: 1_000_000, quantity: 1, categoryId: 'shoes', sellerType: 'INDIVIDUAL' }],
      rules: [],
      at,
      delivery: { feeKobo: 0, subsidyKobo: 0 },
    });
    expect(snapshot.commissionKobo).toBe(0);
    expect(snapshot.buyerProtectionKobo).toBe(0);
    expect(snapshot.buyerTotalKobo).toBe(1_000_000);
    expect(snapshot.sellerNetKobo).toBe(1_000_000);
  });

  it('prefers the most specific effective rule and ignores future or expired ones', () => {
    const rules = [
      rule({ id: 'global', key: 'SELLER_COMMISSION_BPS', valueNumber: 1000 }),
      rule({
        id: 'business',
        key: 'SELLER_COMMISSION_BPS',
        sellerType: 'BUSINESS',
        valueNumber: 500,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      }),
      rule({
        id: 'shoes-business',
        key: 'SELLER_COMMISSION_BPS',
        sellerType: 'BUSINESS',
        categoryId: 'shoes',
        valueNumber: 300,
        createdAt: new Date('2026-03-01T00:00:00Z'),
      }),
      rule({
        id: 'future',
        key: 'SELLER_COMMISSION_BPS',
        sellerType: 'BUSINESS',
        categoryId: 'shoes',
        valueNumber: 9000,
        effectiveFrom: new Date('2026-12-01T00:00:00Z'),
      }),
      rule({
        id: 'expired',
        key: 'SELLER_COMMISSION_BPS',
        valueNumber: 8000,
        effectiveTo: new Date('2026-05-01T00:00:00Z'),
      }),
    ];
    expect(
      resolveRule(rules, 'SELLER_COMMISSION_BPS', { sellerType: 'BUSINESS', categoryId: 'shoes', at })?.id,
    ).toBe('shoes-business');
    expect(
      resolveRule(rules, 'SELLER_COMMISSION_BPS', { sellerType: 'INDIVIDUAL', categoryId: 'shoes', at })?.id,
    ).toBe('global');

    const first = computeFeeSnapshot({
      items: [{ unitPriceKobo: 1_000_000, quantity: 1, categoryId: 'shoes', sellerType: 'BUSINESS' }],
      rules,
      at,
      delivery: { feeKobo: 200_000, subsidyKobo: 50_000 },
    });
    expect(first.commissionKobo).toBe(30_000);
    expect(first.buyerTotalKobo).toBe(1_150_000);
    expect(first.sellerNetKobo).toBe(970_000);

    const laterRules = [
      ...rules,
      rule({
        id: 'raised',
        key: 'SELLER_COMMISSION_BPS',
        sellerType: 'BUSINESS',
        categoryId: 'shoes',
        valueNumber: 2000,
        effectiveFrom: new Date('2026-07-01T00:00:00Z'),
        createdAt: new Date('2026-06-15T00:00:00Z'),
      }),
    ];
    const stored = structuredClone(first);
    const recomputed = computeFeeSnapshot({
      items: [{ unitPriceKobo: 1_000_000, quantity: 1, categoryId: 'shoes', sellerType: 'BUSINESS' }],
      rules: laterRules,
      at: new Date('2026-08-01T00:00:00Z'),
      delivery: { feeKobo: 200_000, subsidyKobo: 50_000 },
    });
    expect(recomputed.commissionKobo).toBe(200_000);
    expect(stored.commissionKobo).toBe(30_000);
    expect(stored.buyerTotalKobo).toBe(1_150_000);
  });

  it('caps commission and balances the ledger for both coupon funders', () => {
    const rules = [
      rule({ key: 'SELLER_COMMISSION_BPS', valueNumber: 10_000 }),
      rule({ key: 'SELLER_COMMISSION_FIXED_KOBO', valueNumber: 50_000 }),
      rule({ key: 'BUYER_PROTECTION_BPS', valueNumber: 200 }),
      rule({ key: 'BUYER_PROTECTION_FIXED_KOBO', valueNumber: 10_000 }),
    ];
    for (const fundedBy of ['PLATFORM', 'SELLER'] as const) {
      const snapshot = computeFeeSnapshot({
        items: [
          { unitPriceKobo: 500_000, quantity: 2, categoryId: 'phones', sellerType: 'INDIVIDUAL' },
        ],
        rules,
        at,
        coupon: { bpsOff: 1000, fixedOffKobo: 0, maxDiscountKobo: null, fundedBy },
        delivery: { feeKobo: 150_000, subsidyKobo: 20_000 },
      });
      expect(snapshot.commissionCapped).toBe(true);
      expect(snapshot.sellerNetKobo).toBeGreaterThanOrEqual(0);
      expect(ledgerForCapturedPayment(snapshot).reduce((sum, line) => {
        return sum + (line.direction === 'DEBIT' ? line.amountKobo : -line.amountKobo);
      }, 0)).toBe(0);
    }
  });
});

describe('reconciliation', () => {
  it('flags a ledger that does not match captured payments', () => {
    const result = reconcilePayments({
      capturedPaymentsKobo: 1000,
      processedRefundsKobo: 200,
      paidPayoutsKobo: 300,
      clearingDebitsKobo: 900,
      clearingCreditsKobo: 500,
    });
    expect(result.ok).toBe(false);
    expect(result.issues).toHaveLength(1);
  });
});
