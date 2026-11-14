import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import type { LatLon } from '../types';

export interface MapStop extends LatLon {
  label: string;
}

export function RouteMap(props: { start?: LatLon; stops: MapStop[]; line: LatLon[] }) {
  const node = useRef<HTMLDivElement>(null);
  const signature = JSON.stringify({ start: props.start, stops: props.stops, line: props.line });

  useEffect(() => {
    const host = node.current;
    if (!host) return;
    const map = L.map(host, { zoomControl: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const bounds: L.LatLngExpression[] = [];
    if (props.line.length > 1) {
      const drawn = L.polyline(
        props.line.map((point) => [point.lat, point.lon] as L.LatLngExpression),
        { color: '#1a4f8b', weight: 5, opacity: 0.9 },
      ).addTo(map);
      bounds.push(...(drawn.getLatLngs() as L.LatLng[]));
    }
    if (props.start) {
      bounds.push([props.start.lat, props.start.lon]);
      L.marker([props.start.lat, props.start.lon], { icon: pin('S', 'start'), zIndexOffset: 100 }).addTo(map);
    }
    for (const stop of props.stops) {
      bounds.push([stop.lat, stop.lon]);
      L.marker([stop.lat, stop.lon], { icon: pin(stop.label, 'stop') }).addTo(map);
    }
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { padding: [28, 28] });
    const refresh = window.setTimeout(() => map.invalidateSize(), 60);
    return () => {
      window.clearTimeout(refresh);
      map.remove();
    };
  }, [signature]);

  return <div class="route-map" ref={node} role="img" aria-label="Arranged route" />;
}

function pin(label: string, kind: 'start' | 'stop'): L.DivIcon {
  return L.divIcon({
    className: `map-pin ${kind}`,
    html: label,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}
