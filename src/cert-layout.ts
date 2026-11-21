import { jsPDF } from 'jspdf';
import { certTitle } from './certs';
import { PAGE_H, PAGE_W, createCanvas, type Layout, type Measure } from './layout-core';
import { measureText } from './render';
import type { CertificateData, CheckResult, FgaReading } from './types';

const ACCENT = '#0f6fc6';
const GREY = '#667085';
const INK = '#1f2933';
const MARGIN = 14;
const RIGHT = PAGE_W - MARGIN;

function fgaLine(reading: FgaReading | undefined): string {
  if (!reading) return '';
  const parts = [
    reading.co.trim() ? `CO ${reading.co.trim()} ppm` : '',
    reading.co2.trim() ? `CO2 ${reading.co2.trim()}%` : '',
    reading.ratio.trim() ? `ratio ${reading.ratio.trim()}` : '',
  ].filter(Boolean);
  return parts.join(', ');
}

function checkLabel(value: CheckResult | 'yes' | 'no' | 'na'): string {
  if (value === 'pass' || value === 'yes') return 'Satisfactory';
  if (value === 'fail' || value === 'no') return 'Not satisfactory';
  return 'N/A';
}

export function layoutCertificate(data: CertificateData, measure: Measure): Layout {
  const c = createCanvas(measure);
  const biz = data.business;
  let y = 16;

  const logoH = 22;
  const logoW = Math.min(36, logoH * (biz.logoRatio || 1));
  if (biz.logo) c.image(RIGHT - logoW, 10, logoW, logoH, biz.logo);
  c.text(MARGIN, y, certTitle(data.kind), 16, { bold: true, color: ACCENT });
  y = 22;
  c.text(MARGIN, y, data.ref, 10, { color: GREY });
  c.rect(0, 28, PAGE_W, 2.2, ACCENT);
  y = 38;

  const ensure = (need: number) => {
    if (y + need < PAGE_H - 18) return;
    c.page += 1;
    y = 16;
  };
  const heading = (label: string) => {
    ensure(12);
    c.text(MARGIN, y, label, 11, { bold: true, color: ACCENT });
    y += 6;
  };
  const line = (label: string, value: string) => {
    if (!value.trim()) return;
    ensure(8);
    c.text(MARGIN, y, label, 9, { bold: true, color: INK });
    y = c.block(MARGIN + 42, y, value, RIGHT - MARGIN - 42, 9, { color: GREY });
    y += 1.5;
  };

  heading('Engineer');
  line('Business', biz.name);
  line('Address', [biz.address, biz.postcode].filter(Boolean).join(', '));
  line('Phone', biz.phone);
  line('Gas Safe ID', data.gasSafeId);
  line('Engineer', data.engineerName);
  y += 2;

  heading(data.kind === 'landlord' ? 'Landlord and property' : 'Customer and property');
  line('Name', data.customerName);
  line('Address', data.customerAddress);
  line('Postcode', data.postcode);
  line('Tenant', data.tenantName);
  line('Date', data.date);
  line('Next due', data.nextDue);
  y += 2;

  if (data.appliances.length) {
    heading('Appliances');
    for (const appliance of data.appliances) {
      ensure(28);
      const title = [appliance.applianceType || 'Appliance', appliance.location].filter(Boolean).join(' · ');
      c.text(MARGIN, y, title, 10, { bold: true, color: INK });
      y += 5;
      const detail = [
        [appliance.make, appliance.model].filter(Boolean).join(' '),
        appliance.serial ? `Serial ${appliance.serial}` : '',
        appliance.flue ? `Flue ${appliance.flue}` : '',
        appliance.combustion ? `Combustion ${appliance.combustion}` : '',
      ].filter(Boolean).join(' · ');
      if (detail) y = c.block(MARGIN, y, detail, RIGHT - MARGIN, 9, { color: GREY });
      const checks = `Operating ${checkLabel(appliance.operating)} · Safety device ${checkLabel(appliance.safetyDevice)} · Ventilation ${checkLabel(appliance.ventilation)} · Flue ${checkLabel(appliance.flueCondition)} · Safe to use ${appliance.safe === 'yes' ? 'Yes' : 'No'}`;
      y = c.block(MARGIN, y, checks, RIGHT - MARGIN, 8.5, { color: GREY });
      if (appliance.defects.trim()) y = c.block(MARGIN, y, `Defects: ${appliance.defects}`, RIGHT - MARGIN, 8.5, { color: GREY });
      y += 3;
    }
  }

  if (data.kind !== 'repair') {
    heading('Installation checks');
    line('Tightness', checkLabel(data.tightness));
    line('Pipework', checkLabel(data.pipework));
    line('Emergency control', checkLabel(data.emergencyControl));
    line('CO alarm', checkLabel(data.coAlarm));
  }
  if (data.kind === 'service') {
    line('Gas rate', data.gasRate);
    line('Burner pressure', data.burnerPressure);
  }
  const low = fgaLine(data.fgaLow);
  const high = fgaLine(data.fgaHigh);
  if (low || high) {
    heading('Flue gas analysis');
    if (low) line('Low', low);
    if (high) line('High', high);
  }
  if (data.kind !== 'landlord') {
    heading(data.kind === 'repair' ? 'Repair' : 'Work carried out');
    line('Fault', data.faultReported);
    line('Work', data.workDone);
    line('Parts', data.partsFitted);
  }
  if (data.warningNotice) {
    ensure(8);
    c.text(MARGIN, y, 'A warning notice was attached.', 9, { bold: true, color: '#b42318' });
    y += 6;
  }
  if (data.notes.trim()) {
    heading('Notes');
    ensure(10);
    y = c.block(MARGIN, y, data.notes, RIGHT - MARGIN, 9, { color: GREY });
  }

  ensure(16);
  y += 4;
  c.line(MARGIN, y, RIGHT, y, ACCENT, 0.4);
  y += 6;
  c.text(MARGIN, y, 'This record was completed for the visit above. It is not a Gas Safe or Trade Help form.', 8, { color: GREY });

  return { pages: c.page, ops: c.ops };
}

