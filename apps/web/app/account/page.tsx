'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function AccountPage() {
  const { user, refresh } = useSession();
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState('');
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; createdAt: string }[]>([]);
  useEffect(() => {
    api<{ notifications: typeof notifications }>('/notifications').then((data) => setNotifications(data.notifications)).catch(() => undefined);
  }, [user]);
  if (!user) return <div className="empty">Sign in to manage your account. <Link href="/login">Sign in</Link></div>;
  return (
    <div className="stack">
      <h1 style={{ fontFamily: 'var(--serif)' }}>{user.displayName}</h1>
      <p className="muted">{user.email} {user.seller ? `· ${user.seller.storeName} (${user.seller.verification})` : ''}</p>
      <div className="row">
        <Link className="btn light" href="/orders">Orders</Link>
        <Link className="btn light" href="/favourites">Favourites</Link>
        <Link className="btn light" href="/sell">Seller desk</Link>
      </div>
      {message ? <div className="note">{message}</div> : null}
      <section className="panel stack">
        <h2>Multi-factor authentication</h2>
        <p className="muted">Required before admin tools will open. Status: {user.mfaEnabled ? 'on' : 'off'}.</p>
        <button className="btn light" onClick={() => api<{ secret: string }>('/auth/mfa/setup', { method: 'POST' }).then((data) => setSecret(data.secret))}>Generate a new key</button>
        {secret ? <p>Add this key to an authenticator app: <code>{secret}</code></p> : null}
        <form className="row" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const otp = new FormData(event.currentTarget).get('otp');
          api('/auth/mfa/confirm', { method: 'POST', body: { otp } }).then(() => refresh()).then(() => setMessage('Multi-factor authentication is on.')).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not confirm'));
        }}>
          <input name="otp" placeholder="6-digit code" />
          <button className="btn" type="submit">Confirm</button>
        </form>
      </section>
      <section className="panel stack">
        <h2>Delivery address</h2>
        <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const data = Object.fromEntries(new FormData(event.currentTarget));
          api('/addresses', { method: 'POST', body: data }).then(() => setMessage('Address saved.')).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not save'));
        }}>
          <label className="field">Recipient<input name="recipient" required /></label>
          <label className="field">Phone<input name="phone" required /></label>
          <label className="field">Street<input name="line1" required /></label>
          <label className="field">City<input name="city" required /></label>
          <label className="field">State<input name="state" required placeholder="Lagos" /></label>
          <button className="btn" type="submit">Save address</button>
        </form>
      </section>
      {user.seller ? (
        <section className="panel stack">
          <h2>Seller verification</h2>
          <p className="muted">Only the last four digits of your NIN are stored.</p>
          <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            api('/seller/verification', { method: 'POST', body: data }).then(() => refresh()).then(() => setMessage('Verification submitted.')).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not submit'));
          }}>
            <label className="field">NIN last 4<input name="ninLast4" pattern="\d{4}" required /></label>
            <label className="field">Business name<input name="businessName" /></label>
            <label className="field">CAC number<input name="cacNumber" /></label>
            <button className="btn" type="submit">Submit</button>
          </form>
          <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            api('/seller/bank-account', { method: 'POST', body: data }).then(() => setMessage('Bank account saved. Only the last four digits are shown back.')).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not save'));
          }}>
            <label className="field">Bank<input name="bankName" required /></label>
            <label className="field">Account name<input name="accountName" required /></label>
            <label className="field">NUBAN<input name="accountNumber" pattern="\d{10}" required /></label>
            <button className="btn light" type="submit">Save payout account</button>
          </form>
        </section>
      ) : null}
      <section>
        <h2>Notifications</h2>
        {!notifications.length ? <p className="muted">No notifications yet.</p> : notifications.map((item) => (
          <article key={item.id} className="panel" style={{ marginBottom: 8 }}>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
