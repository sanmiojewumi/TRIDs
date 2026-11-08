export type LayoutStyle = 'classic' | 'banded' | 'minimal';

export interface Template {
  id: string;
  name: string;
  layout: LayoutStyle;
  accent: string;
  title: string;
  showQtyRate: boolean;
  showLogo: boolean;
  showBankDetails: boolean;
  showRegNumbers: boolean;
  paymentNote: string;
  footerNote: string;
}

export interface Client {
  id: string;
  name: string;
  contact: string;
  address: string;
  postcode: string;
  email: string;
  phone: string;
  templateId: string;
  refPrefix: string;
  nextNumber: number;
  paymentTermsDays: number;
  vatRate: number;
  cisRate: number;
  defaultDescription: string;
  notes: string;
}

export interface Business {
  name: string;
  address: string;
  postcode: string;
  phone: string;
  email: string;
  website: string;
  vatNumber: string;
  utr: string;
  companyNumber: string;
  logo: string;
  /** width / height of the logo image. */
  logoRatio: number;
}

export interface Bank {
  accountName: string;
  sortCode: string;
  accountNumber: string;
}

export interface LineItem {
  description: string;
  qty: number;
  /** Unit price in pence. */
  rate: number;
  /** Materials are excluded from the CIS deduction. */
  materials: boolean;
}

export interface Totals {
  subtotal: number;
  labour: number;
  materials: number;
  vatRate: number;
  vat: number;
  cisRate: number;
  cis: number;
  total: number;
}

export interface ClientSnapshot {
  name: string;
  contact: string;
  address: string;
  postcode: string;
  email: string;
}

/** Everything needed to re-render an invoice exactly as it was issued. */
export interface InvoiceData {
  ref: string;
  issueDate: string;
  dueDate: string;
  workDates: string[];
  siteName: string;
  siteAddress: string;
  sitePostcode: string;
  customerRef: string;
  notes: string;
  items: LineItem[];
  totals: Totals;
  client: ClientSnapshot;
  business: Business;
  bank: Bank;
  template: Template;
}

export interface InvoiceRecord {
  id: string;
  clientId: string;
  ref: string;
  createdAt: string;
  status: 'unpaid' | 'paid';
  paidAt?: string;
  data: InvoiceData;
}

export interface AppState {
  version: 1;
  business: Business;
  bank: Bank;
  templates: Template[];
  clients: Client[];
  invoices: InvoiceRecord[];
}

/** What the "new invoice" form edits. */
export interface Draft {
  clientId: string;
  siteName: string;
  siteAddress: string;
  sitePostcode: string;
  workDates: string[];
  issueDate: string;
  customerRef: string;
  notes: string;
  items: LineItem[];
}
