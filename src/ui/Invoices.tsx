import { useState } from 'preact/hooks';
import { formatDate } from '../dates';
import { formatMoney } from '../money';
import { actions, useStore } from '../store';
import type { InvoiceRecord } from '../types';
import { seedDraftFromRecord } from './NewInvoice';
import { Preview } from './Preview';
import { val } from './util';

export function Invoices() {
  const state = useStore();
  const [open, setOpen] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');

  const q = query.trim().toLowerCase();
  const list = state.invoices.filter((i) => {
    if (filter !== 'all' && i.status !== filter) return false;
    if (!q) return true;
    const d = i.data;
    return [i.ref, d.client.name, d.siteAddress, d.sitePostcode, d.siteName, d.customerRef].join(' ').toLowerCase().includes(q);
  });
  const outstanding = state.invoices.filter((i) => i.status === 'unpaid').reduce((s, i) => s + i.data.totals.total, 0);
  const current: InvoiceRecord | undefined = state.invoices.find((i) => i.id === open);

  return (
    <section class="page-wrap">
      <h1>Invoices</h1>
      {state.invoices.length > 0 && (
        <div class="card summary">
          <div>
            <span>Saved</span>
            <b>{state.invoices.length}</b>
          </div>
          <div>
            <span>Outstanding</span>
            <b>{formatMoney(outstanding)}</b>
          </div>
        </div>
      )}
      <div class="row">
        <input class="grow" type="search" placeholder="Search ref, client, postcode" value={query} onInput={(e) => setQuery(val(e))} />
        <select value={filter} onChange={(e) => setFilter(val(e) as typeof filter)} aria-label="Filter by status">
          <option value="all">All</option>
          <option value="unpaid">Unpaid</option>
          <option value="paid">Paid</option>
        </select>
      </div>
      {list.length === 0 && (
        <p class="empty">{state.invoices.length ? 'No invoices match.' : 'No invoices yet. Every invoice you download is saved here automatically.'}</p>
      )}
      <ul class="list">
        {list.map((i) => (
          <li key={i.id}>
            <button class="list-item" onClick={() => setOpen(i.id)}>
              <div>
                <strong>{i.ref}</strong>
                <span class={`badge ${i.status}`}>{i.status === 'paid' ? 'Paid' : 'Unpaid'}</span>
                <div class="muted">
                  {i.data.client.name}
                  {i.data.sitePostcode ? ` - ${i.data.sitePostcode}` : ''}
                </div>
                <div class="muted small">Issued {formatDate(i.data.issueDate)}</div>
              </div>
              <b>{formatMoney(i.data.totals.total)}</b>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <Preview
          data={current.data}
          record={current}
          onClose={() => setOpen(undefined)}
          onDuplicate={(r) => {
            seedDraftFromRecord(r);
            location.hash = '#/new';
          }}
          onTogglePaid={(r) => actions.setInvoiceStatus(r.id, r.status === 'paid' ? 'unpaid' : 'paid')}
          onDelete={(r) => {
            actions.deleteInvoice(r.id);
            setOpen(undefined);
          }}
        />
      )}
    </section>
  );
}