export function renderCertPdf(data: CertificateData): Blob {
  const layout: Layout = layoutCertificate(data, measureText);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setProperties({ title: `${certTitle(data.kind)} ${data.ref}`, author: data.business.name });
  for (let page = 1; page <= layout.pages; page++) {
    if (page > 1) doc.addPage();
    for (const op of layout.ops) {
      if (op.page !== page) continue;
      if (op.t === 'text') {
        doc.setFont('helvetica', op.bold ? 'bold' : 'normal');
        doc.setFontSize(op.size);
        const n = parseInt(op.color.replace('#', ''), 16);
        doc.setTextColor((n >> 16) & 255, (n >> 8) & 255, n & 255);
        doc.text(op.text, op.x, op.y, { align: op.align });
      } else if (op.t === 'rect' && op.fill) {
        const n = parseInt(op.fill.replace('#', ''), 16);
        doc.setFillColor((n >> 16) & 255, (n >> 8) & 255, n & 255);
        doc.rect(op.x, op.y, op.w, op.h, 'F');
      } else if (op.t === 'line') {
        const n = parseInt(op.color.replace('#', ''), 16);
        doc.setDrawColor((n >> 16) & 255, (n >> 8) & 255, n & 255);
        doc.setLineWidth(op.lw);
        doc.line(op.x1, op.y1, op.x2, op.y2);
      } else if (op.t === 'image') {
        const format = /image\/jpe?g/i.test(op.src) ? 'JPEG' : 'PNG';
        doc.addImage(op.src, format, op.x, op.y, op.w, op.h);
      }
    }
  }
  return doc.output('blob');
}

export function certFileName(data: CertificateData): string {
  return `${data.ref}.pdf`;
}
