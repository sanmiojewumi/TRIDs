# Plan

This repository is the Phase 1 foundation: web, phone client, API, database, admin controls, payment verification and a courier interface. It is not a store release, a payment-company approval, or a courier contract.

Calendar dates are not estimated here. The sequence depends on owner approvals.

## Done in this codebase

- Shared domain rules for fees, ledger balance, payment checks and roles.
- Working buyer, seller and admin journeys against PostgreSQL.
- Paystack and Flutterwave clients that fail closed.
- Phase 2 rider model and routes behind a flag.
- Automated tests for fee snapshots, signatures and a full checkout.

## Before calling it production

1. Owner chooses Paystack or Flutterwave and completes that company’s merchant process. Counsel confirms how seller funds may be held and described.
2. Owner enters the commercial rates, or deliberately leaves them at zero.
3. Owner signs at least one courier, or operates with seller-arranged handover and the rate card only.
4. Counsel replaces the draft policies and confirms the returns flow against Nigerian consumer rules.
5. Staging receives the production-shaped secrets. A real ₦1 charge is verified and refunded.
6. Penetration test, backup restore, and store listing for Android, iOS and iPad.
7. Turn on phase 2 only after rider pay, insurance and identity checks are decided. The comparison between riders and couriers is already in the quote list.

## Cost notes for the owner, not a quote

Engineering cost depends on who maintains this tree. Ongoing vendor costs are separate and need the owner’s accounts:

- Paystack or Flutterwave fees, on their published tariff.
- Courier invoices.
- SMS, email and push usage.
- Apple Developer and Google Play registration.
- Cloud hosting, PostgreSQL, object storage and backups.
- Legal review and a security test.

None of those amounts are chosen in code.
