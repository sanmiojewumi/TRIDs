import { describe, expect, it } from 'vitest';
import { parsePrompt } from '../src/prompt';
import type { Client } from '../src/types';

const mk = (id: string, name: string): Client => ({
  id, name, contact: '', address: '', postcode: '', email: '', phone: '', templateId: 't',
  refPrefix: 'X', nextNumber: 1, paymentTermsDays: 14, vatRate: 0, cisRate: 0, defaultDescription: '', notes: '',
});
const clients = [mk('a', 'Company A'), mk('b', 'Company B'), mk('c', 'Acme Building Ltd')];
const today = new Date(2026, 10, 8);

describe('parsePrompt', () => {
  it('handles the example prompt from the brief', () => {
    const r = parsePrompt('generate an invoice for companyA with work done on the 18th, post code SW1A 1AA', clients, today);
    expect(r.clientId).toBe('a');
    expect(r.workDates).toEqual(['2026-10-18']);
    expect(r.sitePostcode).toBe('SW1A 1AA');
  });

  it('picks the right company among similar names', () => {
    expect(parsePrompt('invoice for company b', clients, today).clientId).toBe('b');
    expect(parsePrompt('invoice acme £500', clients, today).clientId).toBe('c');
  });

  it('parses amount, address and date together', () => {
    const r = parsePrompt('Company B invoice, site at 12 High Street, Leeds, ls1 4ab, £1,250.50, worked 3rd Nov', clients, today);
    expect(r.amount).toBe(125050);
    expect(r.sitePostcode).toBe('LS1 4AB');
    expect(r.siteAddress).toBe('12 High Street, Leeds');
    expect(r.workDates).toEqual(['2026-11-03']);
  });

  it('parses multiple dates, ranges and relative days', () => {
    expect(parsePrompt('company a 18th, 19th and 22nd', clients, today).workDates).toEqual(['2026-10-18', '2026-10-19', '2026-10-22']);
    expect(parsePrompt('company a 3rd to 5th', clients, today).workDates).toEqual(['2026-11-03', '2026-11-04', '2026-11-05']);
    expect(parsePrompt('company a yesterday', clients, today).workDates).toEqual(['2026-11-07']);
    expect(parsePrompt('company a last friday', clients, today).workDates).toEqual(['2026-11-06']);
    expect(parsePrompt('company a 18/10', clients, today).workDates).toEqual(['2026-10-18']);
    expect(parsePrompt('company a 18 October 2025', clients, today).workDates).toEqual(['2025-10-18']);
  });

  it('rolls bare days back into the previous month when they are in the future', () => {
    expect(parsePrompt('company a on the 20th', clients, today).workDates).toEqual(['2026-10-20']);
  });

  it('does not treat an address number as money or a date', () => {
    const r = parsePrompt('company a at 18 Park Road sw1a 1aa £90', clients, today);
    expect(r.amount).toBe(9000);
    expect(r.workDates).toEqual([]);
    expect(r.siteAddress).toBe('18 Park Road');
  });
});
