# Ninted 9ja

Ninted 9ja is a peer-to-peer marketplace for new and pre-owned goods in Nigeria. The website, the Android and iOS app, and the admin desk all use one API and one PostgreSQL database.

The brand, interface and code are original. Green, sand and lime are the palette. Fraunces and Outfit are the typefaces. Nothing here copies another marketplace’s logo or layout.

## What already works

- Accounts that can both buy and sell, including a business store profile.
- Listings, search, filters, favourites, offers, messages and seller reviews.
- Checkout that prices commission, buyer protection, delivery and coupons from owner-controlled settings, then stores that price on the order.
- Paystack or Flutterwave initiation, server-side verification and signed webhooks. A payment is never marked successful without the provider’s verify call. If no key is configured, checkout refuses to invent a charge.
- A double-entry ledger, payouts that finance must match to a real transfer reference, refunds that wait for the provider, and reconciliation.
- Courier adapters. A courier is quoted and booked only when its API answers. Owner rate cards and seller-arranged handover are the options that do not pretend to be a courier.
- Phase 2 rider, PIN and GPS tables and routes, switched off until `PHASE2_LOGISTICS=true`.
- Admin roles, mandatory multi-factor authentication for staff tools, and an audit log.

Commission percentages are not hard-coded. Until the owner saves a rate, the fee is zero.

## Stack

| Part | Choice | Why |
| --- | --- | --- |
| Web and admin | Next.js | Recommended. One responsive app for buyers, sellers and staff. |
| Phone and tablet | Expo / React Native | One TypeScript client for Android, iOS and iPad, sharing the domain package with the web. Flutter would be a second language and a second toolchain. The cost is an Expo/EAS build for the stores. |
| API | Fastify | Same module boundaries people expect from NestJS, with less ceremony and a testable app builder. Moving a module into Nest later is mechanical. |
| Database | PostgreSQL and Prisma | Recommended. |
| Payments | Paystack, Flutterwave behind the same interface | The owner still has to approve the provider commercially and legally. |

## Run it locally

PostgreSQL must be available. Docker Compose is included.

```bash
cp .env.example .env
# Fill ACCESS_TOKEN_SECRET, SECRET_ENCRYPTION_KEY, and optional admin seed values.
pnpm install
pnpm --filter @ninted/api exec prisma migrate deploy
pnpm db:seed
pnpm dev:api
pnpm dev:web
```

The site is `http://localhost:3000`. The API is `http://127.0.0.1:4000`. The phone app reads `EXPO_PUBLIC_API_URL`.

```bash
pnpm test
```

## Documents

- [Architecture](docs/ARCHITECTURE.md)
- [Database](docs/DATABASE.md)
- [API](docs/API.md)
- [Screens and journeys](docs/SCREENS.md)
- [Security](docs/SECURITY.md)
- [Couriers and riders](docs/COURIERS.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Admin guide](docs/ADMIN_GUIDE.md)
- [Plan](docs/PLAN.md)
- [Tests](docs/TESTING.md)

## Decisions left to the owner

Do not treat this repository as a ruling on fees, the payment company, a courier contract, or whether a ledger hold is lawful escrow. Those need the owner’s commercial and legal approval. The software records the decision and applies it from an effective date.
