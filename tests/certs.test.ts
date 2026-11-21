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
});
