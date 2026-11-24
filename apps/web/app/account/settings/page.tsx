'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { NIGERIAN_STATES } from '@ninted/domain/states';
import { AccountNav } from '@/components/AccountNav';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

type Address = { id: string; recipient: string; phone: string; line1: string; city: string; state: string; label: string };

export default function SettingsPage() {
  const { user, refresh } = useSession();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [secret, setSecret] = useState('');
  const [addresses, setAddresses] = useState<Address[]>([]);
  useEffect(() => {
    if (!user) return;
    api<{ addresses: Address[] }>('/addresses').then((data) => setAddresses(data.addresses)).catch(() => undefined);
  }, [user]);
  if (!user) {
    return <div className="empty">Sign in to change settings. <Link href="/login">Sign in</Link> or <Link href="/register">create an account</Link>.</div>;
  }
  function fail(reason: unknown, fallback: string) {
    setError(reason instanceof Error ? reason.message : fallback);
  }
  return (
    <div className="stack">
      <AccountNav />
      <h1 style={{ fontFamily: 'var(--serif)', margin: 0 }}>Settings</h1>
      {message ? <div className="note">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <form className="panel stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        const data = new FormData(event.currentTarget);
        api('/auth/password', { method: 'POST', body: { currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') } })
          .then(() => setMessage('Password updated.'))
          .catch((reason: unknown) => fail(reason, 'Could not change the password'));
      }}>
        <h2>Password</h2>
        <p className="muted">At least 10 characters, with a letter and a number.</p>
        <label className="field">Current password<input name="currentPassword" type="password" required /></label>
        <label className="field">New password<input name="newPassword" type="password" required minLength={10} /></label>
        <button className="btn" type="submit">Change password</button>
      </form>
      <form className="panel stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError('');
        const data = new FormData(event.currentTarget);
        api('/account', {
          method: 'PATCH',
          body: {
            emailNotifications: data.get('emailNotifications') === 'on',
            smsNotifications: data.get('smsNotifications') === 'on',
            pushNotifications: data.get('pushNotifications') === 'on',
            promotionNotifications: data.get('promotionNotifications') === 'on',
          },
        }).then(() => refresh()).then(() => setMessage('Notification settings saved.')).catch((reason: unknown) => fail(reason, 'Could not save settings'));
      }}>
        <h2>Notifications</h2>
        <p className="muted">In-app notices always stay on. Security alerts still go to your email.</p>
        <label className="check"><input type="checkbox" name="emailNotifications" defaultChecked={user.emailNotifications} /> Email</label>
        <label className="check"><input type="checkbox" name="smsNotifications" defaultChecked={user.smsNotifications} /> SMS</label>
        <label className="check"><input type="checkbox" name="pushNotifications" defaultChecked={user.pushNotifications} /> Push</label>
        <label className="check"><input type="checkbox" name="promotionNotifications" defaultChecked={user.promotionNotifications} /> Promotions</label>
        <button className="btn" type="submit">Save notification settings</button>
      </form>
      <section className="panel stack">
        <h2>Delivery addresses</h2>
        {addresses.map((address) => (
          <p key={address.id}>{address.recipient}, {address.line1}, {address.city}, {address.state} · {address.phone}</p>
        ))}
        {!addresses.length ? <p className="muted">No saved address yet.</p> : null}
        <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          setError('');
          const data = Object.fromEntries(new FormData(event.currentTarget));
          api<{ address: Address }>('/addresses', { method: 'POST', body: data }).then((result) => {
            setAddresses((current) => [result.address, ...current]);
            setMessage('Address saved.');
            event.currentTarget.reset();
          }).catch((reason: unknown) => fail(reason, 'Could not save the address'));
        }}>
          <label className="field">Recipient<input name="recipient" required /></label>
          <label className="field">Phone<input name="phone" required /></label>
          <label className="field">Street<input name="line1" required /></label>
          <label className="field">City<input name="city" required /></label>
          <label className="field">State
            <select name="state" defaultValue="Lagos" required>
              {NIGERIAN_STATES.map((state) => <option key={state}>{state}</option>)}
            </select>
          </label>
          <button className="btn" type="submit">Save address</button>
        </form>
      </section>
      <section className="panel stack">
        <h2>Multi-factor authentication</h2>
        <p className="muted">Required before admin tools will open. Status: {user.mfaEnabled ? 'on' : 'off'}.</p>
        <button className="btn light" type="button" onClick={() => api<{ secret: string }>('/auth/mfa/setup', { method: 'POST' }).then((data) => setSecret(data.secret)).catch((reason: unknown) => fail(reason, 'Could not start setup'))}>Generate a new key</button>
        {secret ? <p>Add this key to an authenticator app: <code>{secret}</code></p> : null}
        <form className="row" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const otp = new FormData(event.currentTarget).get('otp');
          api('/auth/mfa/confirm', { method: 'POST', body: { otp } }).then(() => refresh()).then(() => setMessage('Multi-factor authentication is on.')).catch((reason: unknown) => fail(reason, 'Could not confirm'));
        }}>
          <input name="otp" placeholder="6-digit code" />
          <button className="btn" type="submit">Confirm</button>
        </form>
      </section>
      {user.seller ? (
        <section className="panel stack">
          <h2>Seller verification and payouts</h2>
          <p className="muted">Only the last four digits of your NIN or account number are stored for display.</p>
          <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            api('/seller/verification', { method: 'POST', body: data }).then(() => refresh()).then(() => setMessage('Verification submitted.')).catch((reason: unknown) => fail(reason, 'Could not submit'));
          }}>
            <label className="field">NIN last 4<input name="ninLast4" pattern="\d{4}" required /></label>
            <label className="field">Business name<input name="businessName" /></label>
            <label className="field">CAC number<input name="cacNumber" /></label>
            <button className="btn" type="submit">Submit verification</button>
          </form>
          <form className="stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const data = Object.fromEntries(new FormData(event.currentTarget));
            api('/seller/bank-account', { method: 'POST', body: data }).then(() => setMessage('Payout account saved.')).catch((reason: unknown) => fail(reason, 'Could not save the account'));
          }}>
            <label className="field">Bank<input name="bankName" required /></label>
            <label className="field">Account name<input name="accountName" required /></label>
            <label className="field">NUBAN<input name="accountNumber" pattern="\d{10}" required /></label>
            <button className="btn light" type="submit">Save payout account</button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
