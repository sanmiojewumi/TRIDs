'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { FeeSnapshot } from '@ninted/domain/fees';
import { formatNaira } from '@ninted/domain/money';
import { api } from '@/lib/api';

interface OrderPayload {
  id: string;
  status: string;
  buyerTotalKobo: number;
  feeSnapshot: FeeSnapshot;
  items: { title: string; quantity: number; unitPriceKobo: number }[];
  shipment: { status: string; serviceLabel: string; trackingNumber: string | null; failureReason: string | null; events: { id: string; status: string; note: string | null; source: string; createdAt: string }[] } | null;
  payments: { status: string; reference: string }[];
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderPayload | null>(null);
  const [message, setMessage] = useState('');
  function load() {
    api<{ order: OrderPayload }>(`/orders/${params.id}`).then((data) => setOrder(data.order)).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not load order'));
  }
  useEffect(load, [params.id]);
  if (!order) return <div className="empty">{message || 'Loading order…'}</div>;
  return (
    <div className="stack">
      <h1 style={{ fontFamily: 'var(--serif)' }}>Order {order.id.slice(-6)}</h1>
      <p className="pill">{order.status}</p>
      {order.items.map((item) => <p key={item.title}>{item.title} × {item.quantity} · {formatNaira(item.unitPriceKobo)}</p>)}
      <div className="note">
        <p>Snapshotted total {formatNaira(order.feeSnapshot.buyerTotalKobo)}</p>
        <p>Protection {formatNaira(order.feeSnapshot.buyerProtectionKobo)} · Delivery {formatNaira(order.feeSnapshot.deliveryFeeKobo - order.feeSnapshot.deliverySubsidyKobo)}</p>
        <p className="muted">Priced at {new Date(order.feeSnapshot.pricedAt).toLocaleString('en-NG')}. Later changes to platform fees do not alter this order.</p>
      </div>
      <section className="panel">
        <h2>Tracking</h2>
        {order.shipment ? (
          <>
            <p>{order.shipment.serviceLabel} · {order.shipment.status}</p>
            <p>{order.shipment.trackingNumber ? `Tracking ${order.shipment.trackingNumber}` : 'No courier tracking number yet. Status changes only when a seller, courier or logistics admin records them.'}</p>
            {order.shipment.failureReason ? <p>{order.shipment.failureReason}</p> : null}
            {order.shipment.events.map((event) => <p key={event.id} className="muted">{new Date(event.createdAt).toLocaleString('en-NG')} · {event.source} · {event.status} {event.note || ''}</p>)}
          </>
        ) : <p>No shipment record.</p>}
      </section>
      {message ? <div className="note">{message}</div> : null}
      {order.status === 'PENDING_PAYMENT' ? <button className="btn light" onClick={() => api(`/orders/${order.id}/cancel`, { method: 'POST' }).then(load)}>Cancel unpaid order</button> : null}
      {order.status === 'DISPATCHED' ? <button className="btn" onClick={() => api(`/orders/${order.id}/received`, { method: 'POST' }).then(load)}>I have received this</button> : null}
      {['DELIVERED', 'COMPLETED'].includes(order.status) ? (
        <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          api(`/orders/${order.id}/review`, { method: 'POST', body: { rating: Number(data.get('rating')), comment: data.get('comment') } }).then(() => setMessage('Review saved.')).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not review'));
        }}>
          <label className="field">Rating<input name="rating" type="number" min={1} max={5} required /></label>
          <label className="field">Comment<textarea name="comment" required /></label>
          <button className="btn" type="submit">Review seller</button>
        </form>
      ) : null}
      {['DELIVERED', 'DISPATCHED', 'COMPLETED'].includes(order.status) ? (
        <form className="stack panel" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          api(`/orders/${order.id}/returns`, { method: 'POST', body: { reason: data.get('reason'), details: data.get('details') } }).then(() => { setMessage('Return request sent.'); load(); }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not open a return'));
        }}>
          <h2>Request a return</h2>
          <select name="reason" defaultValue="NOT_AS_DESCRIBED">
            <option value="NOT_AS_DESCRIBED">Not as described</option>
            <option value="WRONG_ITEM">Wrong item</option>
            <option value="DAMAGED">Damaged</option>
            <option value="MISSING_COMPONENTS">Missing components</option>
            <option value="SUSPECTED_COUNTERFEIT">Suspected counterfeit</option>
            <option value="OTHER">Other</option>
          </select>
          <textarea name="details" required placeholder="What happened?" />
          <button className="btn" type="submit">Submit return</button>
        </form>
      ) : null}
    </div>
  );
}
