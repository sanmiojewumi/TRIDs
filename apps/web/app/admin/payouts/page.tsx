'use client';

import { FormEvent, useEffect, useState } from 'react';
import { formatNaira } from '@ninted/domain/money';
import { api } from '@/lib/api';

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState<{ id: string; amountKobo: number; status: string; accountNumberLast4?: string | null }[]>([]);
  const [reconciliation, setReconciliation] = useState<{ ok: boolean; issues: string[] } | null>(null);
  const [message, setMessage] = useState('');
  function load() {
    api<{ payouts: typeof payouts }>('/admin/payouts').then((data) => setPayouts(data.payouts)).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not load payouts'));
    api<{ ok: boolean; issues: string[] }>('/admin/reconciliation').then(setReconciliation).catch(() => undefined);
  }
  useEffect(load, []);
  return (
    <div className="stack">
      <h1 style={{ fontFamily: 'var(--serif)' }}>Payouts</h1>
      <p className="note">Marking a payout paid requires the bank transfer reference from the payment you actually made. The ledger updates only then.</p>
      {message ? <div className="error">{message}</div> : null}
      {reconciliation ? <p>{reconciliation.ok ? 'Payment ledger reconciles.' : reconciliation.issues.join(' ')}</p> : null}
      {payouts.map((payout) => (
        <form key={payout.id} className="panel row" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const reference = String(new FormData(event.currentTarget).get('reference') || '');
          api(`/admin/payouts/${payout.id}/decision`, { method: 'POST', body: { status: 'PAID', externalReference: reference, note: 'Recorded by finance' } }).then(load).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not record payout'));
        }}>
          <span>{formatNaira(payout.amountKobo)} · {payout.status} · ****{payout.accountNumberLast4 || ''}</span>
          {payout.status !== 'PAID' ? <><input name="reference" placeholder="Transfer reference" required /><button className="btn" type="submit">Mark paid</button></> : null}
        </form>
      ))}
    </div>
  );
}
