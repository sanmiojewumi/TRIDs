# Screens and journeys

## Web

Home, browse, listing, seller profile, basket, checkout, payment callback, orders, order detail, favourites, inbox, account, sell desk, new listing, seller orders, earnings, admin home, commercial settings, listing moderation, orders and returns, payouts, policies.

## Phone

Home, listing, sign in / register, basket, orders, account. Android, iOS and iPad share this screen set. Rider duty is on the API and can be added to this same app when phase 2 is enabled.

## Buyer

```mermaid
flowchart TD
  browse[Browse or search] --> listing[Listing]
  listing --> basket[Basket]
  basket --> quote[Delivery quote]
  quote --> preview[Fee snapshot]
  preview --> order[Pending order]
  order --> pay[Provider page]
  pay --> verify[Server verify]
  verify --> dispatch[Seller dispatch]
  dispatch --> received[Buyer confirms delivery]
  received --> review[Review]
  received --> ret[Return request]
```

## Owner changes a fee

```mermaid
flowchart TD
  admin[Admin sets rate and effective date] --> audit[Audit row]
  admin --> future[Applies only at that date]
  old[Existing order] --> snap[Keeps its snapshot]
```

## Seller

Register or add a seller profile, submit last-four NIN, wait for verification, publish, answer offers and messages, dispatch paid orders, read the ledger, request a payout. The payout stays pending until finance records a bank reference.
