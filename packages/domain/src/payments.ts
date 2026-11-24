import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifiedCharge {
  reference: string;
  amountKobo: number;
  currency: string;
  status: string;
  providerTransactionId: string;
}

export function paystackSignature(rawBody: string, secret: string): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

export function safeEqualText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function chargeSatisfiesExpectation(
  charge: VerifiedCharge,
  expected: { reference: string; amountKobo: number; currency: string },
): { ok: true } | { ok: false; reason: string } {
  if (charge.status !== 'success' && charge.status !== 'successful') {
    return { ok: false, reason: 'Provider has not confirmed a successful charge' };
  }
  if (charge.currency.toUpperCase() !== expected.currency.toUpperCase()) {
    return { ok: false, reason: 'Currency does not match the order' };
  }
  if (charge.reference !== expected.reference) {
    return { ok: false, reason: 'Payment reference does not match' };
  }
  if (!Number.isInteger(charge.amountKobo) || charge.amountKobo !== expected.amountKobo) {
    return { ok: false, reason: 'Paid amount does not match the order total' };
  }
  return { ok: true };
}
