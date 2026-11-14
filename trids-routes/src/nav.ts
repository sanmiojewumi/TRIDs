export interface NavTarget {
  lat?: number;
  lon?: number;
  address: string;
}

function destination(target: NavTarget): string {
  if (target.lat != null && target.lon != null) return `${target.lat},${target.lon}`;
  return encodeURIComponent(target.address);
}

export function googleMapsUrl(target: NavTarget): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${destination(target)}&travelmode=driving`;
}

export function wazeUrl(target: NavTarget): string {
  if (target.lat != null && target.lon != null) return `https://waze.com/ul?ll=${target.lat},${target.lon}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(target.address)}&navigate=yes`;
}

export function appleMapsUrl(target: NavTarget): string {
  return `https://maps.apple.com/?daddr=${destination(target)}&dirflg=d`;
}

export function stopNavUrl(app: 'google' | 'waze', target: NavTarget): string {
  return app === 'waze' ? wazeUrl(target) : googleMapsUrl(target);
}

/**
 * One Google Maps link for the whole arranged route.
 * Google accepts the destination plus up to 9 stops in between, so 10 stops in all.
 */
export function googleRouteUrl(origin: NavTarget, stops: NavTarget[]): { url: string; sent: number; total: number } | null {
  if (!stops.length) return null;
  const limited = stops.slice(0, 10);
  const destination = limited[limited.length - 1];
  const via = limited.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    origin: point(origin),
    destination: point(destination),
    travelmode: 'driving',
  });
  if (via.length) params.set('waypoints', via.map(point).join('|'));
  return { url: `https://www.google.com/maps/dir/?${params.toString()}`, sent: limited.length, total: stops.length };
}

function point(target: NavTarget): string {
  if (target.lat != null && target.lon != null) return `${target.lat},${target.lon}`;
  return target.address;
}
