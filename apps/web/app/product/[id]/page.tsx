'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatNaira } from '@ninted/domain/money';
import { Artwork } from '@/components/ProductCard';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface ProductDetail {
  id: string;
  title: string;
  description: string;
  priceKobo: number;
  condition: string;
  brand?: string | null;
  size?: string | null;
  colour?: string | null;
  city: string;
  state: string;
  offersEnabled: boolean;
  available: number;
  images: { url: string }[];
  seller: { id: string; storeName?: string; ratingAvg?: number; ratingCount?: number; verification?: string };
  category: { name: string } | null;
  createdAt: string;
}

export default function ProductPage() {
  const params = useParams<{ id: string }>();
  const { user } = useSession();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [reviews, setReviews] = useState<{ id: string; rating: number; comment: string; reviewer: string }[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ product: ProductDetail; reviews: typeof reviews }>(`/products/${params.id}`)
      .then((data) => {
        setProduct(data.product);
        setReviews(data.reviews);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load listing'));
  }, [params.id]);

  async function act(task: () => Promise<unknown>, success: string) {
    setError('');
    try {
      await task();
      setMessage(success);
    } catch (reason) {
      setMessage('');
      setError(reason instanceof ApiError ? reason.message : 'Something went wrong');
    }
  }

  if (!product) return <div className="empty">{error || 'Loading listing…'}</div>;
  return (
    <div className="split">
      <div className="gallery">
        <Artwork seed={product.id} label={product.brand || product.condition} image={product.images[0]?.url} />
        <div className="chips">{product.images.slice(1).map((image) => <img key={image.url} src={image.url} alt="" style={{ width: 88, height: 88, objectFit: 'cover', borderRadius: 12 }} />)}</div>
      </div>
      <div className="stack">
        <p className="kicker">{product.category?.name} · Listed {new Date(product.createdAt).toLocaleDateString('en-NG')}</p>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 52, margin: 0 }}>{product.title}</h1>
        <strong className="price" style={{ fontSize: 28 }}>{formatNaira(product.priceKobo)}</strong>
        <p>{product.description}</p>
        <p className="muted">{product.brand || 'Unbranded'} · {product.size || 'One size'} · {product.colour || 'Colour not set'} · {product.condition.replaceAll('_', ' ').toLowerCase()}</p>
        <p className="muted">{product.city}, {product.state} · {product.available} available</p>
        <Link href={`/seller/${product.seller.id}`}>{product.seller.storeName} · {product.seller.verification} · {product.seller.ratingCount ? `${product.seller.ratingAvg?.toFixed(1)} (${product.seller.ratingCount})` : 'No reviews yet'}</Link>
        {error ? <div className="error">{error}</div> : null}
        {message ? <div className="note">{message}</div> : null}
        {user ? (
          <div className="row">
            <button className="btn" onClick={() => act(() => api('/cart', { method: 'POST', body: { productId: product.id, quantity: 1 } }), 'Added to your basket.')}>Add to basket</button>
            <button className="btn light" onClick={() => act(() => api(`/favorites/${product.id}`, { method: 'POST' }), 'Saved to favourites.')}>Favourite</button>
          </div>
        ) : <Link className="btn" href="/login">Sign in to buy</Link>}
        {user && product.offersEnabled ? (
          <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const amount = new FormData(event.currentTarget).get('amount');
            act(() => api('/offers', { method: 'POST', body: { productId: product.id, amountNaira: Number(amount) } }), 'Offer sent to the seller.');
          }}>
            <label className="field">Make an offer (₦)<input name="amount" type="number" min="1" required /></label>
            <button className="btn lime" type="submit">Send offer</button>
          </form>
        ) : null}
        {user ? (
          <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const body = String(new FormData(event.currentTarget).get('body') || '');
            act(() => api('/conversations', { method: 'POST', body: { sellerId: product.seller.id, productId: product.id, body } }), 'Message sent.');
          }}>
            <label className="field">Message the seller<textarea name="body" required minLength={2} /></label>
            <button className="btn light" type="submit">Send</button>
          </form>
        ) : null}
        <section>
          <h2>Seller reviews</h2>
          {!reviews.length ? <p className="muted">No reviews yet.</p> : reviews.map((review) => (
            <p key={review.id}><strong>{review.rating}/5</strong> {review.comment} <span className="muted">— {review.reviewer}</span></p>
          ))}
        </section>
      </div>
    </div>
  );
}
