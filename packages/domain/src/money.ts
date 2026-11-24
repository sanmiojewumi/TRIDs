/** Highest single price the ledger stores in 32-bit kobo. ₦20,000,000. */
export const MAX_PRICE_KOBO = 2_000_000_000;

export function assertKobo(amount: number, label = 'Amount'): number {
  if (!Number.isInteger(amount) || amount < 0 || amount > MAX_PRICE_KOBO) {
    throw new Error(`${label} must be a whole number of kobo between 0 and ${MAX_PRICE_KOBO}`);
  }
  return amount;
}

/** Basis points: 10_000 = 100%. */
export function applyBps(amountKobo: number, bps: number): number {
  if (amountKobo <= 0 || bps <= 0) return 0;
  return Math.round((amountKobo * bps) / 10_000);
}

export function formatNaira(kobo: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(kobo / 100);
}

export function nairaToKobo(naira: number): number {
  if (!Number.isFinite(naira) || naira < 0) {
    throw new Error('Price must be a positive naira amount');
  }
  return assertKobo(Math.round(naira * 100), 'Price');
}
