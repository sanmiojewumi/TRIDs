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

export const PT = 0.3528;

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

export function createCanvas(measure: Measure) {
  const ops: Op[] = [];
  let page = 1;
  const lh = (size: number) => size * PT * 1.4;
  const text = (x: number, y: number, s: string, size = 10, o: { bold?: boolean; color?: string; align?: Align } = {}) => {
    if (!s) return;
    ops.push({ t: 'text', page, x, y, text: s, size, bold: o.bold ?? false, color: o.color ?? '#1f2933', align: o.align ?? 'left' });
  };
  const rect = (x: number, y: number, w: number, h: number, fill?: string, stroke?: string, lw = 0.2) =>
    ops.push({ t: 'rect', page, x, y, w, h, fill, stroke, lw });
  const line = (x1: number, y1: number, x2: number, y2: number, color = '#d0d5dd', lw = 0.2) =>
    ops.push({ t: 'line', page, x1, y1, x2, y2, color, lw });
  const image = (x: number, y: number, w: number, h: number, src: string) => ops.push({ t: 'image', page, x, y, w, h, src });
  const block = (x: number, y: number, s: string, width: number, size: number, o: { bold?: boolean; color?: string } = {}) => {
    let cy = y;
    for (const l of wrapText(s, width, size, o.bold ?? false, measure)) {
      text(x, cy, l, size, o);
      cy += lh(size);
    }
    return cy;
  };
  return {
    ops,
    lh,
    text,
    rect,
    line,
    image,
    block,
    get page() {
      return page;
    },
    set page(p: number) {
      page = p;
    },
  };
}
