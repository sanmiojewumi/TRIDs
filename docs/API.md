# API

Base URL in development: `http://127.0.0.1:4000`. The website calls the same routes through `/backend`.

Authenticated calls use `Authorization: Bearer`. Cookie sessions also work for the website. Cookie mutations must send `x-ninted-client: web`.

Errors are `{ "message", "code" }`. Important codes: `MFA_REQUIRED`, `PAYMENT_UNCONFIGURED`, `CSRF`.

## Accounts

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create a buyer, or a buyer who also sells |
| POST | `/auth/login` | Password, plus TOTP when enabled |
| POST | `/auth/refresh` | Rotate refresh token |
| POST | `/auth/logout` | Revoke refresh token |
| GET | `/auth/me` | Current user |
| POST | `/auth/mfa/setup` | Start TOTP |
| POST | `/auth/mfa/confirm` | Enable TOTP |
| POST | `/seller/profile` | Add selling to an existing account |

## Catalogue

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/home` | Featured, new, trending, categories, sellers, campaigns |
| GET | `/products` | `q`, `category`, `brand`, `size`, `condition`, `state`, `colour`, `min`, `max`, `sort` |
| GET | `/products/:id` | Listing and seller reviews |
| POST | `/products` | Create listing |
| PATCH | `/products/:id` | Edit listing |
| POST | `/products/:id/images` | Multipart image |
| POST | `/products/:id/pause` | Pause |
| POST | `/products/:id/relist` | Relist |
| DELETE | `/products/:id` | Remove |
| POST | `/favorites/:productId` | Save |
| GET | `/cart` | Basket |
| POST | `/offers` | Make an offer |
| POST | `/offers/:id/respond` | `accept`, `decline`, `counter` |

## Checkout and money

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/checkout/quotes` | Delivery options |
| POST | `/checkout/preview` | Fee snapshot, no stock change |
| POST | `/checkout` | Create order. Send `idempotencyKey` |
| POST | `/payments/initiate` | Provider authorization URL |
| POST | `/payments/verify` | Server-side verify |
| POST | `/payments/webhooks/paystack` | `x-paystack-signature` HMAC SHA512 |
| POST | `/payments/webhooks/flutterwave` | `verif-hash`, then verify |
| GET | `/orders` | Buyer history |
| GET | `/orders/:id` | Detail, snapshot, shipment events |
| POST | `/orders/:id/returns` | Return / dispute |
| POST | `/seller/payouts` | Request a ledger payout |
| POST | `/seller/subscription` | Pay the owner-set subscription price |
| POST | `/products/:id/feature` | Pay the owner-set featuring price |

## Admin

Staff routes require the matching permission and TOTP.

`/admin/summary`, `/admin/reports`, `/admin/reconciliation`, `/admin/commercial-settings`, `/admin/coupons`, `/admin/promotions`, `/admin/users`, `/admin/staff`, `/admin/listings`, `/admin/orders`, `/admin/payments`, `/admin/payouts/:id/decision`, `/admin/returns`, `/admin/refunds`, `/admin/couriers`, `/admin/shipments/:id/status`, `/admin/policies`, `/admin/audit`, `/admin/fraud`, `/admin/prohibited-terms`, `/admin/sellers/:id/verification`.

## Phase 2

When `PHASE2_LOGISTICS=true`: `/riders/apply`, `/riders/me/availability`, `/riders/me/jobs`, `/riders/jobs/:id/accept`, `/pickup`, `/deliver`, `/location`, `/admin/riders`, `/orders/:id/tracking`.

`GET /config/public` reports whether payments and phase 2 are actually switched on.
