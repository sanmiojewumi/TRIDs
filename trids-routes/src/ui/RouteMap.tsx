import { useEffect, useRef } from 'preact/hooks';
import L from 'leaflet';
import type { LatLon } from '../types';

export interface MapStop extends LatLon {
  id: string;
  label: string;
}

const CREWE: L.LatLngExpression = [53.099, -2.441];

export function RouteMap(props: { start?: LatLon & { label?: string }; stops: MapStop[]; line: LatLon[]; selected?: string; focus?: (LatLon & { token: number }) | null; onSelect: (id: string) => void }) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(props.onSelect);
  selectRef.current = props.onSelect;
  const signature = JSON.stringify({ start: props.start, stops: props.stops, line: props.line, selected: props.selected });

  useEffect(() => {
    const host = node.current;
    if (!host) return;
    const map = L.map(host, { zoomControl: false, attributionControl: true }).setView(CREWE, 11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const refresh = window.setTimeout(() => map.invalidateSize(), 80);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(refresh);
      window.removeEventListener('resize', onResize);
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const bounds: L.LatLngExpression[] = [];
    if (props.line.length > 1) {
      const drawn = L.polyline(
        props.line.map((point) => [point.lat, point.lon] as L.LatLngExpression),
        { color: '#4c8dff', weight: 5, opacity: 0.95 },
      );
      drawn.addTo(layer);
      bounds.push(...(drawn.getLatLngs() as L.LatLng[]));
    }
    if (props.start) {
      bounds.push([props.start.lat, props.start.lon]);
      const marker = L.marker([props.start.lat, props.start.lon], { icon: pin('S', 'start'), zIndexOffset: 200 }).addTo(layer);
      if (props.start.label) marker.bindTooltip(props.start.label, { permanent: true, direction: 'top', className: 'start-tip', offset: [0, -12] });
    }
    for (const stop of props.stops) {
      bounds.push([stop.lat, stop.lon]);
      const marker = L.marker([stop.lat, stop.lon], { icon: pin(stop.label, stop.id === props.selected ? 'selected' : 'stop'), zIndexOffset: stop.id === props.selected ? 400 : 100 }).addTo(layer);
      marker.on('click', () => selectRef.current(stop.id));
    }
    if (bounds.length === 1) map.setView(bounds[0], 14);
    else if (bounds.length > 1) map.fitBounds(L.latLngBounds(bounds), { paddingTopLeft: [40, 70], paddingBottomRight: [40, 240] });
  }, [signature]);

  useEffect(() => {
    if (!props.focus || !mapRef.current) return;
    mapRef.current.flyTo([props.focus.lat, props.focus.lon], 15);
  }, [props.focus?.token]);

  return <div class="route-map" ref={node} />;
}

function pin(label: string, kind: 'start' | 'stop' | 'selected'): L.DivIcon {
  return L.divIcon({
    className: `map-pin ${kind}`,
    html: label,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}
