# Deployment

Use three environments: development, staging, production. Do not point staging at the live Paystack secret.

## Production pieces

- Node.js 22
- PostgreSQL 16 with backups and point-in-time recovery
- The API process: `pnpm --filter @ninted/api start`
- The web process: `pnpm --filter @ninted/web build && pnpm --filter @ninted/web start`
- TLS in front of both
- Object storage when you outgrow local disk. The API storage interface is the place to add S3. Until then, public images live under `apps/api/uploads` and are served at `/media/public/...`.
- `SMTP_URL` for email. Without it, email rows are stored as `SKIPPED_UNCONFIGURED` and in-app notifications still exist.
- `SMS_HTTP_URL` and `PUSH_HTTP_URL` the same way. No SMS is marked sent unless that call succeeds.
- Store builds for Android, iOS and iPad from `apps/mobile` with EAS. Set `EXPO_PUBLIC_API_URL` to the public API.

## Required environment

See `.env.example`. The process refuses to boot without `DATABASE_URL`, `ACCESS_TOKEN_SECRET` (32+ characters) and `SECRET_ENCRYPTION_KEY` (64 hex characters).

`PAYMENT_PROVIDER` is `paystack` or `flutterwave`. Leave the secret empty until the owner approves that provider. The site keeps taking orders as unpaid rather than simulating payment.

## Release

```bash
pnpm install
pnpm --filter @ninted/api exec prisma migrate deploy
pnpm --filter @ninted/web build
```

Run `pnpm test` against a scratch database first. Seed an owner with `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`, then turn on multi-factor authentication and remove any demo seed.

## Recovery

Take a database dump before each migration. Restore by creating a new database and running `pg_restore`, then point `DATABASE_URL` at it. Images need the same backup if they are still on disk. Payment state can be rebuilt from the provider dashboard plus `payment.reference`; do not mark rows successful by hand unless the provider verify API agrees.
