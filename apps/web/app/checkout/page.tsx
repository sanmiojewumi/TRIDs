'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { FeeSnapshot } from '@ninted/domain/fees';
import { formatNaira } from '@ninted/domain/money';
import { ApiError, api } from '@/lib/api';
import { Suspense } from 'react';

interface Address { id: string; recipient: string; line1: string; city: string; state: string }
interface Option { code: string; label: string; buyerPaysKobo: number; etaDays: number | null }

function CheckoutForm() {
  const params = useSearchParams();
  const sellerId = params.get('seller') || '';
  const [items, setItems] = useState<{ quantity: number; product: { id: string; title: string; seller: { id: string } } }[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [handover, setHandover] = useState('SELLER_ARRANGED');
  const [snapshot, setSnapshot] = useState<FeeSnapshot | null>(null);
  const [error, setError] = useState('');
  const [orderId, setOrderId] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    Promise.all([api<{ items: typeof items }>('/cart'), api<{ addresses: Address[] }>('/addresses')]).then(([cart, addressBook]) => {
      setItems(cart.items.filter((item) => item.product.seller.id === sellerId));
      setAddresses(addressBook.addresses);
      setAddressId(addressBook.addresses[0]?.id || '');
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load checkout'));
  }, [sellerId]);

  const lines = items.map((item) => ({ productId: item.product.id, quantity: item.quantity }));

  async function quote(state: string) {
    const result = await api<{ options: Option[] }>('/checkout/quotes', { method: 'POST', body: { sellerId, productIds: lines.map((line) => line.productId), state } });
    setOptions(result.options);
  }

  async function preview(nextHandover = handover, nextAddress = addressId) {
    const result = await api<{ snapshot: FeeSnapshot }>('/checkout/preview', {
      method: 'POST',
      body: { sellerId, lines, handover: nextHandover, addressId: nextAddress || undefined },
    });
    setSnapshot(result.snapshot);
  }

  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 56 }}>Checkout</h1>
      {error ? <div className="error">{error}</div> : null}
      {!items.length ? <div className="empty">Choose a seller from your basket.</div> : (
        <div className="split">
          <div className="stack panel">
            {items.map((item) => <div key={item.product.id}>{item.product.title} × {item.quantity}</div>)}
            <label className="field">Delivery address
              <select value={addressId} onChange={(event) => {
                setAddressId(event.target.value);
                const address = addresses.find((item) => item.id === event.target.value);
                if (address) quote(address.state).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'No quote'));
              }}>
                <option value="">Arrange without a saved address</option>
                {addresses.map((address) => <option key={address.id} value={address.id}>{address.recipient}, {address.line1}, {address.city}</option>)}
              </select>
            </label>
            <label className="field">Delivery option
              <select value={handover} onChange={(event) => { setHandover(event.target.value); preview(event.target.value).catch(() => undefined); }}>
                {[{ code: 'SELLER_ARRANGED', label: 'Arrange delivery with the seller', buyerPaysKobo: 0, etaDays: null }, ...options.filter((option) => option.code !== 'SELLER_ARRANGED')].map((option) => (
                  <option key={option.code} value={option.code}>{option.label} · {formatNaira(option.buyerPaysKobo)}</option>
                ))}
              </select>
            </label>
            <button className="btn light" onClick={() => preview().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not price this order'))}>Show fee breakdown</button>
            {snapshot ? (
              <div className="note">
                <p>Items {formatNaira(snapshot.itemsSubtotalKobo)}</p>
                <p>Buyer protection {formatNaira(snapshot.buyerProtectionKobo)}</p>
                <p>Delivery {formatNaira(snapshot.deliveryFeeKobo - snapshot.deliverySubsidyKobo)}</p>
                <p>Discount {formatNaira(snapshot.discountKobo)}</p>
                <strong>You pay {formatNaira(snapshot.buyerTotalKobo)}</strong>
                <p className="muted">These amounts were calculated from the commercial settings in force now. They will not change for this order after you place it. Seller commission is taken from the seller’s side and is not added again here.</p>
              </div>
            ) : null}
            <button className="btn" onClick={async () => {
              setError('');
              try {
                const order = await api<{ order: { id: string } }>('/checkout', {
                  method: 'POST',
                  body: { sellerId, lines, handover, addressId: addressId || undefined, idempotencyKey: `web-${sellerId}-${lines.map((line) => line.productId).join('-')}` },
                });
                setOrderId(order.order.id);
                try {
                  const payment = await api<{ authorizationUrl: string }>('/payments/initiate', { method: 'POST', body: { orderId: order.order.id } });
                  window.location.href = payment.authorizationUrl;
                } catch (reason) {
                  if (reason instanceof ApiError && reason.code === 'PAYMENT_UNCONFIGURED') {
                    setInfo('The order is saved and waiting for payment. No charge was created because the payment provider is not configured.');
                  } else {
                    throw reason;
                  }
                }
              } catch (reason) {
                setError(reason instanceof Error ? reason.message : 'Checkout failed');
              }
            }}>Place order</button>
            {info ? <div className="note">{info} {orderId ? <a href={`/orders/${orderId}`}>View order</a> : null}</div> : null}
          </div>
        </div>
      )}
    </>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<div className="empty">Loading checkout…</div>}><CheckoutForm /></Suspense>;
}
