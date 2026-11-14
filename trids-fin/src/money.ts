import type { Entry, Kind } from './types';

export const INCOME = ['Call-out', 'Labour', 'Materials charged', 'Other income'];
export const EXPENSE = ['Materials', 'Fuel', 'Tools', 'Parking', 'Insurance', 'Phone', 'Other expense'];

export function categories(kind: Kind): string[] {
  return kind === 'in' ? INCOME : EXPENSE;
}

export function poundsToPence(value: string): number | null {
  const cleaned = value.trim().replace(/£/g, '').replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  const pence = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return pence > 0 ? pence : null;
}

export function formatPounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  const abs = Math.abs(pence);
  return `${sign}£${(abs / 100).toFixed(2)}`;
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}

export function monthTotals(entries: Entry[], month: string): { income: number; expense: number; left: number } {
  const inMonth = entries.filter((entry) => monthKey(entry.date) === month);
  const income = inMonth.filter((entry) => entry.kind === 'in').reduce((sum, entry) => sum + entry.amount, 0);
  const expense = inMonth.filter((entry) => entry.kind === 'out').reduce((sum, entry) => sum + entry.amount, 0);
  return { income, expense, left: income - expense };
}

export function shiftMonth(month: string, by: number): string {
  const [year, mon] = month.split('-').map(Number);
  const date = new Date(year, (mon || 1) - 1 + by, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, (mon || 1) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
