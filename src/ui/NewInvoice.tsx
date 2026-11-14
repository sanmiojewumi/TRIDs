import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatWorkDates, todayISO } from '../dates';
import { buildInvoiceData, emptyDraft, validateDraft } from '../invoice';
import { formatMoney, lineTotal } from '../money';
import { DEFAULT_DESCRIPTION } from '../seed';
import { parsePrompt, type ParsedPrompt } from '../prompt';
import { nextRef } from '../refs';
import { actions, templateFor, useStore } from '../store';
import type { Draft, InvoiceRecord, LineItem } from '../types';
import { MoneyField } from './MoneyField';
import { Preview } from './Preview';
import { val } from './util';

const DRAFT_KEY = 'invoice-desk.draft';

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyDraft(), ...JSON.parse(raw) };
  } catch {
    /* ignore corrupt draft */
  }
  return emptyDraft();
}

export function seedDraftFromRecord(rec: InvoiceRecord) {
  const d = rec.data;
  const draft: Draft = {
    clientId: rec.clientId,
    siteName: d.siteName,
    siteAddress: d.siteAddress,
    sitePostcode: d.sitePostcode,
    workDates: [todayISO()],
    issueDate: todayISO(),
    customerRef: d.customerRef,
    notes: d.notes,
    paid: 0,
    items: d.items.map((i) => ({ ...i })),
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

export function NewInvoice() {
  const state = useStore();
  const [draft, setDraftRaw] = useState<Draft>(loadDraft);
  const [prompt, setPrompt] = useState('');
  const [understood, setUnderstood] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [saved, setSaved] = useState<InvoiceRecord | undefined>();
  const [problems, setProblems] = useState<string[]>([]);
  const [detailed, setDetailed] = useState(false);
  const [more, setMore] = useState(false);

  const setDraft = (patch: Partial<Draft>) =>
    setDraftRaw((d) => {
      const next = { ...d, ...patch };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      return next;
    });

  const client = state.clients.find((c) => c.id === draft.clientId);

  useEffect(() => {
    if (draft.clientId && !client) setDraft({ clientId: '' });
    if (draft.items.length > 1 || draft.items[0]?.qty !== 1) setDetailed(true);
  }, []);

  const pickClient = (id: string) => {
    const c = state.clients.find((x) => x.id === id);
    const items = draft.items.map((i, idx) =>
      idx === 0 && c && (!i.description || state.clients.some((o) => o.defaultDescription === i.description) || i.description === DEFAULT_DESCRIPTION)
        ? { ...i, description: c.defaultDescription || i.description }
        : i,
    );
    setDraft({ clientId: id, items });
  };

  const applyPrompt = () => {
    const p: ParsedPrompt = parsePrompt(prompt, state.clients);
    const found: string[] = [];
    const patch: Partial<Draft> = {};
    if (p.clientId) {
      const c = state.clients.find((x) => x.id === p.clientId)!;
      patch.clientId = c.id;
      found.push(`Client: ${c.name}`);
    }
    if (p.workDates.length) {
      patch.workDates = p.workDates;
      found.push(`Work date: ${formatWorkDates(p.workDates)}`);
    }
    if (p.sitePostcode) {
      patch.sitePostcode = p.sitePostcode;
      found.push(`Postcode: ${p.sitePostcode}`);
    }
    if (p.siteAddress) {
      patch.siteAddress = p.siteAddress;
      found.push(`Address: ${p.siteAddress}`);
    }
    const c = state.clients.find((x) => x.id === (patch.clientId ?? draft.clientId));
    const items = [...draft.items];
    if (p.amount !== undefined || p.description) {
      const first: LineItem = { ...items[0], qty: 1 };
      if (p.amount !== undefined) {
        first.rate = p.amount;
        found.push(`Amount: ${formatMoney(p.amount)}`);
      }
      if (p.description) {
        first.description = p.description;
        found.push(`Description: ${p.description}`);
      } else if (c && (!first.description || first.description === DEFAULT_DESCRIPTION)) first.description = c.defaultDescription || first.description;
      items[0] = first;
      patch.items = items;
    } else if (c && patch.clientId && items[0] && (!items[0].description || items[0].description === DEFAULT_DESCRIPTION)) {
      items[0] = { ...items[0], description: c.defaultDescription || items[0].description };
      patch.items = items;
    }
    setUnderstood(found);
    setDraft(patch);
    if (found.length) setDetailed(items.length > 1);
  };

  const updateItem = (idx: number, patch: Partial<LineItem>) =>
    setDraft({ items: draft.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) });

  const preview = useMemo(() => {
    if (!client) return undefined;
    const { ref } = nextRef(state.numbering, client.postcode, state.invoices);
    return buildInvoiceData(draft, client, templateFor(state, client), state.business, state.bank, ref);
  }, [draft, client, state]);

  const openPreview = () => {
    const p = validateDraft(draft);
    setProblems(p);
    if (p.length === 0) setShowPreview(true);
  };

  const reset = () => {
    localStorage.removeItem(DRAFT_KEY);
    const c = state.clients.find((x) => x.id === draft.clientId);
    setDraftRaw(emptyDraft(c));
    setPrompt('');
    setUnderstood([]);
    setSaved(undefined);
    setShowPreview(false);
    setDetailed(false);
  };

  const setDate = (idx: number, v: string) => {
    if (!v) return;
    const dates = draft.workDates.map((d, i) => (i === idx ? v : d));
    setDraft({ workDates: dates });
  };

  const businessMissing = !state.business.name;
  const single = !detailed;

  return (
    <section class="page-wrap">
      <h1>New invoice</h1>

      {businessMissing && (
        <div class="notice">
          Add your business details and bank details in <a href="#/settings">Settings</a> so they appear on every invoice.
        </div>
      )}
      {state.clients.length === 0 && (
        <div class="notice">
          You need at least one client. <a href="#/clients">Add a client</a> (or load sample clients from Settings).
        </div>
      )}

      <div class="card">
        <label class="field">
          <span>Quick prompt</span>
          <textarea
            rows={2}
            placeholder="e.g. Company A, work done on the 18th, SW1A 1AA, £450"
            value={prompt}
            onInput={(e) => setPrompt(val(e))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) applyPrompt();
            }}
          />
        </label>
        <div class="row">
          <button class="btn" onClick={applyPrompt} disabled={!prompt.trim()}>
            Fill form from prompt
          </button>
          <span class="hint">Runs on this device. Nothing is sent anywhere.</span>
        </div>
        {understood.length > 0 && (
          <ul class="chips" aria-label="What was understood">
            {understood.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        )}
        {prompt.trim() && understood.length === 0 && <p class="hint">Nothing recognised yet. Fill the form below instead.</p>}
      </div>

      <div class="card">
        <label class="field">
          <span>Client</span>
          <select value={draft.clientId} onChange={(e) => pickClient(val(e))}>
            <option value="">Select a client</option>
            {state.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {client && (
          <p class="hint">
            Template: {templateFor(state, client).name} | Next ref: {nextRef(state.numbering, client.postcode, state.invoices).ref} | Terms: {client.paymentTermsDays === 0 ? 'due on receipt' : `${client.paymentTermsDays} days`}
            {state.business.vatRegistered && client.vatRate > 0 && ` | VAT ${client.vatRate}%`}
          </p>
        )}

        <label class="field">
          <span>Site address</span>
          <textarea rows={2} value={draft.siteAddress} placeholder="Street, town" onInput={(e) => setDraft({ siteAddress: val(e) })} />
        </label>
        <div class="grid2">
          <label class="field">
            <span>Postcode</span>
            <input
              value={draft.sitePostcode}
              autocapitalize="characters"
              autocomplete="postal-code"
              placeholder="SW1A 1AA"
              onInput={(e) => setDraft({ sitePostcode: val(e).toUpperCase() })}
            />
          </label>
          <label class="field">
            <span>Occupier / contact (optional)</span>
            <input value={draft.siteName} placeholder="e.g. M Austin" onInput={(e) => setDraft({ siteName: val(e) })} />
          </label>
        </div>

        <div class="field">
          <span>{draft.workDates.length > 1 ? 'Dates of work' : 'Date of work'}</span>
          {draft.workDates.map((d, i) => (
            <div class="row" key={i}>
              <input type="date" class="grow" value={d} onInput={(e) => setDate(i, val(e))} />
              {draft.workDates.length > 1 && (
                <button class="btn ghost" aria-label="Remove date" onClick={() => setDraft({ workDates: draft.workDates.filter((_, x) => x !== i) })}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button class="btn ghost small" onClick={() => setDraft({ workDates: [...draft.workDates, draft.workDates[draft.workDates.length - 1] ?? todayISO()] })}>
            + Add another date
          </button>
        </div>

        {single ? (
          <div class="grid2">
            <label class="field">
              <span>{state.business.vatRegistered ? 'Amount (£, before VAT)' : 'Amount (£)'}</span>
              <MoneyField pence={draft.items[0]?.rate ?? 0} onPence={(rate) => updateItem(0, { rate, qty: 1 })} />
            </label>
            <label class="field">
              <span>Description</span>
              <input value={draft.items[0]?.description ?? ''} onInput={(e) => updateItem(0, { description: val(e) })} />
            </label>
          </div>
        ) : (
          <div class="items">
            <span class="label">Line items</span>
            {draft.items.map((it, i) => (
              <div class="item" key={i}>
                <input placeholder="Description" value={it.description} onInput={(e) => updateItem(i, { description: val(e) })} />
                <div class="item-nums">
                  <label>
                    Qty
                    <input inputMode="decimal" value={String(it.qty)} onInput={(e) => updateItem(i, { qty: Number(val(e)) || 0 })} />
                  </label>
                  <label>
                    Unit price £
                    <MoneyField pence={it.rate} onPence={(rate) => updateItem(i, { rate })} />
                  </label>
                  <div class="item-total">{formatMoney(lineTotal(it))}</div>
                </div>
                <div class="row">
                  {draft.items.length > 1 && (
                    <button class="btn ghost small" onClick={() => setDraft({ items: draft.items.filter((_, x) => x !== i) })}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button class="btn ghost small" onClick={() => setDraft({ items: [...draft.items, { description: '', qty: 1, rate: 0, materials: false }] })}>
              + Add line
            </button>
          </div>
        )}
        <button
          class="linklike"
          onClick={() => {
            if (detailed && draft.items.length > 1 && !confirm('Switch to a single amount? Extra lines will be removed.')) return;
            if (detailed) setDraft({ items: [{ ...draft.items[0], qty: 1, rate: draft.items.reduce((s, i) => s + lineTotal(i), 0) }] });
            setDetailed(!detailed);
          }}
        >
          {detailed ? 'Use a single amount' : 'Itemise (several lines, materials, quantities)'}
        </button>

        <button class="linklike" onClick={() => setMore(!more)}>
          {more ? 'Hide extra fields' : 'Extra fields (PO / your ref, notes, invoice date)'}
        </button>
        {more && (
          <div class="more">
            <div class="grid2">
              <label class="field">
                <span>Customer PO / ref</span>
                <input value={draft.customerRef} onInput={(e) => setDraft({ customerRef: val(e) })} />
              </label>
              <label class="field">
                <span>Invoice date</span>
                <input type="date" value={draft.issueDate} onInput={(e) => val(e) && setDraft({ issueDate: val(e) })} />
              </label>
            </div>
            <label class="field">
              <span>Already paid (£)</span>
              <MoneyField pence={draft.paid} onPence={(paid) => setDraft({ paid })} />
            </label>
            <label class="field">
              <span>Notes (shown on the invoice)</span>
              <textarea rows={3} value={draft.notes} onInput={(e) => setDraft({ notes: val(e) })} />
            </label>
          </div>
        )}
      </div>

      {preview && preview.totals.total !== 0 && (
        <div class="card totals">
          <div>
            <span>Subtotal</span>
            <b>{formatMoney(preview.totals.subtotal)}</b>
          </div>
          {preview.totals.vat > 0 && (
            <div>
              <span>VAT {preview.totals.vatRate}%</span>
              <b>{formatMoney(preview.totals.vat)}</b>
            </div>
          )}
          <div class="grand">
            <span>{draft.paid > 0 ? 'Balance due' : 'Total due'}</span>
            <b>{formatMoney(preview.totals.total - draft.paid)}</b>
          </div>
        </div>
      )}

      {problems.length > 0 && (
        <div class="error" role="alert">
          {problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}

      <div class="sticky-actions">
        <button class="btn ghost" onClick={() => confirm('Clear the form?') && reset()}>
          Clear
        </button>
        <button class="btn primary grow" onClick={openPreview}>
          Preview invoice
        </button>
      </div>

      {showPreview && client && preview && (
        <Preview
          data={preview}
          record={saved}
          onIssue={() => {
            const rec = actions.issueInvoice(draft);
            setSaved(rec);
            return rec;
          }}
          onClose={() => {
            setShowPreview(false);
            if (saved) reset();
          }}
          onNew={reset}
          onDuplicate={(r) => {
            seedDraftFromRecord(r);
            setSaved(undefined);
            setShowPreview(false);
            setDraftRaw(loadDraft());
          }}
          onTogglePaid={(r) => actions.setInvoiceStatus(r.id, r.status === 'paid' ? 'unpaid' : 'paid')}
          onDelete={(r) => {
            actions.deleteInvoice(r.id);
            reset();
          }}
        />
      )}
    </section>
  );
}
