import Link from 'next/link';

export const dynamic = 'force-dynamic';
import { ItemRail, type CardProduct } from '@/components/ProductCard';
import { serverGet } from '@/lib/server';

interface HomeData {
  featured: CardProduct[];
  arrivals: CardProduct[];
  trending: CardProduct[];
  categories: { slug: string; name: string; children: { slug: string; name: string }[] }[];
  sellers: { id: string; storeName: string; city: string | null; state: string | null; ratingAvg: number; ratingCount: number }[];
  promotions: { id: string; title: string; body: string }[];
}

export default async function HomePage() {
  const data = await serverGet<HomeData>('/home');
  const featured = data?.featured || [];
  const featuredIds = new Set(featured.map((product) => product.id));
  const arrivals = (data?.arrivals || []).filter((product) => !featuredIds.has(product.id));
  const shown = new Set([...featuredIds, ...arrivals.map((product) => product.id)]);
  const trending = (data?.trending || []).filter((product) => !shown.has(product.id));
  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Nigeria’s considered marketplace</p>
          <h1>Preloved, properly.</h1>
          <p>Buy and sell new and pre-owned pieces with fees that are set by the platform owner and locked to each order.</p>
        </div>
        <div className="panel stack">
          <strong>Start with a category</strong>
          <div className="chips">
            {(data?.categories || []).map((category) => (
              <Link key={category.slug} className="chip" href={`/browse?category=${category.slug}`}>{category.name}</Link>
            ))}
          </div>
          <Link className="btn" href="/sell/new">List an item</Link>
        </div>
      </section>
      {!data ? <div className="empty">The marketplace API is not reachable yet. Start it, then refresh this page.</div> : null}
      {data?.promotions.map((promotion) => (
        <section key={promotion.id} className="panel section">
          <p className="kicker">Campaign</p>
          <h2>{promotion.title}</h2>
          <p>{promotion.body}</p>
        </section>
      ))}
      <ItemRail title="Featured" products={featured} />
      <ItemRail title="New arrivals" products={arrivals} />
      <ItemRail title="Trending" products={trending} />
      {data && !featured.length && !arrivals.length ? <div className="empty">No listings yet. When sellers publish, they show up here.</div> : null}
      {data?.sellers.length ? (
        <section className="section">
          <h2>Featured sellers</h2>
          <div className="sellers">
            {data.sellers.map((seller) => (
              <Link key={seller.id} href={`/seller/${seller.id}`} className="seller">
                <span>{seller.ratingCount ? seller.ratingAvg.toFixed(1) : 'New'}</span>
                <h3>{seller.storeName}</h3>
                <p>{seller.city} {seller.state}</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
