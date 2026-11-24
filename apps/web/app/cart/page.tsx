'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatNaira } from '@ninted/domain/money';
import { api } from '@/lib/api';
import type { CardProduct } from '@/components/ProductCard';

export default function CartPage() {
  const [items, setItems] = useState<{ quantity: number; product: CardProduct & { seller: { id: string; storeName?: string } } }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ items: typeof items }>('/cart').then((data) => setItems(data.items)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Sign in to see your basket'));
  }, []);
  const groups = new Map<string, typeof items>();
  for (const item of items) {
    const key = item.product.seller.id;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 56 }}>Basket</h1>
      {error ? <div className="error">{error}</div> : null}
      {!error && !items.length ? <div className="empty">Your basket is empty.</div> : null}
      {[...groups.entries()].map(([sellerId, rows]) => (
        <section key={sellerId} className="panel section stack">
          <strong>{rows[0]?.product.seller.storeName || 'Seller'}</strong>
          {rows.map((row) => (
            <div key={row.product.id} className="row">
              <span>{row.product.title} × {row.quantity}</span>
              <span>{formatNaira(row.product.priceKobo * row.quantity)}</span>
              <button className="btn light" onClick={() => api(`/cart/${row.product.id}`, { method: 'DELETE' }).then(() => setItems((current) => current.filter((item) => item.product.id !== row.product.id)))}>Remove</button>
            </div>
          ))}
          <Link className="btn" href={`/checkout?seller=${sellerId}`}>Checkout this seller</Link>
        </section>
      ))}
    </>
  );
}
