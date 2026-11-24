# Database

PostgreSQL via Prisma. The schema is `apps/api/prisma/schema.prisma`. Money is integer kobo. A single price cannot exceed ₦20,000,000 because the column is a 32-bit integer. That is enough for fashion and phones; a later migration can widen it for vehicles.

## Main tables

- `User`, `UserRole`, `SellerProfile`, `Address`, `BankAccount`, `RefreshToken`
- `Category`, `Product`, `ProductImage`, `Favorite`, `CartItem`, `Offer`
- `CommercialSetting` append-only rates with `effectiveFrom` and `effectiveTo`
- `Coupon`, `Promotion`, `Subscription`
- `Order`, `OrderItem`, `OrderEvent` with `feeSnapshot` JSON
- `Payment`, `Refund`, `LedgerEntry`, `Payout`, `WebhookEvent`, `FraudFlag`
- `Shipment`, `ShipmentEvent`, `CourierProvider`
- `ReturnRequest`, `ReturnEvent`, `Review`
- `Conversation`, `Message`, `Notification`, `AuditLog`, `PlatformPolicy`, `ProhibitedTerm`
- Phase 2: `Rider`, `RiderDocument`, `DeliveryJob`, `JobPing`, `JobPhoto`

`CommercialSetting` rows are not updated in place except to close the previous open window. Orders point at the calculated snapshot, not at the setting row, so a future rate cannot rewrite history.

Stock uses `quantity` and `reserved`. Checkout increments `reserved` only when the available quantity allows it. A verified payment decrements both. Cancelling an unpaid order releases the reservation. Unpaid orders with no in-flight payment expire after 30 minutes.

## Migration

```bash
pnpm --filter @ninted/api exec prisma migrate deploy
```

The initial SQL is in `apps/api/prisma/migrations`.
