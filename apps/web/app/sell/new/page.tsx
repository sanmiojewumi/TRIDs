'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function NewListingPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<{ id: string; name: string; parentId: string | null }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<{ categories: { id: string; name: string; parentId: string | null; children: { id: string; name: string }[] }[] }>('/categories').then((data) => {
      const flat = data.categories.flatMap((category) => [category, ...category.children.map((child) => ({ ...child, parentId: category.id }))]);
      setCategories(flat);
    }).catch(() => undefined);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const created = await api<{ product: { id: string } }>('/products', {
        method: 'POST',
        body: {
          title: data.get('title'),
          description: data.get('description'),
          categoryId: data.get('categoryId'),
          brand: data.get('brand'),
          size: data.get('size'),
          colour: data.get('colour'),
          condition: data.get('condition'),
          priceNaira: Number(data.get('priceNaira')),
          quantity: Number(data.get('quantity') || 1),
          state: data.get('state'),
          city: data.get('city'),
          weightGrams: Number(data.get('weightGrams') || 0) || undefined,
          publish: true,
        },
      });
      const file = data.get('image');
      if (file instanceof File && file.size) {
        const form = new FormData();
        form.append('file', file);
        await api(`/products/${created.product.id}/images`, { method: 'POST', form });
      }
      router.push('/sell');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not publish');
    }
  }
  return (
    <form className="panel stack" onSubmit={submit}>
      <h1 style={{ fontFamily: 'var(--serif)', margin: 0 }}>New listing</h1>
      {error ? <div className="error">{error}</div> : null}
      <label className="field">Title<input name="title" required minLength={3} /></label>
      <label className="field">Description<textarea name="description" required minLength={10} /></label>
      <label className="field">Category
        <select name="categoryId" required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      </label>
      <div className="row">
        <label className="field">Brand<input name="brand" /></label>
        <label className="field">Size<input name="size" /></label>
        <label className="field">Colour<input name="colour" /></label>
      </div>
      <label className="field">Condition
        <select name="condition" defaultValue="GOOD">
          <option value="NEW_WITH_TAGS">New with tags</option>
          <option value="NEW_WITHOUT_TAGS">New without tags</option>
          <option value="VERY_GOOD">Very good</option>
          <option value="GOOD">Good</option>
          <option value="SATISFACTORY">Satisfactory</option>
        </select>
      </label>
      <div className="row">
        <label className="field">Price (₦)<input name="priceNaira" type="number" min="1" required /></label>
        <label className="field">Quantity<input name="quantity" type="number" min="1" defaultValue={1} /></label>
        <label className="field">Weight (grams)<input name="weightGrams" type="number" min="1" /></label>
      </div>
      <div className="row">
        <label className="field">City<input name="city" required /></label>
        <label className="field">State<input name="state" required placeholder="Lagos" /></label>
      </div>
      <label className="field">Photograph<input name="image" type="file" accept="image/jpeg,image/png,image/webp" /></label>
      <button className="btn" type="submit">Publish</button>
    </form>
  );
}
