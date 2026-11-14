import { describe, expect, it } from 'vitest';
import { formatPounds, monthTotals, poundsToPence, shiftMonth } from '../src/money';
import type { Entry } from '../src/types';

function entry(kind: 'in' | 'out', amount: number, date: string): Entry {
  return { id: date + kind + amount, kind, amount, date, category: 'Other', note: '' };
}

describe('money', () => {
  it('reads pounds and pence', () => {
    expect(poundsToPence('85')).toBe(8500);
    expect(poundsToPence('£12.5')).toBe(1250);
    expect(poundsToPence('0')).toBeNull();
    expect(poundsToPence('12.345')).toBeNull();
  });

  it('totals a month and leaves the rest alone', () => {
    const totals = monthTotals(
      [entry('in', 45000, '2026-11-02'), entry('out', 3200, '2026-11-03'), entry('in', 10000, '2026-10-30')],
      '2026-11',
    );
    expect(totals).toEqual({ income: 45000, expense: 3200, left: 41800 });
    expect(formatPounds(totals.left)).toBe('£418.00');
  });

  it('moves between months', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });
});
