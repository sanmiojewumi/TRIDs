'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AccountNav } from '@/components/AccountNav';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function AccountPage() {
  const { user } = useSession();
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string }[]>([]);
  useEffect(() => {
    if (!user) return;
    api<{ notifications: typeof notifications }>('/notifications').then((data) => setNotifications(data.notifications)).catch(() => undefined);
  }, [user]);
  if (!user) {
    return (
      <div className="empty stack">
        <p>Sign in to open your account, or create one if you are new.</p>
        <div className="row">
          <Link className="btn" href="/login">Sign in</Link>
          <Link className="btn light" href="/register">Create account</Link>
        </div>
      </div>
    );
  }
  return (
    <div className="stack">
      <AccountNav />
      <h1 style={{ fontFamily: 'var(--serif)', margin: 0 }}>{user.displayName}</h1>
      <p className="muted">{user.email}{user.phone ? ` · ${user.phone}` : ''}</p>
      <section className="panel stack">
        <p className="kicker">Account</p>
        <p>{user.seller ? `${user.seller.storeName} · ${user.seller.verification}` : 'Buyer account. You can open a seller profile whenever you want to list something.'}</p>
        <div className="row">
          <Link className="btn" href="/account/profile">Edit profile</Link>
          <Link className="btn light" href="/account/settings">Settings</Link>
        </div>
      </section>
      <div className="row">
        <Link className="btn light" href="/orders">Orders</Link>
        <Link className="btn light" href="/favourites">Favourites</Link>
        <Link className="btn light" href="/sell">Seller desk</Link>
        {user.seller ? <Link className="btn light" href={`/seller/${user.id}`}>Public profile</Link> : null}
      </div>
      <section>
        <h2>Notifications</h2>
        {!notifications.length ? <p className="muted">No notifications yet.</p> : notifications.slice(0, 8).map((item) => (
          <article key={item.id} className="panel" style={{ marginBottom: 8 }}>
            <strong>{item.title}</strong>
            <p>{item.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
