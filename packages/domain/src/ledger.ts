import type { FeeSnapshot } from './fees.js';

export const LEDGER_ACCOUNTS = [
  'PAYMENT_CLEARING',
  'COMMISSION_REVENUE',
  'BUYER_PROTECTION_REVENUE',
  'DELIVERY_CLEARING',
  'DELIVERY_SUBSIDY',
  'SELLER_PAYABLE',
  'PLATFORM_DISCOUNT',
] as const;

export type LedgerAccount = (typeof LEDGER_ACCOUNTS)[number];
export type LedgerDirection = 'DEBIT' | 'CREDIT';

export interface LedgerLine {
  account: LedgerAccount;
  direction: LedgerDirection;
  amountKobo: number;
  memo: string;
}

function push(lines: LedgerLine[], account: LedgerAccount, direction: LedgerDirection, amountKobo: number, memo: string) {
  if (amountKobo < 0) throw new Error(`Negative ledger amount for ${account}`);
  if (amountKobo === 0) return;
  lines.push({ account, direction, amountKobo, memo });
}

export function assertBalanced(lines: readonly LedgerLine[]): void {
  const total = (direction: LedgerDirection) =>
    lines.filter((line) => line.direction === direction).reduce((sum, line) => sum + line.amountKobo, 0);
  const debit = total('DEBIT');
  const credit = total('CREDIT');
  if (debit !== credit) {
    throw new Error(`Unbalanced ledger: debits ${debit} credits ${credit}`);
  }
}

/**
 * Internal books for a captured buyer payment.
 * This is not provider escrow and not a split payment. Seller payable stays
 * on the platform ledger until finance records a payout.
 */
export function ledgerForCapturedPayment(snapshot: FeeSnapshot): LedgerLine[] {
  const lines: LedgerLine[] = [];
  push(lines, 'PAYMENT_CLEARING', 'DEBIT', snapshot.buyerTotalKobo, 'Buyer payment captured');
  if (snapshot.couponFunding === 'PLATFORM') {
    push(lines, 'PLATFORM_DISCOUNT', 'DEBIT', snapshot.discountKobo, 'Platform-funded coupon');
  }
  push(lines, 'DELIVERY_SUBSIDY', 'DEBIT', snapshot.deliverySubsidyKobo, 'Delivery subsidy funded by the platform');
  push(lines, 'SELLER_PAYABLE', 'CREDIT', snapshot.sellerNetKobo, 'Seller earnings held until payout');
  push(lines, 'COMMISSION_REVENUE', 'CREDIT', snapshot.commissionKobo, 'Seller commission');
  push(lines, 'BUYER_PROTECTION_REVENUE', 'CREDIT', snapshot.buyerProtectionKobo, 'Buyer protection fee');
  push(lines, 'DELIVERY_CLEARING', 'CREDIT', snapshot.deliveryFeeKobo, 'Courier or delivery fee');
  assertBalanced(lines);
  return lines;
}

export function reverseLedger(lines: readonly LedgerLine[], memoPrefix = 'Reversal'): LedgerLine[] {
  const reversed = lines.map((line) => ({
    account: line.account,
    direction: line.direction === 'DEBIT' ? 'CREDIT' as const : 'DEBIT' as const,
    amountKobo: line.amountKobo,
    memo: `${memoPrefix}: ${line.memo}`,
  }));
  assertBalanced(reversed);
  return reversed;
}

export function ledgerForPayout(amountKobo: number): LedgerLine[] {
  const lines: LedgerLine[] = [];
  push(lines, 'SELLER_PAYABLE', 'DEBIT', amountKobo, 'Seller payout');
  push(lines, 'PAYMENT_CLEARING', 'CREDIT', amountKobo, 'Cash paid to seller');
  assertBalanced(lines);
  return lines;
}

export interface ReconciliationInput {
  capturedPaymentsKobo: number;
  processedRefundsKobo: number;
  paidPayoutsKobo: number;
  clearingDebitsKobo: number;
  clearingCreditsKobo: number;
}

export function reconcilePayments(input: ReconciliationInput): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  if (input.capturedPaymentsKobo !== input.clearingDebitsKobo) {
    issues.push(
      `Captured payments (${input.capturedPaymentsKobo}) do not match payment-clearing debits (${input.clearingDebitsKobo})`,
    );
  }
  const expectedCredits = input.processedRefundsKobo + input.paidPayoutsKobo;
  if (expectedCredits !== input.clearingCreditsKobo) {
    issues.push(
      `Refunds plus payouts (${expectedCredits}) do not match payment-clearing credits (${input.clearingCreditsKobo})`,
    );
  }
  return { ok: issues.length === 0, issues };
}
