'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

function Callback() {
  const params = useSearchParams();
  const reference = params.get('reference') || params.get('trxref') || params.get('tx_ref') || '';
  const [message, setMessage] = useState('Checking this payment with the provider…');
  useEffect(() => {
    if (!reference) {
      setMessage('No payment reference was returned.');
      return;
    }
    api<{ verified: boolean; status?: string }>('/payments/verify', { method: 'POST', body: { reference } })
      .then((result) => setMessage(result.verified ? 'Payment verified. The order is now with the seller.' : `Payment status: ${result.status || 'not successful'}. Nothing was marked paid without provider confirmation.`))
      .catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not verify the payment'));
  }, [reference]);
  return (
    <div className="panel stack">
      <h1 style={{ fontFamily: 'var(--serif)' }}>Payment</h1>
      <p>{message}</p>
      <Link href="/orders">Back to orders</Link>
    </div>
  );
}

export default function CallbackPage() {
  return <Suspense fallback={<div className="empty">Checking payment…</div>}><Callback /></Suspense>;
}
