import { describe, expect, it } from 'vitest';
import { chargeSatisfiesExpectation, paystackSignature, safeEqualText } from './payments.js';

describe('payment verification', () => {
  it('accepts a charge only when status, currency, reference and kobo amount all match', () => {
    const secret = 'sk_test_example';
    const body = JSON.stringify({ event: 'charge.success', data: { reference: 'n9_1', amount: 250000 } });
    const signature = paystackSignature(body, secret);
    expect(safeEqualText(signature, paystackSignature(body, secret))).toBe(true);
    expect(safeEqualText(signature, paystackSignature(body, 'other'))).toBe(false);
    expect(safeEqualText(signature, signature.slice(0, -1))).toBe(false);

    expect(
      chargeSatisfiesExpectation(
        { reference: 'n9_1', amountKobo: 250000, currency: 'NGN', status: 'success', providerTransactionId: '1' },
        { reference: 'n9_1', amountKobo: 250000, currency: 'NGN' },
      ).ok,
    ).toBe(true);
    expect(
      chargeSatisfiesExpectation(
        { reference: 'n9_1', amountKobo: 100, currency: 'NGN', status: 'success', providerTransactionId: '1' },
        { reference: 'n9_1', amountKobo: 250000, currency: 'NGN' },
      ),
    ).toEqual({ ok: false, reason: 'Paid amount does not match the order total' });
    expect(
      chargeSatisfiesExpectation(
        { reference: 'n9_1', amountKobo: 250000, currency: 'NGN', status: 'abandoned', providerTransactionId: '1' },
        { reference: 'n9_1', amountKobo: 250000, currency: 'NGN' },
      ).ok,
    ).toBe(false);
  });
});
