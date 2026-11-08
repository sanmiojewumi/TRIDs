import { useMemo, useState } from 'preact/hooks';
import { addDays, todayISO } from '../dates';
import { computeTotals } from '../money';
import { renderSvgPages } from '../render';
import { actions, useStore } from '../store';
import type { InvoiceData, LayoutStyle, Template } from '../types';
import { val } from './util';

function sampleData(tpl: Template, business: InvoiceData['business'], bank: InvoiceData['bank']): InvoiceData {
  const items = [{ description: 'Labour - works carried out as instructed', qty: 1, rate: 45000, materials: false }];
  return {
    ref: '5021',
    issueDate: todayISO(),
    dueDate: addDays(todayISO(), 14),
    workDates: [todayISO()],
    siteName: '',
    siteAddress: '12 Example Road, Sampletown',
    sitePostcode: 'AB1 2CD',
    customerRef: '',
    notes: '',
    items,
    totals: computeTotals(items, 0, 0),
    client: { name: 'Sample Client Ltd', contact: 'Accounts', address: '1 Client Street\nLondon', postcode: 'EC1A 1BB', email: '' },
    business: { ...business, name: business.name || 'Your Business Name', address: business.address || '1 Your Street\nYour Town' },
    bank: { accountName: bank.accountName || 'Your Name', sortCode: bank.sortCode || '00-00-00', accountNumber: bank.accountNumber || '00000000' },
    template: tpl,
  };
}

export function Templates() {
  const state = useStore();
  const [editing, setEditing] = useState<Template | undefined>();

  const preview = useMemo(() => (editing ? renderSvgPages(sampleData(editing, state.business, state.bank))[0] : ''), [editing, state.business, state.bank]);

  if (editing) {
    const set = (patch: Partial<Template>) => setEditing({ ...editing, ...patch });
    const toggle = (key: 'showQtyRate' | 'showLogo' | 'showBankDetails' | 'showRegNumbers', label: string) => (
      <label class="check">
        <input type="checkbox" checked={editing[key]} onChange={(e) => set({ [key]: (e.target as HTMLInputElement).checked })} />
        {label}
      </label>
    );
    return (
      <section class="page-wrap wide">
        <h1>{state.templates.some((t) => t.id === editing.id) ? 'Edit template' : 'New template'}</h1>
        <div class="split">
          <div>
            <div class="card">
              <label class="field">
                <span>Template name</span>
                <input value={editing.name} onInput={(e) => set({ name: val(e) })} />
              </label>
              <label class="field">
                <span>Layout</span>
                <select value={editing.layout} onChange={(e) => set({ layout: val(e) as LayoutStyle })}>
                  <option value="tradehelp">Trade Help - matches your current Trade Help invoice</option>
                  <option value="classic">Classic - title top right, coloured rule</option>
                  <option value="banded">Banded - coloured header band</option>
                  <option value="minimal">Minimal - clean and light</option>
                </select>
              </label>
              <div class="grid2">
                <label class="field">
                  <span>Accent colour</span>
                  <input type="color" value={editing.accent} onInput={(e) => set({ accent: val(e) })} />
                </label>
                <label class="field">
                  <span>Document title</span>
                  <input value={editing.title} onInput={(e) => set({ title: val(e) })} />
                </label>
              </div>
              {editing.layout === 'tradehelp' && (
                <label class="field">
                  <span>Intro text under the title ({'{phone}'} = your phone number)</span>
                  <textarea rows={3} value={editing.intro} onInput={(e) => set({ intro: val(e) })} />
                </label>
              )}
              <div class="checks">
                {toggle('showQtyRate', 'Show quantity and unit price columns')}
                {toggle('showLogo', 'Show logo')}
                {toggle('showBankDetails', 'Show bank details')}
                {toggle('showRegNumbers', 'Show company / VAT / UTR numbers in footer')}
              </div>
              <label class="field">
                <span>Payment note (use {'{ref}'} for the invoice number)</span>
                <textarea rows={2} value={editing.paymentNote} onInput={(e) => set({ paymentNote: val(e) })} />
              </label>
              <label class="field">
                <span>Footer message</span>
                <input value={editing.footerNote} onInput={(e) => set({ footerNote: val(e) })} />
              </label>
            </div>
            <div class="sticky-actions">
              <button class="btn ghost" onClick={() => setEditing(undefined)}>
                Cancel
              </button>
              <button
                class="btn primary grow"
                disabled={!editing.name.trim()}
                onClick={() => {
                  actions.saveTemplate({ ...editing, name: editing.name.trim() });
                  setEditing(undefined);
                }}
              >
                Save template
              </button>
            </div>
          </div>
          <div class="page small-preview" aria-label="Template preview" dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      </section>
    );
  }

  return (
    <section class="page-wrap">
      <h1>Templates</h1>
      <p class="hint">Each client uses one template. Create a style per company, then assign it on the client.</p>
      <button
        class="btn primary"
        onClick={() => setEditing({ ...state.templates[0], id: crypto.randomUUID(), name: 'New template' })}
      >
        New template
      </button>
      <ul class="list">
        {state.templates.map((t) => {
          const users = state.clients.filter((c) => c.templateId === t.id);
          return (
            <li key={t.id}>
              <div class="list-item static">
                <div>
                  <span class="swatch" style={{ background: t.accent }} />
                  <strong>{t.name}</strong>
                  <div class="muted">
                    {t.layout} | {users.length ? users.map((u) => u.name).join(', ') : 'not used yet'}
                  </div>
                </div>
                <div class="row">
                  <button class="btn small" onClick={() => setEditing({ ...t })}>
                    Edit
                  </button>
                  <button class="btn small" onClick={() => setEditing({ ...t, id: crypto.randomUUID(), name: `${t.name} copy` })}>
                    Copy
                  </button>
                  {state.templates.length > 1 && (
                    <button
                      class="btn small danger"
                      onClick={() => confirm(`Delete ${t.name}? Clients using it switch to another template.`) && actions.deleteTemplate(t.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
