import type { InvoiceRecord, Numbering } from './types';

export const REF_FORMATS: { id: string; label: string; pattern: string }[] = [
  { id: 'number', label: 'Number only', pattern: '{n}' },
  { id: 'postcode', label: 'Client postcode + number', pattern: '{postcode} {n}' },
];

export function formatRef(pattern: string, n: number, clientPostcode = '', padding = 0): string {
  const postcode = clientPostcode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = pattern || '{n}';
  const num = String(n).padStart(Math.max(0, padding), '0');
  const ref = base
    .replace(/\{n\}/g, num)
    .replace(/\{postcode\}/g, postcode)
    .replace(/\s+/g, ' ')
    .trim();
  return base.includes('{n}') ? ref : `${ref} ${num}`.trim();
}

/** The reference the next invoice will receive. Never reuses a saved ref. */
export function nextRef(numbering: Numbering, clientPostcode: string, invoices: InvoiceRecord[]) {
  const used = new Set(invoices.map((i) => i.ref));
  let n = Math.max(1, Math.floor(numbering.next) || 1);
  const make = (k: number) => formatRef(numbering.pattern, k, clientPostcode, numbering.padding);
  while (used.has(make(n))) n++;
  return { ref: make(n), number: n };
}
