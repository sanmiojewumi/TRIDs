import { formatDMY, formatLongDate } from './dates';
import { PAGE_H, PAGE_W, createCanvas, wrapText, type Layout, type Measure } from './layout-core';
import { formatPlain, formatSpaced, lineTotal } from './money';
import type { InvoiceData } from './types';

const MARGIN = 15;
const RIGHT = PAGE_W - MARGIN;
const GREY = '#5b6068';
const BAR_Y = PAGE_H - 25;
const COL = { desc: MARGIN, qty: 118, unit: 160, cost: RIGHT };

function brighten(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const k = Math.min(2.2, 225 / Math.max(...c, 1));
  return `#${c.map((v) => Math.min(255, Math.round(v * k)).toString(16).padStart(2, '0')).join('')}`;
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.replace('#', ''), 16);
  const pb = parseInt(b.replace('#', ''), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

/** Layout modelled on the Trade Help invoice PDF: title and intro on the left, logo on the right, gradient rules. */
export function buildTradeHelpLayout(inv: InvoiceData, measure: Measure): Layout {
  const { template: tpl, business: biz, client, totals, bank } = inv;
  const accent = tpl.accent;
  const c = createCanvas(measure);
  const paid = inv.paid ?? 0;
  const balance = totals.total - paid;

  const gradientBar = (y: number) => {
    const slices = 48;
    const w = PAGE_W / slices;
    const light = brighten(accent);
    for (let i = 0; i < slices; i++) c.rect(i * w, y, w + 0.3, 1.6, mixHex(accent, light, i / (slices - 1)));
  };

  const heading = (x: number, y: number, label: string) => c.text(x, y, label, 10, { bold: true, color: accent });

  let y = 0;
  const logoH = 34;
  const logoW = Math.min(50, logoH * (biz.logoRatio || 1));
  if (tpl.showLogo && biz.logo) c.image(RIGHT - logoW, 9, logoW, logoH, biz.logo);
  c.text(MARGIN, 29, tpl.title, 24, { color: accent });
  const intro = tpl.intro.replace(/\{phone\}/g, biz.phone);
  let iy = 40;
  for (const l of wrapText(intro, 115, 9.5, false, measure)) {
    c.text(MARGIN, iy, l, 9.5, { color: GREY });
    iy += c.lh(9.5);
  }
  gradientBar(57);

  y = 68;
  heading(MARGIN, y, 'Customer Address');
  const custText = [client.name, client.email, client.address, client.postcode, client.phone, client.contact]
    .filter(Boolean)
    .join('\n');
  const custEnd = c.block(MARGIN, y + 6, custText, 62, 9, { color: GREY });

  heading(88, y, 'Site Address');
  const siteText = [inv.siteName, inv.siteAddress, inv.sitePostcode].filter(Boolean).join('\n');
  let siteEnd = c.block(88, y + 6, siteText || '-', 52, 9, { color: GREY });
  if (inv.workDates.length) {
    siteEnd = c.block(88, siteEnd + 1.5, `Work date${inv.workDates.length > 1 ? 's' : ''}: ${inv.workDates.map(formatDMY).join(', ')}`, 52, 9, { color: GREY });
  }

  let metaEnd = y + 1;
  const meta = [`Invoice Date: ${formatDMY(inv.issueDate)}`, `Invoice Ref: ${inv.ref}`];
  if (inv.customerRef) meta.push(`Your Ref: ${inv.customerRef}`);
  for (const m of meta) metaEnd = c.block(150, metaEnd, m, 45, 9, { color: GREY });

  y = Math.max(custEnd, siteEnd, metaEnd) + 8;

  const tableHeader = () => {
    const base = y + 4.5;
    c.text(COL.desc, base, 'Description', 9, { color: GREY });
    c.text(COL.qty, base, 'Quantity', 9, { color: GREY, align: 'right' });
    c.text(COL.unit, base, 'Unit Price £', 9, { color: GREY, align: 'right' });
    c.text(COL.cost, base, 'Cost £', 9, { color: GREY, align: 'right' });
    c.line(MARGIN, y + 7.5, RIGHT, y + 7.5, '#555a62', 0.3);
    y += 7.5;
  };

  const newPage = () => {
    c.page++;
    y = 20;
  };

  tableHeader();
  for (const item of inv.items) {
    const lines = wrapText(item.description || 'Job', COL.qty - 22 - COL.desc, 9, false, measure);
    const rowH = lines.length * c.lh(9) + 4;
    if (y + rowH > BAR_Y - 60) {
      newPage();
      tableHeader();
    }
    let ry = y + 6;
    for (const l of lines) {
      c.text(COL.desc, ry, l, 9, { color: GREY });
      ry += c.lh(9);
    }
    c.text(COL.qty, y + 6, String(item.qty), 9, { color: GREY, align: 'right' });
    c.text(COL.unit, y + 6, formatPlain(item.rate), 9, { color: GREY, align: 'right' });
    c.text(COL.cost, y + 6, formatPlain(lineTotal(item)), 9, { color: GREY, align: 'right' });
    y += rowH;
  }

  const bankLines: string[] = [];
  if (tpl.showBankDetails) {
    if (bank.sortCode) bankLines.push(`Sort Code: ${bank.sortCode}`);
    if (bank.accountNumber) bankLines.push(`Acc Number: ${bank.accountNumber}`);
    if (bank.accountName) bankLines.push(`Name on account: ${bank.accountName}`);
  }
  const payNote = tpl.paymentNote ? wrapText(tpl.paymentNote.replace(/\{ref\}/g, inv.ref), 100, 9, false, measure) : [];
  const dueBlockH = 8 + (bankLines.length ? 6 + bankLines.length * 5.6 : 0) + payNote.length * 5;

  const notesLines = inv.notes ? wrapText(inv.notes, 110, 9, false, measure) : [];
  const summaryRows: [string, string][] = [['Subtotal', formatSpaced(totals.subtotal)]];
  if (totals.vatRate > 0) summaryRows.push([`VAT (${totals.vatRate}%)`, formatSpaced(totals.vat)]);
  if (totals.cisRate > 0) summaryRows.push([`CIS deduction (${totals.cisRate}%)`, formatSpaced(-totals.cis)]);
  const summaryH = 12 + summaryRows.length * 6 + 24 + (notesLines.length ? 10 + notesLines.length * c.lh(9) : 0);
  const dueTop = BAR_Y - 4 - dueBlockH;
  if (y + summaryH + 6 > dueTop) {
    newPage();
  }

  y += 14;
  for (const [k, v] of summaryRows) {
    c.text(COL.unit, y, k, 9, { color: GREY, align: 'right' });
    c.text(COL.cost, y, v, 9, { color: GREY, align: 'right' });
    y += 6;
  }
  y += 5;
  c.text(COL.unit, y, 'Total Price', 11, { bold: true, color: accent, align: 'right' });
  c.text(COL.cost, y, formatSpaced(totals.total), 11, { bold: true, color: accent, align: 'right' });
  y += 6.5;
  c.text(COL.unit, y, 'Paid', 9, { color: GREY, align: 'right' });
  c.text(COL.cost, y, formatSpaced(paid), 9, { color: GREY, align: 'right' });
  y += 7.5;
  c.text(COL.unit, y, 'Balance', 11, { bold: true, color: accent, align: 'right' });
  c.text(COL.cost, y, formatSpaced(balance), 11, { bold: true, color: accent, align: 'right' });
  y += 10;

  if (notesLines.length) {
    heading(MARGIN, y, 'Notes');
    c.block(MARGIN, y + 6, inv.notes, 110, 9, { color: GREY });
  }

  let dy = dueTop + 3;
  c.text(RIGHT, dy, `Due Date: ${formatLongDate(inv.dueDate)}`, 10, { bold: true, color: accent, align: 'right' });
  dy += 8;
  if (bankLines.length) {
    c.text(RIGHT, dy, 'Bank Details', 9, { color: GREY, align: 'right' });
    dy += 5.6;
    for (const l of bankLines) {
      c.text(RIGHT, dy, l, 9, { color: GREY, align: 'right' });
      dy += 5.6;
    }
  }
  for (const l of payNote) {
    c.text(RIGHT, dy, l, 9, { color: GREY, align: 'right' });
    dy += 5;
  }

  const pages = c.page;
  const footerText = [biz.name, biz.address.replace(/\n+/g, ', '), biz.postcode].filter(Boolean).join(', ');
  const reg = [
    biz.companyNumber && `Company no. ${biz.companyNumber}`,
    biz.vatRegistered && biz.vatNumber && `VAT no. ${biz.vatNumber}`,
    biz.utr && `UTR ${biz.utr}`,
  ].filter(Boolean) as string[];
  for (let p = 1; p <= pages; p++) {
    c.page = p;
    gradientBar(BAR_Y);
    let fy = PAGE_H - 12;
    c.text(PAGE_W / 2, fy, footerText, 8, { color: GREY, align: 'center' });
    if (tpl.showRegNumbers && reg.length) {
      fy += 4;
      c.text(PAGE_W / 2, fy, reg.join('   |   '), 8, { color: GREY, align: 'center' });
    }
    if (tpl.footerNote) c.text(PAGE_W / 2, PAGE_H - 16.5, tpl.footerNote, 8, { color: GREY, align: 'center' });
    if (pages > 1) c.text(RIGHT, PAGE_H - 5, `Page ${p} of ${pages}`, 8, { color: GREY, align: 'right' });
  }
  c.page = pages;

  return { pages, ops: c.ops };
}
