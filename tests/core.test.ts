import { describe, expect, it } from 'vitest';
import { addDays, formatWorkDates } from '../src/dates';
import { buildInvoiceData, validateDraft, emptyDraft } from '../src/invoice';
import { buildLayout } from '../src/layout';
import { computeTotals, formatMoney, parsePence } from '../src/money';
import { defaultPrefix, formatRef, nextRef } from '../src/refs';
import { builtInTemplates, emptyBusiness, newClient } from '../src/seed';
import type { InvoiceRecord } from '../src/types';

const measure = (t: string, size: number) => t.length * size * 0.19;

describe('money', () => {
  it('parses and formats pence', () => {
    expect(parsePence('£1,250.50')).toBe(125050);
    expect(parsePence('abc')).toBe(0);
    expect(formatMoney(125050)).toBe('£1,250.50');
    expect(formatMoney(5)).toBe('£0.05');
  });

  it('applies VAT on everything and CIS on labour only', () => {
    const t = computeTotals(
      [
        { description: 'Labour', qty: 1, rate: 100000, materials: false },
        { description: 'Materials', qty: 2, rate: 5000, materials: true },
      ],
      20,
      20,
    );
    expect(t.subtotal).toBe(110000);
    expect(t.vat).toBe(22000);
    expect(t.cis).toBe(20000);
    expect(t.total).toBe(112000);
  });
});

describe('references', () => {
  it('builds prefixes and sequential refs', () => {
    expect(defaultPrefix('Company A')).toBe('CA');
    expect(defaultPrefix('Acme')).toBe('ACM');
    expect(formatRef('ca', 7)).toBe('CA-0007');
  });

  it('never reuses a ref that is already saved', () => {
    const client = newClient({ refPrefix: 'CA', nextNumber: 3 });
    const existing = [{ ref: 'CA-0003' }, { ref: 'CA-0004' }] as InvoiceRecord[];
    expect(nextRef(client, existing)).toEqual({ ref: 'CA-0005', number: 5 });
  });
});

describe('dates', () => {
  it('formats work dates compactly', () => {
    expect(formatWorkDates(['2026-10-18'])).toBe('18 Oct 2026');
    expect(formatWorkDates(['2026-10-19', '2026-10-18', '2026-10-22'])).toBe('18, 19 and 22 Oct 2026');
    expect(addDays('2026-10-25', 14)).toBe('2026-11-08');
  });
});

describe('invoice + layout', () => {
  const client = newClient({ name: 'Company A', refPrefix: 'CA', paymentTermsDays: 14, cisRate: 20 });
  const draft = { ...emptyDraft(client), clientId: client.id, sitePostcode: 'sw1a 1aa', issueDate: '2026-11-08', workDates: ['2026-10-18'] };
  draft.items = [{ description: 'Labour', qty: 1, rate: 45000, materials: false }];

  it('validates required fields', () => {
    expect(validateDraft(emptyDraft())).toContain('Choose a client.');
    expect(validateDraft(draft)).toEqual([]);
  });

  it('snapshots dates, postcode and totals', () => {
    const d = buildInvoiceData(draft, client, builtInTemplates[0], { ...emptyBusiness, name: 'Me' }, { accountName: '', sortCode: '', accountNumber: '' }, 'CA-0001');
    expect(d.dueDate).toBe('2026-11-22');
    expect(d.sitePostcode).toBe('SW1A 1AA');
    expect(d.totals.total).toBe(36000);
  });

  it.each(builtInTemplates)('lays out the $name template on one page', (tpl) => {
    const d = buildInvoiceData(draft, client, tpl, { ...emptyBusiness, name: 'Me' }, { accountName: 'Me', sortCode: '00-00-00', accountNumber: '12345678' }, 'CA-0001');
    const layout = buildLayout(d, measure);
    expect(layout.pages).toBe(1);
    const texts = layout.ops.filter((o) => o.t === 'text').map((o) => (o as { text: string }).text);
    expect(texts).toContain('CA-0001');
    expect(texts).toContain('£360.00');
  });

  it('paginates long invoices and keeps every row', () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ description: `Item number ${i + 1} with a longer description to wrap across a line maybe`, qty: 1, rate: 1000, materials: false }));
    const d = buildInvoiceData({ ...draft, items }, client, builtInTemplates[1], { ...emptyBusiness, name: 'Me' }, { accountName: '', sortCode: '', accountNumber: '' }, 'CA-0002');
    const layout = buildLayout(d, measure);
    expect(layout.pages).toBeGreaterThan(1);
    const rows = layout.ops.filter((o) => o.t === 'text' && /^Item number \d+ /.test((o as { text: string }).text));
    expect(rows.length).toBeGreaterThanOrEqual(60);
  });
});
