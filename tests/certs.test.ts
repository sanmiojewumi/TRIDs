import { describe, expect, it } from 'vitest';
import { layoutCertificate } from '../src/cert-layout';
import { emptyCert, nextCertRef } from '../src/certs';
import { measureText } from '../src/render';
import { emptyBusiness } from '../src/seed';
import type { CertificateRecord } from '../src/types';

describe('certificates', () => {
  it('numbers each certificate type on its own', () => {
    const records = [
      { data: { ref: 'GS-0002' } },
      { data: { ref: 'SV-0004' } },
    ] as CertificateRecord[];
    expect(nextCertRef('landlord', records)).toBe('GS-0003');
    expect(nextCertRef('service', records)).toBe('SV-0005');
    expect(nextCertRef('repair', records)).toBe('RP-0001');
  });

  it('draws a landlord record in the app colours', () => {
    const draft = emptyCert('landlord', '2026-11-21');
    draft.customerName = 'A Landlord';
    draft.customerAddress = '1 High Street';
    draft.postcode = 'CW1 2AB';
    const layout = layoutCertificate(
      { ...draft, ref: 'GS-0001', engineerName: 'Trids', gasSafeId: '123456', business: { ...emptyBusiness, name: 'Trids Gas and Plumbing Ltd' } },
      measureText,
    );
    const title = layout.ops.find((op) => op.t === 'text' && op.text === 'Landlord gas safety record');
    expect(title && title.t === 'text' ? title.color : '').toBe('#0f6fc6');
    expect(layout.pages).toBeGreaterThan(0);
  });

  it('prints low and high flue gas readings', () => {
    const draft = emptyCert('service', '2026-11-21');
    draft.fgaLow = { co: '10', co2: '8.5', ratio: '0.0012' };
    draft.fgaHigh = { co: '40', co2: '9.1', ratio: '0.0044' };
    const layout = layoutCertificate(
      { ...draft, ref: 'SV-0001', engineerName: 'Trids', gasSafeId: '123456', business: emptyBusiness },
      measureText,
    );
    const texts = layout.ops.filter((op) => op.t === 'text').map((op) => (op.t === 'text' ? op.text : ''));
    expect(texts.some((text) => text.includes('CO 10 ppm'))).toBe(true);
    expect(texts.some((text) => text.includes('CO 40 ppm'))).toBe(true);
  });
});
