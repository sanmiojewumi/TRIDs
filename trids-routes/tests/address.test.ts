import { describe, expect, it } from 'vitest';
import { decideMatch } from '../src/geo';

describe('decideMatch', () => {
  it('accepts one result that contains the postcode', () => {
    const result = decideMatch('14 Victoria Street, Crewe CW1 2BP', [{ lat: 1, lon: 2, label: '14 Victoria Street, Crewe, Cheshire, CW1 2BP, United Kingdom' }]);
    expect(result.ok).toBe(true);
  });

  it('asks you to choose when several places match', () => {
    const result = decideMatch('High Street', [
      { lat: 1, lon: 1, label: 'High Street, Crewe' },
      { lat: 2, lon: 2, label: 'High Street, Nantwich' },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.suggestions).toHaveLength(2);
      expect(result.message).toContain('Pick the right one');
    }
  });

  it('explains how to fix an address that matches nothing', () => {
    const result = decideMatch('notaplace', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('postcode');
  });
});
