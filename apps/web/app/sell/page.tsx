'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatNaira } from '@ninted/domain/money';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function SellPage() {
  const { user } = useSession();
  const [products, setProducts] = useState<{ id: string; title: string; status: string; priceKobo: number }[]>([]);
  const [offers, setOffers] = useState<{ id: string; amountKobo: number; status: string; buyer: string; product: { title: string } }[]>([]);
  const [storeName, setStoreName] = useState('');
  useEffect(() => {
    if (!user?.seller) return;
    api<{ products: typeof products }>('/seller/products').then((data) => setProducts(data.products)).catch(() => undefined);
    api<{ offers: typeof offers }>('/seller/offers').then((data) => setOffers(data.offers)).catch(() => undefined);
  }, [user]);
  if (!user) return <div className="empty"><Link href="/login">Sign in</Link> to sell.</div>;
  if (!user.seller) {
    return (
      <form className="panel stack" onSubmit={(event) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        api<{ user: typeof user }>('/seller/profile', { method: 'POST', body: data }).then(() => window.location.reload());
      }}>
        <h1 style={{ fontFamily: 'var(--serif)' }}>Open a seller profile</h1>
        <p className="muted">The same account keeps buying. Selling is an extra profile, not a second login.</p>
        <label className="field">Store name<input name="storeName" value={storeName} onChange={(event) => setStoreName(event.target.value)} required /></label>
        <label className="field">Type
          <select name="type" defaultValue="INDIVIDUAL"><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select>
        </label>
        <label className="field">City<input name="city" required /></label>
        <label className="field">State<input name="state" required placeholder="Lagos" /></label>
        <button className="btn" type="submit">Start selling</button>
      </form>
    );
  }
  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ fontFamily: 'var(--serif)' }}>{user.seller.storeName}</h1>
        <span className="row">
          <Link className="btn light" href={`/seller/${user.id}`}>View shop</Link>
          <Link className="btn" href="/sell/new">New listing</Link>
        </span>
      </div>
      <p className="muted">Verification: {user.seller.verification}. Rating {user.seller.ratingCount ? user.seller.ratingAvg.toFixed(1) : 'not yet'}.</p>
      <div className="row">
        <Link href="/sell/orders">Orders</Link>
        <Link href="/sell/earnings">Earnings</Link>
      </div>
      {!products.length ? <div className="empty">No listings yet.</div> : (
        <table>
          <thead><tr><th>Item</th><th>Price</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td>{product.title}</td>
                <td>{formatNaira(product.priceKobo)}</td>
                <td>{product.status}</td>
                <td className="row">
                  {product.status === 'ACTIVE' ? <button className="btn light" onClick={() => api(`/products/${product.id}/pause`, { method: 'POST' }).then(() => location.reload())}>Pause</button> : null}
                  {product.status === 'PAUSED' ? <button className="btn light" onClick={() => api(`/products/${product.id}/relist`, { method: 'POST' }).then(() => location.reload())}>Relist</button> : null}
                  <button className="btn light" onClick={() => api(`/products/${product.id}`, { method: 'DELETE' }).then(() => location.reload())}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2>Offers</h2>
      {!offers.length ? <p className="muted">No offers yet.</p> : offers.map((offer) => (
        <div key={offer.id} className="row panel">
          <span>{offer.buyer} offered {formatNaira(offer.amountKobo)} for {offer.product.title} · {offer.status}</span>
          {offer.status === 'PENDING' ? (
            <span className="row">
              <button className="btn" onClick={() => api(`/offers/${offer.id}/respond`, { method: 'POST', body: { action: 'accept' } }).then(() => location.reload())}>Accept</button>
              <button className="btn light" onClick={() => api(`/offers/${offer.id}/respond`, { method: 'POST', body: { action: 'decline' } }).then(() => location.reload())}>Decline</button>
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
