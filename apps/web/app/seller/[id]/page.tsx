import { ItemRail, type CardProduct } from '@/components/ProductCard';
import { serverGet } from '@/lib/server';

export const dynamic = 'force-dynamic';

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await serverGet<{
    seller: { storeName: string; bio: string; city: string | null; state: string | null; type: string; verification: string; ratingAvg: number; ratingCount: number; itemCount?: number; openedAt?: string };
    products: CardProduct[];
  }>(`/sellers/${id}`);
  if (!data) return <div className="empty">This shop is not open yet.</div>;
  const place = [data.seller.city, data.seller.state].filter(Boolean).join(', ');
  return (
    <>
      <section className="shop">
        <p className="kicker">{data.seller.type === 'BUSINESS' ? 'Business shop' : 'Member shop'} · {data.seller.verification}</p>
        <h1 style={{ fontFamily: 'var(--serif)', fontSize: 'clamp(42px, 6vw, 72px)', margin: '0 0 8px' }}>{data.seller.storeName}</h1>
        <p>{data.seller.bio || 'This shop has not added a description yet.'}</p>
        <p className="muted">
          {place || 'Nigeria'}
          {' · '}
          {data.products.length} {data.products.length === 1 ? 'item' : 'items'}
          {data.seller.ratingCount ? ` · ${data.seller.ratingAvg.toFixed(1)} from ${data.seller.ratingCount} reviews` : ' · No reviews yet'}
        </p>
      </section>
      {data.products.length ? <ItemRail title="In this shop" products={data.products} /> : <div className="empty">This shop has no items for sale yet.</div>}
    </>
  );
}
