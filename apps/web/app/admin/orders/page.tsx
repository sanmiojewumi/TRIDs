'use client';

import { useEffect, useState } from 'react';
import { formatNaira } from '@ninted/domain/money';
import { api } from '@/lib/api';

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<{ id: string; status: string; buyerTotalKobo: number; shipment: { id: string; status: string } | null }[]>([]);
  const [returns, setReturns] = useState<{ id: string; reason: string; status: string; details: string }[]>([]);
  const [message, setMessage] = useState('');
  function load() {
    api<{ orders: typeof orders }>('/admin/orders').then((data) => setOrders(data.orders)).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not load'));
    api<{ returns: typeof returns }>('/admin/returns').then((data) => setReturns(data.returns)).catch(() => undefined);
  }
  useEffect(load, []);
  return (
    <div className="stack">
      <h1 style={{ fontFamily: 'var(--serif)' }}>Orders and returns</h1>
      {message ? <div className="error">{message}</div> : null}
      {orders.map((order) => (
        <div key={order.id} className="row">
          <span>{order.id.slice(-6)} · {order.status} · {formatNaira(order.buyerTotalKobo)}</span>
          {order.shipment ? <button className="btn light" onClick={() => {
            const note = window.prompt('What did the courier report?');
            if (!note || !order.shipment) return;
            api(`/admin/shipments/${order.shipment.id}/status`, { method: 'POST', body: { status: 'IN_TRANSIT', note } }).then(() => setMessage('Shipment note recorded.'));
          }}>Record courier update</button> : null}
        </div>
      ))}
      <h2>Returns</h2>
      {returns.map((item) => (
        <div key={item.id} className="panel">
          <strong>{item.reason}</strong> · {item.status}
          <p>{item.details}</p>
          <button className="btn" onClick={() => api(`/admin/returns/${item.id}/decision`, { method: 'POST', body: { status: 'REFUND_APPROVED', note: 'Approved after review' } }).then(load)}>Approve refund</button>
          <button className="btn light" onClick={() => api(`/admin/returns/${item.id}/decision`, { method: 'POST', body: { status: 'REJECTED', note: 'Does not meet the return policy' } }).then(load)}>Reject</button>
        </div>
      ))}
    </div>
  );
}
