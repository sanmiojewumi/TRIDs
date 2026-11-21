import { addDays, todayISO } from './dates';
import { computeTotals } from './money';
import { DEFAULT_DESCRIPTION } from './seed';
import type { Bank, Business, Client, Draft, InvoiceData, InvoiceRecord, Template } from './types';

export function emptyDraft(client?: Client): Draft {
  return {
    clientId: client?.id ?? '',
    siteName: '',
    siteAddress: '',
    sitePostcode: '',
    workDates: [todayISO()],
    issueDate: todayISO(),
    customerRef: '',
    notes: '',
    paid: 0,
    items: [{ description: client?.defaultDescription || DEFAULT_DESCRIPTION, qty: 1, rate: 0, materials: false }],
  };
}

export function buildInvoiceData(
  draft: Draft,
  client: Client,
  template: Template,
  business: Business,
  bank: Bank,
  ref: string,
): InvoiceData {
  const items = draft.items.filter((i) => i.rate !== 0 || i.description.trim());
  return {
    ref,
    issueDate: draft.issueDate,
    dueDate: addDays(draft.issueDate, client.paymentTermsDays),
    workDates: [...draft.workDates].sort(),
    siteName: draft.siteName.trim(),
    siteAddress: draft.siteAddress.trim(),
    sitePostcode: draft.sitePostcode.trim().toUpperCase(),
    customerRef: draft.customerRef.trim(),
    notes: draft.notes.trim(),
    items,
    paid: Math.max(0, draft.paid || 0),
    totals: computeTotals(items, business.vatRegistered ? client.vatRate : 0, client.cisRate),
    client: {
      name: client.name,
      phone: client.phone,
      contact: client.contact,
      address: client.address,
      postcode: client.postcode,
      email: client.email,
    },
    business: { ...business },
    bank: { ...bank },
    template: { ...template },
  };
}

/** Opens a saved invoice in the form without changing its reference. */
export function draftFromInvoice(record: InvoiceRecord): Draft {
  const data = record.data;
  return {
    clientId: record.clientId,
    siteName: data.siteName,
    siteAddress: data.siteAddress,
    sitePostcode: data.sitePostcode,
    workDates: data.workDates.length ? [...data.workDates] : [data.issueDate],
    issueDate: data.issueDate,
    customerRef: data.customerRef,
    notes: data.notes,
    paid: data.paid ?? 0,
    items: data.items.map((item) => ({ ...item })),
  };
}

/** Keeps terms and rates when the original client has been removed. */
export function standInClient(record: InvoiceRecord): Client {
  const issued = Date.parse(record.data.issueDate);
  const due = Date.parse(record.data.dueDate);
  const days = Number.isFinite(issued) && Number.isFinite(due) ? Math.max(0, Math.round((due - issued) / 86_400_000)) : 0;
  return {
    id: record.clientId,
    name: record.data.client.name,
    contact: record.data.client.contact,
    address: record.data.client.address,
    postcode: record.data.client.postcode,
    email: record.data.client.email,
    phone: record.data.client.phone ?? '',
    templateId: record.data.template.id,
    paymentTermsDays: days,
    vatRate: record.data.totals.vatRate,
    cisRate: record.data.totals.cisRate,
    defaultDescription: '',
    notes: '',
  };
}

export function validateDraft(draft: Draft): string[] {
  const problems: string[] = [];
  if (!draft.clientId) problems.push('Choose a client.');
  if (!draft.sitePostcode.trim() && !draft.siteAddress.trim() && !draft.siteName.trim()) problems.push('Enter the site address or postcode.');
  if (draft.workDates.length === 0) problems.push('Add at least one work date.');
  if (!draft.items.some((i) => i.rate * i.qty > 0)) problems.push('Enter the amount.');
  return problems;
}
