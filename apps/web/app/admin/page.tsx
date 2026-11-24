'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatNaira } from '@ninted/domain/money';
import { ApiError, api } from '@/lib/api';

export default function AdminHome() {
  const [summary, setSummary] = useState<{ users: number; activeListings: number; orders: number; paidTotalKobo: number; commissionKobo: number } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<NonNullable<typeof summary>>('/admin/summary').then(setSummary).catch((reason: unknown) => {
      setError(reason instanceof ApiError && reason.code === 'MFA_REQUIRED' ? 'Turn on multi-factor authentication in your account before opening admin tools.' : reason instanceof Error ? reason.message : 'Admin tools are unavailable');
    });
  }, []);
  return (
    <div className="stack">
      <h1 style={{ fontFamily: 'var(--serif)' }}>Administration</h1>
      <div className="chips">
        <Link className="chip" href="/admin/commerce">Commercial settings</Link>
        <Link className="chip" href="/admin/listings">Listings</Link>
        <Link className="chip" href="/admin/orders">Orders</Link>
        <Link className="chip" href="/admin/payouts">Payouts</Link>
        <Link className="chip" href="/account">Account security</Link>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {summary ? (
        <div className="sellers">
          <div className="panel"><strong>{summary.users}</strong><p>Accounts</p></div>
          <div className="panel"><strong>{summary.activeListings}</strong><p>Active listings</p></div>
          <div className="panel"><strong>{formatNaira(summary.paidTotalKobo)}</strong><p>Paid volume</p></div>
          <div className="panel"><strong>{formatNaira(summary.commissionKobo)}</strong><p>Commission on paid orders</p></div>
        </div>
      ) : null}
    </div>
  );
}
