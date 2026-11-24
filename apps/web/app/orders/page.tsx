'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatNaira } from '@ninted/domain/money';
import { api } from '@/lib/api';

export default function OrdersPage() {
  const [orders, setOrders] = useState<{ id: string; status: string; buyerTotalKobo: number; items: { title: string }[] }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ orders: typeof orders }>('/orders').then((data) => setOrders(data.orders)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Sign in to see orders'));
  }, []);
  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)' }}>Your orders</h1>
      {error ? <div className="error">{error}</div> : null}
      {!orders.length && !error ? <div className="empty">You have not placed an order yet.</div> : null}
      <div className="stack">
        {orders.map((order) => (
          <Link key={order.id} href={`/orders/${order.id}`} className="panel row">
            <span>{order.items.map((item) => item.title).join(', ')}</span>
            <span>{formatNaira(order.buyerTotalKobo)}</span>
            <span className="pill">{order.status}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
