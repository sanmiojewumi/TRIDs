import type { LineItem, Totals } from './types';

export function parsePence(input: string | number): number {
  if (typeof input === 'number') return Math.round(input * 100);
  const cleaned = input.replace(/[£,\s]/g, '');
  if (!cleaned || Number.isNaN(Number(cleaned))) return 0;
  return Math.round(Number(cleaned) * 100);
}

export function formatMoney(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(Math.round(pence));
  const pounds = Math.floor(abs / 100).toLocaleString('en-GB');
  return `${sign}£${pounds}.${String(abs % 100).padStart(2, '0')}`;
}

export function penceToInput(pence: number): string {
  return pence ? (pence / 100).toFixed(2) : '';
}

export function lineTotal(item: LineItem): number {
  return Math.round(item.qty * item.rate);
}

export function computeTotals(items: LineItem[], vatRate: number, cisRate: number): Totals {
  let labour = 0;
  let materials = 0;
  for (const item of items) {
    if (item.materials) materials += lineTotal(item);
    else labour += lineTotal(item);
  }
  const subtotal = labour + materials;
  const vat = Math.round((subtotal * vatRate) / 100);
  const cis = Math.round((labour * cisRate) / 100);
  return { subtotal, labour, materials, vatRate, vat, cisRate, cis, total: subtotal + vat - cis };
}

/** 1,250.50 (no currency symbol), as used in invoice table columns. */
export function formatPlain(pence: number): string {
  return formatMoney(pence).replace('£', '');
}

/** £ 1,250.50 */
export function formatSpaced(pence: number): string {
  const plain = formatPlain(pence);
  return plain.startsWith('-') ? `-£ ${plain.slice(1)}` : `£ ${plain}`;
}
