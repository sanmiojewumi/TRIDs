'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { SessionUser } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const { setFromAuth } = useSession();
  const [error, setError] = useState('');
  const [mfa, setMfa] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ accessToken: string; user: SessionUser }>('/auth/login', {
        method: 'POST',
        body: { email: data.get('email'), password: data.get('password'), otp: data.get('otp') || undefined },
      });
      setFromAuth(result);
      router.push('/');
    } catch (reason) {
      if (reason instanceof ApiError && reason.code === 'MFA_REQUIRED') setMfa(true);
      setError(reason instanceof Error ? reason.message : 'Could not sign in');
    }
  }

  return (
    <form className="panel stack" style={{ maxWidth: 460 }} onSubmit={submit}>
      <h1 style={{ fontFamily: 'var(--serif)', margin: 0 }}>Sign in</h1>
      {error ? <div className="error">{error}</div> : null}
      <label className="field">Email<input name="email" type="email" required /></label>
      <label className="field">Password<input name="password" type="password" required /></label>
      {mfa ? <label className="field">Authentication code<input name="otp" inputMode="numeric" required /></label> : null}
      <button className="btn" type="submit">Sign in</button>
      <Link className="btn light" href="/register">Create account</Link>
    </form>
  );
}
