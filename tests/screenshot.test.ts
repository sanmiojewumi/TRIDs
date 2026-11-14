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
    expect(read.siteAddress).toBe('14 Victoria Street');
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
    expect(read.siteAddress).toBe('8 Nantwich Road');
    expect(read.amount).toBe(8500);
    expect(read.description).toMatch(/Leak/i);
  });

  it('ignores chat chrome and uses the total, not an earlier price', () => {
    const text = [
      'WhatsApp', 'Mum', 'Online', 'Yesterday', '14:22', 'Please invoice this',
      'Mrs A Khan', '14 High Street', 'Crewe', 'CW1 2BP', 'Boiler service',
      'Call out £40', 'Total £450', 'Delivered', 'Thanks',
    ].join('\n');
    const read = readInvoiceText(text, [], today);
    expect(read.newClient?.name).toBe('Mrs A Khan');
    expect(read.amount).toBe(45000);
    expect(read.sitePostcode).toBe('CW1 2BP');
    expect(read.siteAddress).toContain('High Street');
    expect(read.description).toMatch(/Boiler/i);
    expect(read.workDates).toEqual([]);
  });

  it('keeps the first address line and postcode, and replaces upload invoice with Job', () => {
    const text = [
      'Tenants are still at the property',
      '< Work Order, Updated Thursday, Nov 12th',
      '12 King Street',
      'Newcastle',
      'ST5 3TZ',
      'Job: Upload an invoice',
      'Total £455.00',
    ].join('\n');
    const read = readInvoiceText(text, [mk('p', 'Preferred Management Solution Ltd')], today);
    expect(read.siteAddress).toBe('12 King Street');
    expect(read.sitePostcode).toBe('ST5 3TZ');
    expect(read.description).toBe('Job');
    expect(read.amount).toBe(45500);
    expect(read.siteAddress).not.toMatch(/property|Work Order/i);
  });

  it('splits a one-line note into the street, postcode and job', () => {
    const read = readInvoiceText('22 Queen Street, ST5 3TZ, boiler repair', [], today);
    expect(read.siteAddress).toBe('22 Queen Street');
    expect(read.sitePostcode).toBe('ST5 3TZ');
    expect(read.description).toBe('boiler repair');
  });

  it('uses a typed note for the job and the first address line', () => {
    const text = ['Work Order, Updated Thursday', 'ST5 3TZ', 'Upload an invoice', '£455'].join('\n');
    const read = readInvoiceText(text, [], today, '22 Queen Street\nboiler repair');
    expect(read.siteAddress).toBe('22 Queen Street');
    expect(read.sitePostcode).toBe('ST5 3TZ');
    expect(read.description).toBe('boiler repair');
    expect(read.amount).toBe(45500);
    expect(read.newClient).toBeUndefined();
  });

  it('ignores the Trids name on the business header', () => {
    const read = readInvoiceText('Trids Gas and Plumbing Ltd\nMrs Khan\nHigh Street\nCW1 4AB\n£120', [], today);
    expect(read.newClient?.name).toBe('Mrs Khan');
    expect(read.amount).toBe(12000);
  });
});
