import type { Client, InvoiceRecord } from './types';

export function defaultPrefix(clientName: string): string {
  const words = clientName
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'INV';
  if (words.length === 1) return words[0].slice(0, 3);
  return words.map((w) => w[0]).join('').slice(0, 4);
}

export function sanitizePrefix(prefix: string): string {
  return prefix.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 8);
}

export function formatRef(prefix: string, n: number): string {
  return `${sanitizePrefix(prefix) || 'INV'}-${String(n).padStart(4, '0')}`;
}

/** The reference the client's next invoice will receive. Never reuses a saved ref. */
export function nextRef(client: Pick<Client, 'refPrefix' | 'nextNumber'>, invoices: InvoiceRecord[]) {
  const used = new Set(invoices.map((i) => i.ref));
  let n = Math.max(1, client.nextNumber);
  while (used.has(formatRef(client.refPrefix, n))) n++;
  return { ref: formatRef(client.refPrefix, n), number: n };
}
