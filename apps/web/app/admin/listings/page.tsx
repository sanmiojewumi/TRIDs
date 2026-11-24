'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export default function ListingsAdminPage() {
  const [products, setProducts] = useState<{ id: string; title: string; status: string; moderationNote?: string | null }[]>([]);
  const [message, setMessage] = useState('');
  function load() {
    api<{ products: typeof products }>('/admin/listings').then((data) => setProducts(data.products)).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not load listings'));
  }
  useEffect(load, []);
  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)' }}>Listings</h1>
      {message ? <div className="error">{message}</div> : null}
      <table>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.title}<div className="muted">{product.moderationNote}</div></td>
              <td>{product.status}</td>
              <td>
                <button className="btn" onClick={() => api(`/admin/listings/${product.id}/moderate`, { method: 'POST', body: { status: 'ACTIVE' } }).then(load)}>Approve</button>
                <button className="btn light" onClick={() => api(`/admin/listings/${product.id}/moderate`, { method: 'POST', body: { status: 'REJECTED', reason: 'Does not meet marketplace rules' } }).then(load)}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
