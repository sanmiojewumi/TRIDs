import { jsPDF } from 'jspdf';
import { buildLayout, PAGE_H, PAGE_W, type Layout, type Measure, type Op } from './layout';
import type { InvoiceData } from './types';

const PT = 0.3528;

let measureDoc: jsPDF | undefined;
export const measureText: Measure = (text, size, bold) => {
  measureDoc ??= new jsPDF({ unit: 'mm', format: 'a4' });
  measureDoc.setFont('helvetica', bold ? 'bold' : 'normal');
  measureDoc.setFontSize(size);
  return measureDoc.getTextWidth(text);
};

export function layoutInvoice(data: InvoiceData): Layout {
  return buildLayout(data, measureText);
}

const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function imageFormat(src: string): string {
  const m = src.match(/^data:image\/(\w+)/);
  const f = (m?.[1] ?? 'png').toUpperCase();
  return f === 'JPG' ? 'JPEG' : f;
}

function drawPdfOp(doc: jsPDF, op: Op) {
  switch (op.t) {
    case 'text':
      doc.setFont('helvetica', op.bold ? 'bold' : 'normal');
      doc.setFontSize(op.size);
      doc.setTextColor(...rgb(op.color));
      doc.text(op.text, op.x, op.y, { align: op.align });
      break;
    case 'rect': {
      if (op.fill) doc.setFillColor(...rgb(op.fill));
      if (op.stroke) {
        doc.setDrawColor(...rgb(op.stroke));
        doc.setLineWidth(op.lw ?? 0.2);
      }
      const style = op.fill && op.stroke ? 'FD' : op.fill ? 'F' : 'S';
      doc.rect(op.x, op.y, op.w, op.h, style);
      break;
    }
    case 'line':
      doc.setDrawColor(...rgb(op.color));
      doc.setLineWidth(op.lw);
      doc.line(op.x1, op.y1, op.x2, op.y2);
      break;
    case 'image':
      doc.addImage(op.src, imageFormat(op.src), op.x, op.y, op.w, op.h);
      break;
  }
}

export function renderPdf(data: InvoiceData): Blob {
  const layout = layoutInvoice(data);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `Invoice ${data.ref}`, author: data.business.name, subject: `Invoice for ${data.client.name}` });
  for (let p = 1; p <= layout.pages; p++) {
    if (p > 1) doc.addPage();
    for (const op of layout.ops) if (op.page === p) drawPdfOp(doc, op);
  }
  return doc.output('blob');
}

function svgOp(op: Op): string {
  switch (op.t) {
    case 'text': {
      const anchor = op.align === 'right' ? 'end' : op.align === 'center' ? 'middle' : 'start';
      return `<text x="${op.x}" y="${op.y}" font-size="${(op.size * PT).toFixed(3)}" font-weight="${op.bold ? 700 : 400}" fill="${op.color}" text-anchor="${anchor}" xml:space="preserve">${esc(op.text)}</text>`;
    }
    case 'rect':
      return `<rect x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" fill="${op.fill ?? 'none'}" stroke="${op.stroke ?? 'none'}" stroke-width="${op.lw ?? 0.2}"/>`;
    case 'line':
      return `<line x1="${op.x1}" y1="${op.y1}" x2="${op.x2}" y2="${op.y2}" stroke="${op.color}" stroke-width="${op.lw}"/>`;
    case 'image':
      return `<image href="${op.src}" x="${op.x}" y="${op.y}" width="${op.w}" height="${op.h}" preserveAspectRatio="xMidYMid meet"/>`;
  }
}

/** One SVG string per page; the on-screen preview uses exactly the same ops as the PDF. */
export function renderSvgPages(data: InvoiceData): string[] {
  const layout = layoutInvoice(data);
  const pages: string[] = [];
  for (let p = 1; p <= layout.pages; p++) {
    const body = layout.ops.filter((o) => o.page === p).map(svgOp).join('');
    pages.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_W} ${PAGE_H}" font-family="Helvetica, Arial, sans-serif" role="img" aria-label="Invoice page ${p}"><rect width="${PAGE_W}" height="${PAGE_H}" fill="#fff"/>${body}</svg>`,
    );
  }
  return pages;
}

export function pdfFileName(data: InvoiceData): string {
  const clean = (s: string) => s.replace(/[^A-Za-z0-9 _-]/g, '').trim().replace(/\s+/g, ' ');
  return `${clean(data.ref)} - ${clean(data.client.name) || 'Invoice'}.pdf`;
}
