# Couriers and the rider network

Ninted does not invent a private courier API. An enabled provider must implement this contract. A thin adapter can map GIG, Sendbox, Kwik, Shipbubble or another aggregator onto it after the owner has API access and a contract.

## Quote

`POST {baseUrl}/ninted/quotes`

```json
{
  "pickup": { "state": "Lagos", "city": "Yaba", "line1": "", "recipient": "", "phone": "" },
  "dropoff": { "state": "FCT", "city": "Abuja", "line1": "", "recipient": "", "phone": "" },
  "parcel": { "weightGrams": 800 }
}
```

Response:

```json
{ "quotes": [{ "serviceCode": "standard", "label": "Standard", "feeKobo": 250000, "etaDays": 3 }] }
```

## Book, cancel, track

`POST {baseUrl}/ninted/bookings` with `orderId`, `serviceCode`, pickup, dropoff and parcel.

```json
{ "booking": { "providerBookingId": "abc", "trackingNumber": "TRK1", "waybill": "WB1" } }
```

`POST {baseUrl}/ninted/cancel` with `{ "providerBookingId" }`.

`GET {baseUrl}/ninted/track?number=`

Authorization is `Bearer` the key saved in admin. The key is encrypted at rest. If the call fails, the option is omitted or the shipment keeps `failureReason`. Status is not invented.

The platform rate card is separate. It is the JSON value of `DELIVERY_RATE_CARD`:

```json
{
  "subsidyKobo": 0,
  "subsidyBps": 0,
  "lanes": [
    { "from": "Lagos", "to": "Lagos", "baseKobo": 150000, "perKgKobo": 20000, "etaDays": 1 }
  ]
}
```

`DELIVERY_RANKING` may be `{ "priority": "COST" }` or `{ "priority": "SPEED" }`. Without a row, options are ordered by price.

## Phase 2 riders

Set `PHASE2_LOGISTICS=true` and save `INTERNAL_RIDER_RATE_CARD` in the same lane shape. Optional `riderShareBps` on a lane is the rider’s share of that quote. If it is absent, the job is created with zero earnings and dispatch can see that pay was not configured.

Jobs are offered to approved, available riders in the pickup state. The first accept wins. Pickup and delivery each require the PIN that was given to the buyer. GPS points are stored only when the rider app sends them.
