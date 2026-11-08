export type LayoutStyle = 'tradehelp' | 'classic' | 'banded' | 'minimal';

export interface Template {
  id: string;
  name: string;
  layout: LayoutStyle;
  accent: string;
  title: string;
  /** Text under the title (tradehelp layout). {phone} is replaced with the business phone. */
  intro: string;
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
  vatRegistered: boolean;
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
  phone?: string;
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
  /** Amount already paid, in pence. */
  paid?: number;
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

export interface Numbering {
  /** Next number in the single running sequence. */
  next: number;
  /** Tokens: {n} sequence number, {postcode} client postcode without spaces, {year}. */
  pattern: string;
  /** Zero-pad the number to this many digits (5 gives 00001). */
  padding: number;
}

export interface AppState {
  version: 1;
  numbering: Numbering;
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
  /** Amount already paid, in pence. */
  paid: number;
}
