import Link from 'next/link';
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

export function ProductCard({ product }: { product: CardProduct }) {
  return (
    <Link href={`/product/${product.id}`} className="card">
      <Artwork seed={product.id} label={product.brand || product.condition.replaceAll('_', ' ')} image={product.images?.[0]?.url} />
      <div className="meta">
        <div className="row">
          <strong className="price">{formatNaira(product.priceKobo)}</strong>
          <span className="pill">{product.condition.replaceAll('_', ' ').toLowerCase()}</span>
        </div>
        <h3>{product.title}</h3>
        <span className="muted">{product.city}, {product.state}</span>
      </div>
    </Link>
  );
}
