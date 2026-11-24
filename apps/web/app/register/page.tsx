'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { SessionUser } from '@/lib/session';

export default function RegisterPage() {
  const router = useRouter();
  const { setFromAuth } = useSession();
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{ email: string; phone: string; displayName: string; password: string } | null>(null);
  const [preview, setPreview] = useState<{ email?: string; phone?: string } | null>(null);
  const [sent, setSent] = useState<{ email: boolean; phone: boolean } | null>(null);

  async function sendCodes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get('email') || '');
    const phone = String(data.get('phone') || '');
    setError('');
    try {
      const result = await api<{ sent: { email: boolean; phone: boolean }; preview?: { email?: string; phone?: string } }>('/auth/challenges', {
        method: 'POST',
        body: { email, phone },
      });
      setPending({
        email,
        phone,
        displayName: String(data.get('displayName') || ''),
        password: String(data.get('password') || ''),
      });
      setSent(result.sent);
      setPreview(result.preview || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send the codes');
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pending) return;
    const data = new FormData(event.currentTarget);
    setError('');
    try {
      const result = await api<{ accessToken: string; user: SessionUser }>('/auth/register', {
        method: 'POST',
        body: {
          ...pending,
          emailCode: data.get('emailCode'),
          phoneCode: data.get('phoneCode'),
        },
      });
      setFromAuth(result);
      router.push('/account');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create the account');
    }
  }

  return (
    <div className="panel stack" style={{ maxWidth: 560 }}>
      <h1 style={{ fontFamily: 'var(--serif)', margin: 0 }}>Create your account</h1>
      <p className="muted">One account can buy and sell. Use at least 10 characters, with a letter and a number. We check the email and the phone before the account opens.</p>
      {error ? <div className="error">{error}</div> : null}
      {pending ? (
        <form className="stack" onSubmit={createAccount}>
          <p>Codes for {pending.email} and {pending.phone}.</p>
          {sent && !sent.email && !sent.phone ? <div className="note">No email or SMS provider is connected on this server, so the codes are shown here. The account is created only when both codes match.</div> : null}
          {preview?.email ? <p>Email code: <strong>{preview.email}</strong></p> : null}
          {preview?.phone ? <p>Phone code: <strong>{preview.phone}</strong></p> : null}
          <label className="field">Email code<input name="emailCode" inputMode="numeric" autoComplete="one-time-code" required /></label>
          <label className="field">Phone code<input name="phoneCode" inputMode="numeric" required /></label>
          <button className="btn" type="submit">Create account</button>
          <button className="btn light" type="button" onClick={() => { setPending(null); setPreview(null); }}>Change details</button>
        </form>
      ) : (
        <form className="stack" onSubmit={sendCodes}>
          <label className="field">Name<input name="displayName" required /></label>
          <label className="field">Email<input name="email" type="email" required /></label>
          <label className="field">Phone<input name="phone" required placeholder="08012345678" /></label>
          <label className="field">Password<input name="password" type="password" required minLength={10} /></label>
          <button className="btn" type="submit">Send verification codes</button>
        </form>
      )}
      <Link href="/login">Already have an account? Sign in</Link>
    </div>
  );
}
