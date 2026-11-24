'use client';

import { FormEvent, useEffect, useState } from 'react';
import { formatNaira } from '@ninted/domain/money';
import { api } from '@/lib/api';

export default function EarningsPage() {
  const [data, setData] = useState<{ balanceKobo: number; entries: { id: string; memo: string; amountKobo: number; direction: string }[]; payouts: { id: string; amountKobo: number; status: string; externalReference?: string | null }[] } | null>(null);
  const [message, setMessage] = useState('');
  function load() {
    api<NonNullable<typeof data>>('/seller/earnings').then(setData).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not load earnings'));
  }
  useEffect(load, []);
  return (
    <div className="stack">
      <h1 style={{ fontFamily: 'var(--serif)' }}>Earnings</h1>
      <p className="note">Payable balance is an internal ledger hold. Requesting a payout does not send money. Finance records the bank transfer after their own approval. This is not automatic escrow.</p>
      {message ? <div className="error">{message}</div> : null}
      <strong>{data ? formatNaira(data.balanceKobo) : '—'}</strong>
      <form onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const amountNaira = Number(new FormData(event.currentTarget).get('amount'));
        api('/seller/payouts', { method: 'POST', body: { amountNaira } }).then(() => { setMessage('Payout requested.'); load(); }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not request'));
      }} className="row">
        <input name="amount" type="number" min="1" placeholder="Amount in naira" />
        <button className="btn" type="submit">Request payout</button>
      </form>
      <h2>Ledger</h2>
      {(data?.entries || []).map((entry) => <p key={entry.id}>{entry.direction} {formatNaira(entry.amountKobo)} · {entry.memo}</p>)}
      <h2>Payouts</h2>
      {(data?.payouts || []).map((payout) => <p key={payout.id}>{formatNaira(payout.amountKobo)} · {payout.status} {payout.externalReference || ''}</p>)}
    </div>
  );
}
