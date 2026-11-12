"use client";

import { useEffect, useRef } from "react";
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { divIcon, latLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapPin = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  tone: "start" | "end" | "stop" | "done" | "late";
};

function markerIcon(label: string, tone: MapPin["tone"]) {
  return divIcon({
    className: `pin pin-${tone}`,
    html: `<span>${label}</span>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function FitBounds({ signature, points }: { signature: string; points: [number, number][] }) {
  const map = useMap();
  const latest = useRef(points);
  latest.current = points;
  useEffect(() => {
    const current = latest.current;
    if (current.length === 0) {
      map.setView([20, 0], 2);
      return;
    }
    if (current.length === 1) {
      map.setView(current[0], 14);
      return;
    }
    map.fitBounds(latLngBounds(current), { padding: [36, 36], maxZoom: 15 });
  }, [map, signature]);
  return null;
}

function MapClicks({ enabled, onPick }: { enabled: boolean; onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(event) {
      if (enabled) onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export default function MapPane({
  pins,
  line,
  pinDrop,
  onSelect,
  onMapClick,
}: {
  pins: MapPin[];
  line: [number, number][];
  pinDrop: boolean;
  onSelect: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const points = pins.map((pin) => [pin.lat, pin.lng] as [number, number]);
  const signature = [...points, ...line].map((point) => point.map((value) => value.toFixed(4)).join(",")).join(";");
  return (
    <MapContainer center={[20, 0]} zoom={2} className="map" scrollWheelZoom>
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds signature={signature} points={points.length > 0 ? points : line} />
      <MapClicks enabled={pinDrop} onPick={onMapClick} />
      {line.length > 1 ? <Polyline positions={line} pathOptions={{ color: "#1b1914", weight: 4, opacity: 0.85 }} /> : null}
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          position={[pin.lat, pin.lng]}
          icon={markerIcon(pin.label, pin.tone)}
          eventHandlers={{ click: () => onSelect(pin.id) }}
        />
      ))}
    </MapContainer>
  );
}
