import type { InvoiceRecord, Numbering } from './types';

export const PATTERN_PRESETS: { label: string; pattern: string }[] = [
  { label: 'Number only', pattern: '{n}' },
  { label: 'Postcode + number', pattern: '{postcode} {n}' },
  { label: 'INV- + number', pattern: 'INV-{n}' },
];

export function formatRef(pattern: string, n: number, clientPostcode = '', date = new Date()): string {
  const postcode = clientPostcode.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const base = pattern || '{n}';
  const ref = base
    .replace(/\{n\}/g, String(n))
    .replace(/\{postcode\}/g, postcode)
    .replace(/\{year\}/g, String(date.getFullYear()))
    .replace(/\s+/g, ' ')
    .trim();
  return base.includes('{n}') ? ref : `${ref} ${n}`.trim();
}

/** The reference the next invoice will receive. Never reuses a saved ref. */
export function nextRef(numbering: Numbering, clientPostcode: string, invoices: InvoiceRecord[]) {
  const used = new Set(invoices.map((i) => i.ref));
  let n = Math.max(1, Math.floor(numbering.next) || 1);
  while (used.has(formatRef(numbering.pattern, n, clientPostcode))) n++;
  return { ref: formatRef(numbering.pattern, n, clientPostcode), number: n };
}
