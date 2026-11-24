# Security

This is an engineering review of the code in this repository, not a penetration test and not legal advice.

## In the product

- Passwords are hashed with scrypt. Minimum length is 10, with a letter and a number.
- Access tokens last 15 minutes. Refresh tokens are random, stored only as SHA-256, and rotated.
- Staff tools require TOTP. The TOTP secret is encrypted with AES-256-GCM.
- Bank account numbers and courier API keys are encrypted the same way. Responses show the last four digits.
- The API does not collect or store card numbers. The buyer pays on the provider’s page.
- Paystack webhooks are HMAC-SHA512. Flutterwave webhooks use the configured hash. Both paths re-verify the transaction with the provider and check reference, currency and kobo amount.
- Settlement uses a conditional update so a repeated webhook does not post the ledger twice.
- Cookie mutations from the website require a custom header.
- Helmet, CORS limited to the web origin, and rate limits are on. Auth routes are tighter.
- Uploads accept JPEG, PNG and WebP under 5MB and reject path traversal.
- Listing text is checked against an editable prohibited-term list and held for review.
- Amount mismatches become fraud flags instead of successful orders.
- Admin changes to fees, payouts, couriers, policies and moderation write an audit row with the actor and IP.
- Queries use Prisma parameters.

## Still required before production

- A real penetration test and dependency monitoring in the owner’s environment.
- Counsel for the Nigeria Data Protection Act, consumer-protection returns, and whether the ledger hold may be described to customers.
- Provider approval for Paystack or Flutterwave, including the settlement method.
- Production secrets in a manager, TLS, encrypted database disks, backups and a restore drill.
- Separate staging, with `SEED_DEMO` left off.
- App Store and Play signing through EAS or the native stores.

`pnpm audit` should be run in CI once the owner accepts the current tree. It is not a substitute for the review above.
