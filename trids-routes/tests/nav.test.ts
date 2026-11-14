import { describe, expect, it } from 'vitest';
import { googleRouteUrl, stopNavUrl } from '../src/nav';

const crewe = { lat: 53.088, lon: -2.44, address: 'Crewe, CW1' };
const nantwich = { lat: 53.068, lon: -2.52, address: 'Nantwich CW5 5DG' };
const station = { lat: 53.089, lon: -2.433, address: 'Crewe station CW1 2BP' };

describe('googleRouteUrl', () => {
  it('sends the start and every stop in one Google Maps link', () => {
    const route = googleRouteUrl(crewe, [nantwich, station]);
    expect(route).not.toBeNull();
    const url = new URL(route!.url);
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('origin')).toBe('53.088,-2.44');
    expect(url.searchParams.get('destination')).toBe('53.089,-2.433');
    expect(url.searchParams.get('waypoints')).toBe('53.068,-2.52');
    expect(url.searchParams.get('travelmode')).toBe('driving');
    expect(route!.sent).toBe(2);
    expect(route!.total).toBe(2);
  });

  it('keeps Google’s limit of ten stops and reports the rest', () => {
    const stops = Array.from({ length: 12 }, (_, index) => ({ lat: 53 + index / 100, lon: -2.4, address: `Stop ${index}` }));
    const route = googleRouteUrl(crewe, stops);
    expect(route!.sent).toBe(10);
    expect(route!.total).toBe(12);
    expect(route!.url.split('%7C')).toHaveLength(9);
  });

  it('returns nothing when there is no stop to open', () => {
    expect(googleRouteUrl(crewe, [])).toBeNull();
  });
});

describe('stopNavUrl', () => {
  it('uses the selected satnav for a single stop', () => {
    expect(stopNavUrl('waze', nantwich)).toContain('waze.com/ul');
    expect(stopNavUrl('google', nantwich)).toContain('google.com/maps');
  });
});
