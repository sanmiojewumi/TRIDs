'use client';

import { useEffect, useState } from 'react';
import { formatNaira } from '@ninted/domain/money';
import { api } from '@/lib/api';

interface SellerOrder { id: string; status: string; buyerTotalKobo: number; sellerNetKobo: number; commissionKobo: number; items: { title: string }[] }

export default function SellerOrdersPage() {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [error, setError] = useState('');
  function load() {
    api<{ orders: SellerOrder[] }>('/seller/orders').then((data) => setOrders(data.orders)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load orders'));
  }
  useEffect(load, []);
  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)' }}>Sales</h1>
      {error ? <div className="error">{error}</div> : null}
      {!orders.length ? <div className="empty">No sales yet.</div> : (
        <table>
          <thead><tr><th>Order</th><th>Items</th><th>Buyer paid</th><th>Your net</th><th>Commission</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>{order.id.slice(-6)}</td>
                <td>{order.items.map((item) => item.title).join(', ')}</td>
                <td>{formatNaira(order.buyerTotalKobo)}</td>
                <td>{formatNaira(order.sellerNetKobo)}</td>
                <td>{formatNaira(order.commissionKobo)}</td>
                <td>{order.status}</td>
                <td>{order.status === 'AWAITING_DISPATCH' ? <button className="btn" onClick={() => api(`/orders/${order.id}/dispatch`, { method: 'POST' }).then(load)}>Mark dispatched</button> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
