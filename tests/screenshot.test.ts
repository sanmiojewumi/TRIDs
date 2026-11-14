import { describe, expect, it } from 'vitest';
import { readInvoiceText } from '../src/screenshot';
import type { Client } from '../src/types';

const mk = (id: string, name: string): Client => ({
  id, name, contact: '', address: '', postcode: '', email: '', phone: '', templateId: 't',
  paymentTermsDays: 14, vatRate: 0, cisRate: 0, defaultDescription: '', notes: '',
});

const today = new Date(2026, 10, 14);

describe('readInvoiceText', () => {
  it('fills a known client, the site and the amount from screenshot text', () => {
    const text = ['Preferred Management Solution Ltd', '14 Victoria Street', 'Crewe', 'CW1 2BP', 'Boiler service', 'Total £450.00', '14 Nov 2026'].join('\n');
    const read = readInvoiceText(text, [mk('p', 'Preferred Management Solution Ltd')], today);
    expect(read.clientId).toBe('p');
    expect(read.newClient).toBeUndefined();
    expect(read.sitePostcode).toBe('CW1 2BP');
    expect(read.siteAddress).toContain('Victoria Street');
    expect(read.amount).toBe(45000);
    expect(read.description).toMatch(/Boiler/i);
    expect(read.workDates).toEqual(['2026-11-14']);
  });

  it('keeps a new customer when the name is not saved yet', () => {
    const text = ['Client: Mrs A Khan', 'Address: 8 Nantwich Road, Crewe', 'CW5 5DG', 'Phone: 07123 456789', 'Leak repair', 'Amount due £85'].join('\n');
    const read = readInvoiceText(text, [], today);
    expect(read.clientId).toBeUndefined();
    expect(read.newClient?.name).toBe('Mrs A Khan');
    expect(read.newClient?.phone).toBe('07123456789');
    expect(read.newClient?.postcode).toBe('CW5 5DG');
    expect(read.amount).toBe(8500);
    expect(read.description).toMatch(/Leak/i);
  });

  it('ignores the Trids name on the business header', () => {
    const read = readInvoiceText('Trids Gas and Plumbing Ltd\nMrs Khan\nHigh Street\nCW1 4AB\n£120', [], today);
    expect(read.newClient?.name).toBe('Mrs Khan');
    expect(read.amount).toBe(12000);
  });
});
