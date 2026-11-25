/** A saved thumbprint. `src` is a PNG data URL, with white paper already removed when requested. */
export interface ThumbPrint {
  id: string;
  name: string;
  src: string;
  width: number;
  height: number;
}

/** One placement on a page. x/y are the centre, as fractions of the page. w/h are fractions of page width and height. */
export interface Stamp {
  id: string;
  thumbId: string;
  page: number;
  cx: number;
  cy: number;
  w: number;
  h: number;
  rotation: number;
}

export interface PageShot {
  src: string;
  width: number;
  height: number;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Keeps the print fully on the page when it fits, and centred on that axis when it does not. */
export function keepInside(cx: number, cy: number, w: number, h: number): { cx: number; cy: number } {
  const halfW = Math.min(Math.max(w, 0) / 2, 0.5);
  const halfH = Math.min(Math.max(h, 0) / 2, 0.5);
  return {
    cx: clamp(cx, halfW, 1 - halfW),
    cy: clamp(cy, halfH, 1 - halfH),
  };
}

/** Makes near-white paper transparent so the ink sits on the document. */
export function knockoutNearWhite(pixels: Uint8ClampedArray, threshold = 242): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (min >= threshold && max - min <= 18) pixels[i + 3] = 0;
  }
}

/** Height fraction that keeps the thumbprint's own shape on this page. */
export function heightFraction(widthFraction: number, pageW: number, pageH: number, thumbW: number, thumbH: number): number {
  if (pageW <= 0 || pageH <= 0 || thumbW <= 0 || thumbH <= 0) throw new Error('Bad size');
  return widthFraction * (pageW / pageH) * (thumbH / thumbW);
}

export function stampPixels(pageW: number, pageH: number, stamp: Pick<Stamp, 'cx' | 'cy' | 'w' | 'h'>) {
  return {
    cx: stamp.cx * pageW,
    cy: stamp.cy * pageH,
    dw: stamp.w * pageW,
    dh: stamp.h * pageH,
  };
}

export function stampedName(original: string, ext: string): string {
  const base = original.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '-').trim() || 'document';
  return `${base}-stamped.${ext}`;
}

export function jpegSize(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG.');
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01) {
      i += 2;
      continue;
    }
    if (marker === 0xd9) break;
    const len = (bytes[i + 2] << 8) + bytes[i + 3];
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      const height = (bytes[i + 5] << 8) + bytes[i + 6];
      const width = (bytes[i + 7] << 8) + bytes[i + 8];
      if (width < 1 || height < 1) throw new Error('Could not read the picture size.');
      return { width, height };
    }
    if (len < 2) break;
    i += 2 + len;
  }
  throw new Error('Could not read the picture size.');
}

/** Builds a PDF with one JPEG picture per page. Each picture fills its page. */
export function pdfFromJpegs(jpegs: Uint8Array[]): Uint8Array {
  if (jpegs.length === 0) throw new Error('Nothing to save.');
  const sizes = jpegs.map(jpegSize);
  const parts: Uint8Array[] = [];
  const offsets: number[] = [0];
  let length = 0;
  const encoder = new TextEncoder();
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const startObj = () => {
    offsets.push(length);
  };

  const n = sizes.length;
  const pageId = (i: number) => 3 + i * 3;
  const contentId = (i: number) => 4 + i * 3;
  const imageId = (i: number) => 5 + i * 3;
  const total = 2 + n * 3;
  const kids = sizes.map((_, i) => `${pageId(i)} 0 R`).join(' ');

  push('%PDF-1.4\n');
  startObj();
  push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj();
  push(`2 0 obj\n<< /Type /Pages /Count ${n} /Kids [${kids}] >>\nendobj\n`);

  for (let i = 0; i < n; i++) {
    const { width, height } = sizes[i];
    const content = `q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`;
    startObj();
    push(
      `${pageId(i)} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents ${contentId(i)} 0 R /Resources << /XObject << /Im0 ${imageId(i)} 0 R >> >> >>\nendobj\n`,
    );
    startObj();
    push(`${contentId(i)} 0 obj\n<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream\nendobj\n`);
    startObj();
    push(
      `${imageId(i)} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegs[i].length} >>\nstream\n`,
    );
    push(jpegs[i]);
    push('\nendstream\nendobj\n');
  }

  const xref = length;
  push(`xref\n0 ${total + 1}\n`);
  push('0000000000 65535 f \n');
  for (let i = 1; i <= total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
