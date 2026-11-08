import { formatDate, formatWorkDates } from './dates';
import { formatMoney, lineTotal } from './money';
import type { InvoiceData } from './types';

export const PAGE_W = 210;
export const PAGE_H = 297;

export type Align = 'left' | 'right' | 'center';

export type Op =
  | { t: 'text'; page: number; x: number; y: number; text: string; size: number; bold: boolean; color: string; align: Align }
  | { t: 'rect'; page: number; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lw?: number }
  | { t: 'line'; page: number; x1: number; y1: number; x2: number; y2: number; color: string; lw: number }
  | { t: 'image'; page: number; x: number; y: number; w: number; h: number; src: string };

export type Measure = (text: string, size: number, bold: boolean) => number;

export interface Layout {
  pages: number;
  ops: Op[];
}

const MARGIN = 15;
const RIGHT = PAGE_W - MARGIN;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_H = 22;
const INK = '#1f2933';
const MUTED = '#667085';
const RULE = '#d0d5dd';
const PT = 0.3528;

export function tint(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function wrapText(text: string, width: number, size: number, bold: boolean, measure: Measure): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of para.split(/\s+/)) {
      let w = word;
      while (measure(w, size, bold) > width && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && measure(w.slice(0, cut), size, bold) > width) cut--;
        if (line) {
          out.push(line);
          line = '';
        }
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const attempt = line ? `${line} ${w}` : w;
      if (measure(attempt, size, bold) <= width) line = attempt;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

export function buildLayout(inv: InvoiceData, measure: Measure): Layout {
  const { template: tpl, business: biz, client, totals, bank } = inv;
  const accent = tpl.accent;
  const ops: Op[] = [];
  let page = 1;
  let y = 0;

  const lh = (size: number) => size * PT * 1.4;
  const text = (x: number, yy: number, s: string, size = 10, o: { bold?: boolean; color?: string; align?: Align } = {}) => {
    if (!s) return;
    ops.push({ t: 'text', page, x, y: yy, text: s, size, bold: o.bold ?? false, color: o.color ?? INK, align: o.align ?? 'left' });
  };
  const rect = (x: number, yy: number, w: number, h: number, fill?: string, stroke?: string, lw = 0.2) =>
    ops.push({ t: 'rect', page, x, y: yy, w, h, fill, stroke, lw });
  const line = (x1: number, y1: number, x2: number, y2: number, color = RULE, lw = 0.2) =>
    ops.push({ t: 'line', page, x1, y1, x2, y2, color, lw });
  const block = (x: number, yy: number, s: string, width: number, size: number, o: { bold?: boolean; color?: string } = {}) => {
    const lines = wrapText(s, width, size, o.bold ?? false, measure);
    let cy = yy;
    for (const l of lines) {
      text(x, cy, l, size, o);
      cy += lh(size);
    }
    return cy;
  };

  const bizLines = [
    biz.address,
    biz.postcode,
    [biz.phone, biz.email].filter(Boolean).join('  |  '),
    biz.website,
  ].filter(Boolean).join('\n');

  const logoH = 16;
  const logoW = Math.min(45, logoH * (biz.logoRatio || 1));

  if (tpl.layout === 'banded') {
    rect(0, 0, PAGE_W, 40, accent);
    let ty = 17;
    if (tpl.showLogo && biz.logo) {
      rect(MARGIN - 1.5, 7.5, logoW + 3, logoH + 3, '#ffffff');
      ops.push({ t: 'image', page, x: MARGIN, y: 9, w: logoW, h: logoH, src: biz.logo });
    }
    const nameX = tpl.showLogo && biz.logo ? MARGIN + logoW + 6 : MARGIN;
    text(nameX, ty, biz.name, 16, { bold: true, color: '#ffffff' });
    block(nameX, ty + 5.5, [biz.phone, biz.email].filter(Boolean).join('  |  '), 110, 8.5, { color: '#ffffff' });
    text(RIGHT, 22, tpl.title, 24, { bold: true, color: '#ffffff', align: 'right' });
    y = 48;
    y = block(MARGIN, y, [biz.address, biz.postcode].filter(Boolean).join('\n'), 95, 8.5, { color: MUTED }) + 4;
  } else if (tpl.layout === 'minimal') {
    text(MARGIN, 24, tpl.title, 22, { bold: true, color: accent });
    let x = RIGHT;
    let cy = 16;
    if (tpl.showLogo && biz.logo) {
      ops.push({ t: 'image', page, x: RIGHT - logoW, y: 10, w: logoW, h: logoH, src: biz.logo });
      cy = 10 + logoH + 5;
      x = RIGHT;
    }
    text(x, cy, biz.name, 11, { bold: true, align: 'right' });
    cy += 5;
    for (const l of wrapText(bizLines, 80, 8.5, false, measure)) {
      text(x, cy, l, 8.5, { color: MUTED, align: 'right' });
      cy += lh(8.5);
    }
    y = Math.max(cy, 36) + 4;
    line(MARGIN, y, RIGHT, y, accent, 0.6);
    y += 8;
  } else {
    let nameX = MARGIN;
    if (tpl.showLogo && biz.logo) {
      ops.push({ t: 'image', page, x: MARGIN, y: 12, w: logoW, h: logoH, src: biz.logo });
      nameX = MARGIN + logoW + 6;
    }
    text(nameX, 19, biz.name, 15, { bold: true });
    const after = block(nameX, 24.5, bizLines, 95, 8.5, { color: MUTED });
    text(RIGHT, 22, tpl.title, 26, { bold: true, color: accent, align: 'right' });
    y = Math.max(after, 12 + logoH + 4) + 3;
    line(MARGIN, y, RIGHT, y, accent, 0.8);
    y += 9;
  }

  const colW = 56;
  const labelStyle = { bold: true, color: tpl.layout === 'minimal' ? MUTED : accent };

  text(MARGIN, y, 'BILL TO', 8, labelStyle);
  let ly = y + 5;
  ly = block(MARGIN, ly, client.name, colW, 10.5, { bold: true });
  ly = block(MARGIN, ly, [client.contact, client.address, client.postcode].filter(Boolean).join('\n'), colW, 9, { color: INK });

  const siteX = MARGIN + colW + 6;
  text(siteX, y, 'SITE / WORK DETAILS', 8, labelStyle);
  let sy = y + 5;
  const siteText = [inv.siteName, inv.siteAddress, inv.sitePostcode].filter(Boolean).join('\n');
  sy = block(siteX, sy, siteText || '-', 52, 9.5, { bold: false });
  if (inv.workDates.length) {
    sy += 1;
    sy = block(siteX, sy, `${inv.workDates.length > 1 ? 'Dates' : 'Date'} of work: ${formatWorkDates(inv.workDates)}`, 52, 8.5, { color: MUTED });
  }

  const metaX = 140;
  const meta: [string, string][] = [
    ['Invoice no.', inv.ref],
    ['Invoice date', formatDate(inv.issueDate)],
    ['Due date', formatDate(inv.dueDate)],
  ];
  if (inv.customerRef) meta.push(['Your ref', inv.customerRef]);
  let my = y;
  for (const [k, v] of meta) {
    text(metaX, my, k, 8.5, { color: MUTED });
    const vl = wrapText(v, 32, 9.5, k === 'Invoice no.', measure);
    text(RIGHT, my, vl[0], 9.5, { bold: k === 'Invoice no.', align: 'right' });
    my += lh(9.5) + 0.8;
  }

  y = Math.max(ly, sy, my) + 8;

  const cols = tpl.showQtyRate
    ? { desc: MARGIN + 2, qty: 128, rate: 156, amt: RIGHT - 2 }
    : { desc: MARGIN + 2, qty: 0, rate: 0, amt: RIGHT - 2 };
  const descW = (tpl.showQtyRate ? 128 - 14 : RIGHT - 30) - cols.desc;

  const drawTableHeader = () => {
    const h = 8;
    if (tpl.layout === 'banded') rect(MARGIN, y, CONTENT_W, h, accent);
    else if (tpl.layout === 'classic') rect(MARGIN, y, CONTENT_W, h, tint(accent, 0.88));
    else line(MARGIN, y + h, RIGHT, y + h, accent, 0.5);
    const hc = tpl.layout === 'banded' ? '#ffffff' : tpl.layout === 'minimal' ? accent : INK;
    text(cols.desc, y + 5.4, 'DESCRIPTION', 8, { bold: true, color: hc });
    if (tpl.showQtyRate) {
      text(cols.qty, y + 5.4, 'QTY', 8, { bold: true, color: hc, align: 'right' });
      text(cols.rate, y + 5.4, 'UNIT PRICE', 8, { bold: true, color: hc, align: 'right' });
    }
    text(cols.amt, y + 5.4, 'AMOUNT', 8, { bold: true, color: hc, align: 'right' });
    y += h + 1.5;
  };

  const newPage = () => {
    page++;
    y = 20;
  };

  drawTableHeader();
  for (const item of inv.items) {
    const lines = wrapText(item.description || 'Works carried out', descW, 9.5, false, measure);
    const rowH = lines.length * lh(9.5) + 4;
    if (y + rowH > PAGE_H - FOOTER_H - 10) {
      newPage();
      drawTableHeader();
    }
    let ry = y + 4.2;
    for (const l of lines) {
      text(cols.desc, ry, l, 9.5);
      ry += lh(9.5);
    }
    if (tpl.showQtyRate) {
      text(cols.qty, y + 4.2, String(item.qty), 9.5, { align: 'right' });
      text(cols.rate, y + 4.2, formatMoney(item.rate), 9.5, { align: 'right' });
    }
    text(cols.amt, y + 4.2, formatMoney(lineTotal(item)), 9.5, { align: 'right' });
    y += rowH;
    line(MARGIN, y - 0.6, RIGHT, y - 0.6, RULE, 0.2);
  }

  const totalRows: [string, string, boolean?][] = [];
  const hasSplit = totals.cis > 0 && totals.materials > 0;
  if (hasSplit) {
    totalRows.push(['Labour', formatMoney(totals.labour)], ['Materials', formatMoney(totals.materials)]);
  }
  totalRows.push(['Subtotal', formatMoney(totals.subtotal)]);
  if (totals.vatRate > 0) totalRows.push([`VAT (${totals.vatRate}%)`, formatMoney(totals.vat)]);
  if (totals.cisRate > 0) totalRows.push([`CIS deduction (${totals.cisRate}% of labour)`, `-${formatMoney(totals.cis)}`]);

  const payLines: string[] = [];
  payLines.push(`Payment due by ${formatDate(inv.dueDate)}.`);
  if (tpl.paymentNote) payLines.push(tpl.paymentNote.replace(/\{ref\}/g, inv.ref));
  const bankRows: [string, string][] = [];
  if (tpl.showBankDetails) {
    if (bank.accountName) bankRows.push(['Account name', bank.accountName]);
    if (bank.sortCode) bankRows.push(['Sort code', bank.sortCode]);
    if (bank.accountNumber) bankRows.push(['Account no.', bank.accountNumber]);
    bankRows.push(['Reference', inv.ref]);
  }
  const noteLines = inv.notes ? wrapText(inv.notes, CONTENT_W, 9, false, measure) : [];
  const payTextLines = payLines.flatMap((p) => wrapText(p, 90, 9, false, measure));

  const totalsH = totalRows.length * 6 + 14;
  const payH = 8 + payTextLines.length * lh(9) + bankRows.length * 5 + 4;
  const notesH = noteLines.length ? 8 + noteLines.length * lh(9) : 0;
  if (y + 6 + Math.max(totalsH, payH) + notesH > PAGE_H - FOOTER_H - 4) newPage();

  y += 6;
  const blockTop = y;
  const tx = 122;
  let ty = blockTop + 3;
  for (const [k, v] of totalRows) {
    text(tx, ty, k, 9, { color: MUTED });
    text(RIGHT - 2, ty, v, 9, { align: 'right' });
    ty += 6;
  }
  ty += 1;
  const totalFill = tpl.layout === 'minimal' ? undefined : accent;
  if (totalFill) rect(tx - 3, ty - 5.2, RIGHT - tx + 3, 10, totalFill);
  else line(tx - 3, ty - 5.2, RIGHT, ty - 5.2, accent, 0.5);
  const tc = totalFill ? '#ffffff' : INK;
  text(tx, ty + 1.3, 'TOTAL DUE', 10, { bold: true, color: tc });
  text(RIGHT - 2, ty + 1.3, formatMoney(totals.total), 12, { bold: true, color: tc, align: 'right' });

  let py = blockTop + 3;
  text(MARGIN, py, 'PAYMENT', 8, labelStyle);
  py += 5;
  for (const l of payTextLines) {
    text(MARGIN, py, l, 9);
    py += lh(9);
  }
  py += 1;
  for (const [k, v] of bankRows) {
    text(MARGIN, py, k, 8.5, { color: MUTED });
    text(MARGIN + 28, py, v, 9, { bold: true });
    py += 5;
  }

  y = Math.max(ty + 10, py) + 4;
  if (noteLines.length) {
    text(MARGIN, y, 'NOTES', 8, labelStyle);
    y += 5;
    for (const l of noteLines) {
      text(MARGIN, y, l, 9);
      y += lh(9);
    }
  }

  const pages = page;
  const regParts = [
    biz.companyNumber && `Company no. ${biz.companyNumber}`,
    biz.vatNumber && `VAT no. ${biz.vatNumber}`,
    biz.utr && `UTR ${biz.utr}`,
  ].filter(Boolean) as string[];
  for (let p = 1; p <= pages; p++) {
    const saved = page;
    page = p;
    const fy = PAGE_H - FOOTER_H + 4;
    line(MARGIN, fy, RIGHT, fy, RULE, 0.2);
    let cy = fy + 5;
    if (tpl.footerNote) {
      for (const l of wrapText(tpl.footerNote, CONTENT_W, 8.5, false, measure)) {
        text(PAGE_W / 2, cy, l, 8.5, { color: MUTED, align: 'center' });
        cy += lh(8.5);
      }
    }
    if (tpl.showRegNumbers && regParts.length) text(PAGE_W / 2, cy, regParts.join('   |   '), 8, { color: MUTED, align: 'center' });
    if (pages > 1) text(RIGHT, PAGE_H - 8, `Page ${p} of ${pages}`, 8, { color: MUTED, align: 'right' });
    page = saved;
  }

  return { pages, ops };
}
