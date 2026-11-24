# Tests

`pnpm test` runs the domain tests and the API test.

Domain tests cover:

- zero fees when the owner has not set a rate
- specific rules beating general ones
- future and expired rules
- an old snapshot staying put when the rate later changes
- a balanced ledger for platform-funded and seller-funded coupons
- Paystack signature checks and amount mismatch
- rate-card quotes

The API test, against PostgreSQL, covers registration, staff multi-factor authentication, a verified listing, a prohibited listing held for review, checkout idempotency, a fee change that does not alter the stored order, a refused charge when no gateway is configured, a rejected webhook signature, a successful verified payment posted once, a replay that does not double the ledger, a sold-out follow-up, reconciliation, and a buyer blocked from admin settings.

The website should be clicked through after `pnpm dev:api` and `pnpm dev:web`: home, browse, register, basket, checkout, and the unpaid-provider message.

Phase 2 routes are covered by typecheck and are not part of the default database test because the flag is off. Turn the flag on in a staging environment before exercising rider PINs.
