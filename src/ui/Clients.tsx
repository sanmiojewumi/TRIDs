import { useState } from 'preact/hooks';
import { newClient } from '../seed';
import { actions, useStore } from '../store';
import type { Client } from '../types';
import { val } from './util';

export function Clients() {
  const state = useStore();
  const [editing, setEditing] = useState<Client | undefined>();
  const [isNew, setIsNew] = useState(false);

  if (editing) {
    const set = (patch: Partial<Client>) => setEditing({ ...editing, ...patch });
    const used = state.invoices.filter((i) => i.clientId === editing.id).length;
    return (
      <section class="page-wrap">
        <h1>{isNew ? 'Add client' : 'Edit client'}</h1>
        <div class="card">
          <label class="field">
            <span>Client / company name</span>
            <input value={editing.name} onInput={(e) => set({ name: val(e) })} />
          </label>
          <label class="field">
            <span>Contact (optional)</span>
            <input value={editing.contact} onInput={(e) => set({ contact: val(e) })} />
          </label>
          <label class="field">
            <span>Billing address</span>
            <textarea rows={3} value={editing.address} onInput={(e) => set({ address: val(e) })} />
          </label>
          <div class="grid2">
            <label class="field">
              <span>Postcode</span>
              <input value={editing.postcode} autocapitalize="characters" onInput={(e) => set({ postcode: val(e).toUpperCase() })} />
            </label>
            <label class="field">
              <span>Email</span>
              <input type="email" value={editing.email} onInput={(e) => set({ email: val(e) })} />
            </label>
          </div>
        </div>

        <div class="card">
          <h2>Invoice style and terms</h2>
          <label class="field">
            <span>Invoice template</span>
            <select value={editing.templateId} onChange={(e) => set({ templateId: val(e) })}>
              {state.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {used > 0 && <p class="hint">{used} invoice{used === 1 ? '' : 's'} saved for this client. Numbering is one running sequence, set in Settings.</p>}
          <div class="grid3">
            <label class="field">
              <span>Payment terms (days)</span>
              <input inputMode="numeric" value={String(editing.paymentTermsDays)} onInput={(e) => set({ paymentTermsDays: Number(val(e).replace(/\D/g, '')) || 0 })} />
            </label>
            {state.business.vatRegistered && (
              <label class="field">
                <span>VAT %</span>
                <input inputMode="decimal" value={String(editing.vatRate)} onInput={(e) => set({ vatRate: Math.min(100, Number(val(e)) || 0) })} />
              </label>
            )}
            <label class="field">
              <span>CIS deduction</span>
              <select value={String(editing.cisRate)} onChange={(e) => set({ cisRate: Number(val(e)) })}>
                <option value="0">None</option>
                <option value="20">20%</option>
                <option value="30">30%</option>
              </select>
            </label>
          </div>
          <label class="field">
            <span>Default description</span>
            <input value={editing.defaultDescription} onInput={(e) => set({ defaultDescription: val(e) })} />
          </label>
          <label class="field">
            <span>Private notes (never printed)</span>
            <textarea rows={2} value={editing.notes} onInput={(e) => set({ notes: val(e) })} />
          </label>
        </div>

        <div class="sticky-actions">
          <button class="btn ghost" onClick={() => setEditing(undefined)}>
            Cancel
          </button>
          {!isNew && (
            <button
              class="btn danger"
              onClick={() => {
                if (confirm(`Delete ${editing.name}? Saved invoices are kept.`)) {
                  actions.deleteClient(editing.id);
                  setEditing(undefined);
                }
              }}
            >
              Delete
            </button>
          )}
          <button
            class="btn primary grow"
            disabled={!editing.name.trim()}
            onClick={() => {
              actions.saveClient({ ...editing, name: editing.name.trim() });
              setEditing(undefined);
            }}
          >
            Save client
          </button>
        </div>
      </section>
    );
  }

  return (
    <section class="page-wrap">
      <h1>Clients</h1>
      <button
        class="btn primary"
        onClick={() => {
          setIsNew(true);
          setEditing(newClient({ templateId: state.templates[0]?.id ?? '' }));
        }}
      >
        Add client
      </button>
      {state.clients.length === 0 && <p class="empty">No clients yet. Add each company you invoice once, then just pick it when you need an invoice.</p>}
      <ul class="list">
        {state.clients.map((c) => (
          <li key={c.id}>
            <button
              class="list-item"
              onClick={() => {
                setIsNew(false);
                setEditing({ ...c });
              }}
            >
              <div>
                <strong>{c.name}</strong>
                <div class="muted">
                  {state.templates.find((t) => t.id === c.templateId)?.name ?? 'Template'} template
                </div>
              </div>
              <span class="chev">Edit</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
