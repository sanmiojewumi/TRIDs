import { ProductCard, type CardProduct } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';
import { serverGet } from '@/lib/server';

export default async function SellerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await serverGet<{ seller: { storeName: string; bio: string; city: string | null; state: string | null; type: string; verification: string; ratingAvg: number; ratingCount: number }; products: CardProduct[] }>(`/sellers/${id}`);
  if (!data) return <div className="empty">Seller not found.</div>;
  return (
    <>
      <p className="kicker">{data.seller.type} · {data.seller.verification}</p>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 64, marginTop: 0 }}>{data.seller.storeName}</h1>
      <p>{data.seller.bio || 'This seller has not written a bio yet.'}</p>
      <p className="muted">{data.seller.city} {data.seller.state} · {data.seller.ratingCount ? `${data.seller.ratingAvg.toFixed(1)} from ${data.seller.ratingCount} reviews` : 'No reviews yet'}</p>
      <div className="grid">{data.products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </>
  );
}
