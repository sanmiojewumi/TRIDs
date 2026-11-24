import { describe, expect, it } from 'vitest';
import { quoteRateCard, rankDeliveryOptions, sellerArrangedOption } from './delivery.js';

describe('delivery rate card', () => {
  const card = {
    subsidyKobo: 50_000,
    subsidyBps: 0,
    lanes: [
      { from: 'Lagos', to: 'Lagos', baseKobo: 150_000, perKgKobo: 20_000, etaDays: 1 },
      { from: '*', to: '*', baseKobo: 400_000, perKgKobo: 50_000, etaDays: 4 },
    ],
  };

  it('prices a matching lane and ranks cheaper options first', () => {
    const lagos = quoteRateCard(card, {
      from: 'Lagos',
      to: 'Lagos',
      weightGrams: 1500,
      code: 'PLATFORM_RATE',
      label: 'Ninted rate card',
      kind: 'PLATFORM_RATE',
    });
    expect(lagos?.feeKobo).toBe(180_000);
    expect(lagos?.subsidyKobo).toBe(50_000);
    expect(lagos?.buyerPaysKobo).toBe(130_000);

    const ranked = rankDeliveryOptions(
      [lagos!, sellerArrangedOption(), { ...lagos!, code: 'SLOW', feeKobo: 10_000, etaDays: 9, buyerPaysKobo: 10_000 }],
      'COST',
    );
    expect(ranked.map((option) => option.code)).toEqual(['SELLER_ARRANGED', 'SLOW', 'PLATFORM_RATE']);
  });

  it('returns nothing when the owner has no lane', () => {
    expect(
      quoteRateCard(
        { lanes: [] },
        { from: 'Lagos', to: 'Kano', weightGrams: 500, code: 'PLATFORM_RATE', label: 'Rate', kind: 'PLATFORM_RATE' },
      ),
    ).toBeNull();
  });
});
