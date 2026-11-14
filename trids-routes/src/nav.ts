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
