import { ProductCard, type CardProduct } from '@/components/ProductCard';

export const dynamic = 'force-dynamic';
import { serverGet } from '@/lib/server';

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const data = await serverGet<{ products: CardProduct[] }>(`/products?${query.toString()}`);
  const states = await serverGet<{ states: string[] }>('/states');
  return (
    <>
      <h1 style={{ fontFamily: 'var(--serif)', fontSize: 56, marginTop: 0 }}>Browse</h1>
      <form className="filters" action="/browse">
        <input name="q" defaultValue={params.q} placeholder="Search" aria-label="Search" />
        <input name="category" defaultValue={params.category} placeholder="Category slug" aria-label="Category" />
        <input name="brand" defaultValue={params.brand} placeholder="Brand" aria-label="Brand" />
        <input name="size" defaultValue={params.size} placeholder="Size" aria-label="Size" />
        <select name="condition" defaultValue={params.condition || ''} aria-label="Condition">
          <option value="">Any condition</option>
          <option value="NEW_WITH_TAGS">New with tags</option>
          <option value="NEW_WITHOUT_TAGS">New without tags</option>
          <option value="VERY_GOOD">Very good</option>
          <option value="GOOD">Good</option>
          <option value="SATISFACTORY">Satisfactory</option>
        </select>
        <select name="state" defaultValue={params.state || ''} aria-label="State">
          <option value="">Any state</option>
          {(states?.states || []).map((state) => <option key={state}>{state}</option>)}
        </select>
        <input name="min" defaultValue={params.min} placeholder="Min ₦" aria-label="Minimum price" />
        <input name="max" defaultValue={params.max} placeholder="Max ₦" aria-label="Maximum price" />
        <input name="colour" defaultValue={params.colour} placeholder="Colour" aria-label="Colour" />
        <select name="sort" defaultValue={params.sort || ''} aria-label="Sort">
          <option value="">Newest</option>
          <option value="price_asc">Price up</option>
          <option value="price_desc">Price down</option>
        </select>
        <button className="btn" type="submit">Filter</button>
      </form>
      {!data ? <div className="empty">Listings could not be loaded.</div> : null}
      {data && !data.products.length ? <div className="empty">Nothing matches those filters.</div> : null}
      <div className="grid">{data?.products.map((product) => <ProductCard key={product.id} product={product} />)}</div>
    </>
  );
}
