import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  clamp,
  heightFraction,
  keepInside,
  jpegSize,
  knockoutNearWhite,
  pdfFromJpegs,
  stampedName,
  stampPixels,
} from '../src/stamp';

const tinyJpeg = new Uint8Array(readFileSync(new URL('./fixtures/dot.jpg', import.meta.url)));

describe('thumbprint placement', () => {
  it('drops white paper and keeps the ink', () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 20, 20, 20, 255]);
    knockoutNearWhite(pixels);
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(255);
  });

  it('keeps the thumbprint shape on a portrait page', () => {
    const height = heightFraction(0.2, 1000, 2000, 100, 150);
    expect(height).toBeCloseTo(0.15);
    const drawn = stampPixels(1000, 2000, { cx: 0.5, cy: 0.5, w: 0.2, h: height });
    expect(drawn.dw / drawn.dh).toBeCloseTo(100 / 150);
    expect(drawn.cx).toBe(500);
    expect(drawn.cy).toBe(1000);
  });

  it('names the saved file from the original', () => {
    expect(stampedName('Contract.PDF', 'pdf')).toBe('Contract-stamped.pdf');
    expect(stampedName('a/b:c.png', 'jpg')).toBe('a-b-c-stamped.jpg');
    expect(clamp(2, 0, 1)).toBe(1);
    expect(keepInside(0.02, 0.98, 0.2, 0.2)).toEqual({ cx: 0.1, cy: 0.9 });
  });
});

describe('pdf of stamped pages', () => {
  it('reads a jpeg and wraps one page per picture', () => {
    expect(jpegSize(tinyJpeg)).toEqual({ width: 8, height: 8 });
    const pdf = pdfFromJpegs([tinyJpeg, tinyJpeg]);
    const text = new TextDecoder().decode(pdf);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.match(/\/Type \/Page /g)).toHaveLength(2);
    const start = text.indexOf('startxref\n') + 'startxref\n'.length;
    const xref = Number(text.slice(start).split('\n')[0]);
    expect(new TextDecoder().decode(pdf.slice(xref, xref + 4))).toBe('xref');
  });
});
