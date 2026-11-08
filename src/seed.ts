import type { AppState, Business, Client, Template } from './types';

export const emptyBusiness: Business = {
  name: '',
  address: '',
  postcode: '',
  phone: '',
  email: '',
  website: '',
  vatNumber: '',
  utr: '',
  companyNumber: '',
  logo: '',
  logoRatio: 1,
};

export const builtInTemplates: Template[] = [
  {
    id: 'tpl-trade-help',
    name: 'Trade Help',
    layout: 'classic',
    accent: '#0f6fc6',
    title: 'INVOICE',
    showQtyRate: false,
    showLogo: true,
    showBankDetails: true,
    showRegNumbers: true,
    paymentNote: 'Please use {ref} as your payment reference.',
    footerNote: 'Thank you for your business.',
  },
  {
    id: 'tpl-banded',
    name: 'Banded',
    layout: 'banded',
    accent: '#1b4d3e',
    title: 'INVOICE',
    showQtyRate: true,
    showLogo: true,
    showBankDetails: true,
    showRegNumbers: true,
    paymentNote: 'Please use {ref} as your payment reference.',
    footerNote: '',
  },
  {
    id: 'tpl-minimal',
    name: 'Minimal',
    layout: 'minimal',
    accent: '#344054',
    title: 'Invoice',
    showQtyRate: false,
    showLogo: true,
    showBankDetails: true,
    showRegNumbers: true,
    paymentNote: '',
    footerNote: '',
  },
];

export function freshState(): AppState {
  return {
    version: 1,
    business: { ...emptyBusiness },
    bank: { accountName: '', sortCode: '', accountNumber: '' },
    templates: builtInTemplates.map((t) => ({ ...t })),
    clients: [],
    invoices: [],
  };
}

export function newClient(partial: Partial<Client> = {}): Client {
  return {
    id: crypto.randomUUID(),
    name: '',
    contact: '',
    address: '',
    postcode: '',
    email: '',
    phone: '',
    templateId: builtInTemplates[0].id,
    refPrefix: '',
    nextNumber: 1,
    paymentTermsDays: 14,
    vatRate: 0,
    cisRate: 0,
    defaultDescription: 'Labour',
    notes: '',
    ...partial,
  };
}

export function sampleClients(): Client[] {
  return [
    newClient({
      name: 'Company A',
      contact: 'Accounts Dept',
      address: '1 Example Street\nLondon',
      postcode: 'EC1A 1BB',
      email: 'accounts@company-a.example',
      templateId: 'tpl-trade-help',
      refPrefix: 'CA',
      cisRate: 20,
      defaultDescription: 'Labour - works carried out as instructed',
    }),
    newClient({
      name: 'Company B',
      contact: 'Site Office',
      address: '22 Sample Road\nManchester',
      postcode: 'M1 1AE',
      email: 'invoices@company-b.example',
      templateId: 'tpl-banded',
      refPrefix: 'CB',
      vatRate: 20,
      paymentTermsDays: 30,
      defaultDescription: 'Maintenance works',
    }),
  ];
}
