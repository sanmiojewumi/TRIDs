'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { NIGERIAN_STATES } from '@ninted/domain/states';
import { AccountNav } from '@/components/AccountNav';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function ProfilePage() {
  const { user, refresh } = useSession();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  if (!user) {
    return <div className="empty">Sign in to edit your profile. <Link href="/login">Sign in</Link> or <Link href="/register">create an account</Link>.</div>;
  }
  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    try {
      await api('/account', { method: 'PATCH', body: { displayName: data.get('displayName'), phone: data.get('phone') } });
      await refresh();
      setMessage('Profile saved.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save your profile');
    }
  }
  async function saveSeller(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    try {
      const body = { storeName: data.get('storeName'), bio: data.get('bio'), city: data.get('city'), state: data.get('state') };
      if (user?.seller) await api('/seller/profile', { method: 'PATCH', body });
      else await api('/seller/profile', { method: 'POST', body: { ...body, type: data.get('type') } });
      await refresh();
      setMessage(user?.seller ? 'Seller profile saved.' : 'Seller profile opened.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the seller profile');
    }
  }
  return (
    <div className="stack">
      <AccountNav />
      <h1 style={{ fontFamily: 'var(--serif)', margin: 0 }}>Profile</h1>
      <p className="muted">This is the name buyers and sellers see. Your email stays {user.email}.</p>
      {message ? <div className="note">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <form className="panel stack" onSubmit={saveAccount}>
        <h2>Personal profile</h2>
        <label className="field">Name<input name="displayName" defaultValue={user.displayName} required /></label>
        <label className="field">Phone<input name="phone" defaultValue={user.phone || ''} placeholder="08030000000" /></label>
        <button className="btn" type="submit">Save profile</button>
      </form>
      <form className="panel stack" onSubmit={saveSeller}>
        <h2>{user.seller ? 'Seller profile' : 'Open a seller profile'}</h2>
        <p className="muted">{user.seller ? `${user.seller.verification} · ${user.seller.ratingCount ? `${user.seller.ratingAvg.toFixed(1)} from ${user.seller.ratingCount} reviews` : 'No reviews yet'}` : 'One account can buy and sell.'}</p>
        {!user.seller ? (
          <label className="field">Seller type
            <select name="type" defaultValue="INDIVIDUAL">
              <option value="INDIVIDUAL">Individual</option>
              <option value="BUSINESS">Business</option>
            </select>
          </label>
        ) : null}
        <label className="field">Store name<input name="storeName" defaultValue={user.seller?.storeName || ''} required /></label>
        <label className="field">Bio<textarea name="bio" rows={4} defaultValue={user.seller?.bio || ''} placeholder="What you sell, and where you post from." /></label>
        <label className="field">City<input name="city" defaultValue={user.seller?.city || ''} required /></label>
        <label className="field">State
          <select name="state" defaultValue={user.seller?.state || 'Lagos'} required>
            {NIGERIAN_STATES.map((state) => <option key={state}>{state}</option>)}
          </select>
        </label>
        <div className="row">
          <button className="btn" type="submit">{user.seller ? 'Save seller profile' : 'Create seller profile'}</button>
          {user.seller ? <Link className="btn light" href={`/seller/${user.id}`}>View public profile</Link> : null}
        </div>
      </form>
    </div>
  );
}
