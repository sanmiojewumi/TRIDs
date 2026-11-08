import trids from './assets/trids-logo.png?inline';
import type { AppState, Business, Client, Template } from './types';

export const DEFAULT_DESCRIPTION = 'Job';

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
  vatRegistered: false,
};

export const tridsBusiness: Business = {
  ...emptyBusiness,
  name: 'Trids Gas and Plumbing Ltd',
  address: 'Crewe',
  postcode: 'CW1',
  phone: '07311038572',
  logo: trids,
  logoRatio: 400 / 371,
};

export const builtInTemplates: Template[] = [
  {
    id: 'tpl-trade-help',
    name: 'Trade Help',
    layout: 'tradehelp',
    accent: '#1f5f8b',
    title: 'Your Invoice',
    intro: 'Thank you for your custom.\nIf you have any questions please call us on {phone}.',
    showQtyRate: true,
    showLogo: true,
    showBankDetails: true,
    showRegNumbers: false,
    paymentNote: '',
    footerNote: '',
  },
  {
    id: 'tpl-classic',
    name: 'Classic',
    layout: 'classic',
    accent: '#0f6fc6',
    title: 'INVOICE',
    intro: '',
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
    intro: '',
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
    intro: '',
    showQtyRate: false,
    showLogo: true,
    showBankDetails: true,
    showRegNumbers: true,
    paymentNote: '',
    footerNote: '',
  },
];

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
    paymentTermsDays: 14,
    vatRate: 0,
    cisRate: 0,
    defaultDescription: DEFAULT_DESCRIPTION,
    notes: '',
    ...partial,
  };
}

export function starterClients(): Client[] {
  return [
    newClient({
      name: 'Preferred Management Solution Ltd',
      address: 'Preferred House\n4-5 Merchant Court\nHebburn',
      postcode: 'NE31 2EX',
      email: 'accounts@preferredmanagement.co.uk',
      phone: '01914228826',
      templateId: 'tpl-trade-help',
      paymentTermsDays: 0,
    }),
  ];
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
    }),
    newClient({
      name: 'Company B',
      contact: 'Site Office',
      address: '22 Sample Road\nManchester',
      postcode: 'M1 1AE',
      email: 'invoices@company-b.example',
      templateId: 'tpl-classic',
      paymentTermsDays: 30,
    }),
  ];
}

export function freshState(): AppState {
  return {
    version: 1,
    numbering: { next: 1, pattern: '{n}', padding: 5 },
    business: { ...tridsBusiness },
    bank: { accountName: 'Trids Gas and Plumbing Ltd', sortCode: '040605', accountNumber: '30728792' },
    templates: builtInTemplates.map((t) => ({ ...t })),
    clients: starterClients(),
    invoices: [],
  };
}
