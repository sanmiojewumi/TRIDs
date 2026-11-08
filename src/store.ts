import { useEffect, useState } from 'preact/hooks';
import { buildInvoiceData } from './invoice';
import { nextRef } from './refs';
import { builtInTemplates, emptyBusiness, freshState, sampleClients } from './seed';
import type { AppState, Client, Draft, InvoiceRecord, Numbering, Template } from './types';

const KEY = 'invoice-desk.v1';

function migrate(raw: unknown): AppState {
  const base = freshState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppState>;
  const templates = (Array.isArray(r.templates) && r.templates.length ? r.templates : base.templates).map((t) => ({
    ...(builtInTemplates.find((b) => b.id === t.id) ?? builtInTemplates[1]),
    ...t,
  }));
  return {
    version: 1,
    numbering: { ...base.numbering, ...(r.numbering ?? {}) },
    business: { ...emptyBusiness, ...(r.business ?? {}) },
    bank: { ...base.bank, ...(r.bank ?? {}) },
    templates,
    clients: Array.isArray(r.clients) ? r.clients : [],
    invoices: Array.isArray(r.invoices) ? r.invoices : [],
  };
}

function load(): AppState {
  try {
    const text = localStorage.getItem(KEY);
    return text ? migrate(JSON.parse(text)) : freshState();
  } catch {
    return freshState();
  }
}

let state: AppState = load();
let saveError = '';
const listeners = new Set<() => void>();

function commit(next: AppState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = '';
  } catch (e) {
    saveError = `Could not save to this device (${e instanceof Error ? e.message : 'storage full'}). Export a backup.`;
  }
  listeners.forEach((l) => l());
}

export function getState(): AppState {
  return state;
}

export function getSaveError(): string {
  return saveError;
}

export function useStore(): AppState {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return state;
}

export function templateFor(s: AppState, client: Client): Template {
  return s.templates.find((t) => t.id === client.templateId) ?? s.templates[0] ?? builtInTemplates[0];
}

export const actions = {
  setBusiness(business: AppState['business']) {
    commit({ ...state, business });
  },
  setBank(bank: AppState['bank']) {
    commit({ ...state, bank });
  },
  setNumbering(numbering: Numbering) {
    commit({ ...state, numbering: { ...numbering, next: Math.max(1, Math.floor(numbering.next) || 1) } });
  },
  saveClient(client: Client) {
    const clean = { ...client };
    const exists = state.clients.some((c) => c.id === clean.id);
    const clients = exists ? state.clients.map((c) => (c.id === clean.id ? clean : c)) : [...state.clients, clean];
    clients.sort((a, b) => a.name.localeCompare(b.name));
    commit({ ...state, clients });
  },
  deleteClient(id: string) {
    commit({ ...state, clients: state.clients.filter((c) => c.id !== id) });
  },
  saveTemplate(t: Template) {
    const exists = state.templates.some((x) => x.id === t.id);
    commit({ ...state, templates: exists ? state.templates.map((x) => (x.id === t.id ? t : x)) : [...state.templates, t] });
  },
  deleteTemplate(id: string) {
    if (state.templates.length <= 1) return;
    const fallback = state.templates.find((t) => t.id !== id)!.id;
    commit({
      ...state,
      templates: state.templates.filter((t) => t.id !== id),
      clients: state.clients.map((c) => (c.templateId === id ? { ...c, templateId: fallback } : c)),
    });
  },
  /** Assigns the next number in the running sequence, stores a full snapshot, and advances the counter. */
  issueInvoice(draft: Draft): InvoiceRecord {
    const client = state.clients.find((c) => c.id === draft.clientId);
    if (!client) throw new Error('Client not found');
    const { ref, number } = nextRef(state.numbering, client.postcode, state.invoices);
    const data = buildInvoiceData(draft, client, templateFor(state, client), state.business, state.bank, ref);
    const record: InvoiceRecord = {
      id: crypto.randomUUID(),
      clientId: client.id,
      ref,
      createdAt: new Date().toISOString(),
      status: 'unpaid',
      data,
    };
    commit({
      ...state,
      invoices: [record, ...state.invoices],
      numbering: { ...state.numbering, next: number + 1 },
    });
    return record;
  },
  setInvoiceStatus(id: string, status: 'paid' | 'unpaid') {
    commit({
      ...state,
      invoices: state.invoices.map((i) =>
        i.id === id ? { ...i, status, paidAt: status === 'paid' ? new Date().toISOString() : undefined } : i,
      ),
    });
  },
  deleteInvoice(id: string) {
    commit({ ...state, invoices: state.invoices.filter((i) => i.id !== id) });
  },
  exportJSON(): string {
    return JSON.stringify(state, null, 2);
  },
  importJSON(text: string) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !('clients' in parsed)) throw new Error('This is not an Invoice Desk backup file.');
    commit(migrate(parsed));
  },
  loadSampleClients() {
    const have = new Set(state.clients.map((c) => c.name));
    const add = sampleClients().filter((c) => !have.has(c.name));
    commit({ ...state, clients: [...state.clients, ...add] });
  },
  resetAll() {
    commit(freshState());
  },
};
