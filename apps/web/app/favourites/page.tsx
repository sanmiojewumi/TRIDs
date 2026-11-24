'use client';

import { useEffect, useState } from 'react';
import { ProductCard, type CardProduct } from '@/components/ProductCard';
import { api } from '@/lib/api';

export default function FavouritesPage() {
  const [products, setProducts] = useState<CardProduct[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ products: CardProduct[] }>('/favorites').then((data) => setProducts(data.products)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Sign in to see favourites'));
  }, []);
  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)' }}>Favourites</h1>
      {error ? <div className="error">{error}</div> : null}
      {!products.length && !error ? <div className="empty">Save pieces from a listing to find them later.</div> : null}
      <div className="grid">{products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </>
  );
}
