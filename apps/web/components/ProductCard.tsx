'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { formatNaira } from '@ninted/domain/money';

export interface CardProduct {
  id: string;
  title: string;
  priceKobo: number;
  condition: string;
  city: string;
  state: string;
  brand?: string | null;
  images?: { url: string }[];
  seller?: { storeName?: string };
}

export function Artwork({ seed, label, image }: { seed: string; label: string; image?: string }) {
  if (image) return <img src={image} alt="" />;
  const hue = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 50;
  return (
    <div className="art" style={{ background: `linear-gradient(155deg, hsl(${150 + hue} 38% 16%), hsl(${78 + hue} 52% 58%))` }}>
      <span>{label}</span>
    </div>
  );
}

export function ProductStage({ images, seed, label }: { images: string[]; seed: string; label: string }) {
  const frames = images.filter(Boolean);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (frames.length < 2) return;
    const timer = window.setInterval(() => setIndex((current) => (current + 1) % frames.length), 3200);
    return () => window.clearInterval(timer);
  }, [frames.length, seed]);
  function step(event: MouseEvent, direction: number) {
    event.preventDefault();
    event.stopPropagation();
    setIndex((current) => (current + direction + frames.length) % frames.length);
  }
  return (
    <div className="stage">
      {frames.length ? <img src={frames[index]} alt="" /> : <Artwork seed={seed} label={label} />}
      {frames.length > 1 ? (
        <>
          <button type="button" className="stage-btn prev" aria-label="Previous photo" onClick={(event) => step(event, -1)}>‹</button>
          <button type="button" className="stage-btn next" aria-label="Next photo" onClick={(event) => step(event, 1)}>›</button>
          <span className="stage-dots" aria-hidden="true">{frames.map((frame, dot) => <i key={frame} data-on={dot === index} />)}</span>
        </>
      ) : null}
    </div>
  );
}

export function ProductCard({ product }: { product: CardProduct }) {
  return (
    <Link href={`/product/${product.id}`} className="card">
      <ProductStage images={product.images?.map((image) => image.url) || []} seed={product.id} label={product.title} />
      <div className="meta">
        <div className="row">
          <strong className="price">{formatNaira(product.priceKobo)}</strong>
          <span className="pill">{product.condition.replaceAll('_', ' ').toLowerCase()}</span>
        </div>
        <h3>{product.title}</h3>
        <span className="muted">{product.seller?.storeName ? `${product.seller.storeName} · ` : ''}{product.city}, {product.state}</span>
      </div>
    </Link>
  );
}

export function ItemRail({ title, products }: { title: string; products: CardProduct[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  function slide(direction: number) {
    const node = scroller.current;
    if (!node) return;
    const distance = Math.max(240, node.clientWidth * 0.8);
    const max = node.scrollWidth - node.clientWidth;
    const next = node.scrollLeft + direction * distance;
    node.scrollTo({ left: next > max - 8 ? 0 : Math.max(0, next), behavior: 'smooth' });
  }
  useEffect(() => {
    if (products.length < 2) return;
    const timer = window.setInterval(() => slide(1), 4500);
    return () => window.clearInterval(timer);
  }, [products.length]);
  if (!products.length) return null;
  return (
    <section className="section">
      <div className="row">
        <h2>{title}</h2>
        <span className="row">
          <button type="button" className="rail-btn" aria-label={`Show previous ${title}`} onClick={() => slide(-1)}>‹</button>
          <button type="button" className="rail-btn" aria-label={`Show next ${title}`} onClick={() => slide(1)}>›</button>
        </span>
      </div>
      <div className="rail" ref={scroller}>
        {products.map((product) => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
  );
}
