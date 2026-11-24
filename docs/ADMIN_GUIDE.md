# Administrator guide

Sign in as the super admin, open Account, and turn on multi-factor authentication. Admin pages stay closed until that is done.

## Roles

- Support can read users and orders and handle disputes.
- Moderators can approve listings, suspend users and edit policies.
- Finance can change commercial rates, read payments, refund, and record payouts.
- Logistics can manage couriers, shipment notes and, in phase 2, riders.
- Super admin can do all of that, including creating staff.

Create staff from the API `POST /admin/staff` until a dedicated screen is added. Give each person their own login. Do not share the owner password.

## Fees

Open Administration → Commercial settings.

Rates use basis points for percentages. `1000` is 10%. Fixed charges are kobo. `150000` kobo is ₦1,500.

Every change needs a reason and an effective time. You cannot backdate a rate by more than a few minutes, and you cannot insert a rate before one that already starts later. Orders already placed keep the numbers shown on the order.

Leave a charge unset if you have not decided it. Unset means zero, not a hidden default.

Coupons must say whether the platform or the seller funds them. That choice changes the seller’s net and the ledger.

Delivery prices are a JSON rate card on `DELIVERY_RATE_CARD`. See `docs/COURIERS.md`.

## Listings

New sellers are reviewed until you mark them verified. A verified seller’s ordinary listings go live. A prohibited term holds the listing even for a verified seller. Approve or reject from Administration → Listings.

## Money

Payout requests do not move cash. When you have sent the bank transfer, enter that reference and mark the payout paid. The ledger then reduces what the seller is owed.

Refunds require a return that you have set to refund approved, and a successful provider refund. If the provider says the refund is still pending, the order is not marked refunded.

Reconciliation on the payouts page compares successful payments and recorded payouts or refunds with the clearing account. Investigate any line it prints. Do not “fix” it by editing a payment to successful.

## Policies

The seeded buyer, returns and privacy texts are drafts. Replace them after counsel reviews them. They are edited with `POST /admin/policies`.
