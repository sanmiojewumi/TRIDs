import { addDays, todayISO } from './dates';
import { computeTotals } from './money';
import type { Bank, Business, Client, Draft, InvoiceData, Template } from './types';

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
    items: [{ description: client?.defaultDescription || 'Labour', qty: 1, rate: 0, materials: false }],
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
    totals: computeTotals(items, client.vatRate, client.cisRate),
    client: {
      name: client.name,
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

export function validateDraft(draft: Draft): string[] {
  const problems: string[] = [];
  if (!draft.clientId) problems.push('Choose a client.');
  if (!draft.sitePostcode.trim() && !draft.siteAddress.trim() && !draft.siteName.trim()) problems.push('Enter the site address or postcode.');
  if (draft.workDates.length === 0) problems.push('Add at least one work date.');
  if (!draft.items.some((i) => i.rate * i.qty > 0)) problems.push('Enter the amount.');
  return problems;
}
