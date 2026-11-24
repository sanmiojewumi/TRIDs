'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { SessionUser } from '@/lib/session';

export default function RegisterPage() {
  const router = useRouter();
  const { setFromAuth } = useSession();
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ accessToken: string; user: SessionUser }>('/auth/register', {
        method: 'POST',
        body: {
          email: data.get('email'),
          password: data.get('password'),
          displayName: data.get('displayName'),
          phone: data.get('phone'),
          intent: data.get('intent'),
          storeName: data.get('storeName'),
          city: data.get('city'),
          state: data.get('state'),
        },
      });
      setFromAuth(result);
      router.push('/account');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the account');
    }
  }
  return (
    <form className="panel stack" style={{ maxWidth: 560 }} onSubmit={submit}>
      <h1 style={{ fontFamily: 'var(--serif)', margin: 0 }}>Create your account</h1>
      <p className="muted">One account can buy and sell. Business sellers add a store name.</p>
      {error ? <div className="error">{error}</div> : null}
      <label className="field">Name<input name="displayName" required /></label>
      <label className="field">Email<input name="email" type="email" required /></label>
      <label className="field">Phone<input name="phone" /></label>
      <label className="field">Password<input name="password" type="password" required /></label>
      <label className="field">I want to
        <select name="intent" defaultValue="BUY">
          <option value="BUY">Buy</option>
          <option value="SELL_INDIVIDUAL">Buy and sell as an individual</option>
          <option value="SELL_BUSINESS">Buy and sell as a business</option>
        </select>
      </label>
      <label className="field">Store name<input name="storeName" /></label>
      <label className="field">City<input name="city" /></label>
      <label className="field">State<input name="state" placeholder="Lagos" /></label>
      <button className="btn" type="submit">Create account</button>
    </form>
  );
}
