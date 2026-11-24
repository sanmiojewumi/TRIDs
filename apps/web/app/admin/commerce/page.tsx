'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Setting { id: string; key: string; valueType: string; valueNumber: number | null; valueJson: unknown; effectiveFrom: string; effectiveTo: string | null; reason: string; sellerType: string | null }

const KEYS = [
  'SELLER_COMMISSION_BPS',
  'SELLER_COMMISSION_FIXED_KOBO',
  'BUYER_PROTECTION_BPS',
  'BUYER_PROTECTION_FIXED_KOBO',
  'FEATURED_LISTING_FEE_KOBO',
  'SELLER_SUBSCRIPTION_MONTHLY_KOBO',
  'BUSINESS_SUBSCRIPTION_MONTHLY_KOBO',
  'CAMPAIGN_FEE_KOBO',
];

export default function CommercePage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [message, setMessage] = useState('');
  function load() {
    api<{ settings: Setting[] }>('/admin/commercial-settings').then((data) => setSettings(data.settings)).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not load settings'));
  }
  useEffect(load, []);
  return (
    <div className="stack">
      <h1 style={{ fontFamily: 'var(--serif)' }}>Commercial settings</h1>
      <p className="note">Nothing here is hard-coded into orders. A new rate applies from the effective date you choose, and orders already placed keep the snapshot they were given.</p>
      {message ? <div className="error">{message}</div> : null}
      <form className="panel stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const valueType = String(data.get('valueType'));
        api('/admin/commercial-settings', {
          method: 'POST',
          body: {
            key: data.get('key'),
            sellerType: data.get('sellerType') || null,
            valueType,
            valueNumber: valueType === 'JSON' ? null : Number(data.get('valueNumber')),
            valueJson: valueType === 'JSON' ? JSON.parse(String(data.get('valueJson') || '{}')) : null,
            effectiveFrom: new Date(String(data.get('effectiveFrom'))).toISOString(),
            reason: data.get('reason'),
          },
        }).then(() => { setMessage('Setting saved.'); load(); }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not save'));
      }}>
        <label className="field">Charge
          <select name="key">{KEYS.map((key) => <option key={key}>{key}</option>)}</select>
        </label>
        <label className="field">Seller type
          <select name="sellerType"><option value="">All sellers</option><option value="INDIVIDUAL">Individual</option><option value="BUSINESS">Business</option></select>
        </label>
        <label className="field">Value type
          <select name="valueType" defaultValue="BPS"><option value="BPS">Percentage, in basis points (1000 = 10%)</option><option value="FIXED_KOBO">Fixed kobo</option><option value="JSON">JSON</option></select>
        </label>
        <label className="field">Number<input name="valueNumber" type="number" min="0" /></label>
        <label className="field">JSON<textarea name="valueJson" placeholder='{"lanes":[{"from":"Lagos","to":"Lagos","baseKobo":150000,"perKgKobo":20000,"etaDays":1}]}' /></label>
        <label className="field">Effective from<input name="effectiveFrom" type="datetime-local" required /></label>
        <label className="field">Reason for the change<textarea name="reason" required minLength={4} /></label>
        <button className="btn" type="submit">Save rate</button>
      </form>
      <form className="panel stack" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = Object.fromEntries(new FormData(event.currentTarget));
        api('/admin/coupons', { method: 'POST', body: { ...data, bpsOff: Number(data.bpsOff || 0), fixedOffKobo: Number(data.fixedOffKobo || 0) } }).then(() => setMessage('Coupon saved.')).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : 'Could not save coupon'));
      }}>
        <h2>Coupon</h2>
        <label className="field">Code<input name="code" required /></label>
        <label className="field">Description<input name="description" required /></label>
        <label className="field">Percent off, basis points<input name="bpsOff" type="number" defaultValue={0} /></label>
        <label className="field">Fixed off, kobo<input name="fixedOffKobo" type="number" defaultValue={0} /></label>
        <label className="field">Funded by
          <select name="fundedBy"><option value="PLATFORM">Platform</option><option value="SELLER">Seller</option></select>
        </label>
        <button className="btn light" type="submit">Create coupon</button>
      </form>
      <table>
        <thead><tr><th>Charge</th><th>Scope</th><th>Value</th><th>From</th><th>Until</th><th>Reason</th></tr></thead>
        <tbody>
          {settings.map((setting) => (
            <tr key={setting.id}>
              <td>{setting.key}</td>
              <td>{setting.sellerType || 'All'}</td>
              <td>{setting.valueNumber ?? JSON.stringify(setting.valueJson)}</td>
              <td>{new Date(setting.effectiveFrom).toLocaleString('en-NG')}</td>
              <td>{setting.effectiveTo ? new Date(setting.effectiveTo).toLocaleString('en-NG') : 'Open'}</td>
              <td>{setting.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
