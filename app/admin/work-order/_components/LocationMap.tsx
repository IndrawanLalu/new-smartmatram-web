"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface LocationMapProps {
  lat: number;
  lng: number;
  label?: string;
}

// Pakai CircleMarker (tanpa aset ikon) supaya bebas masalah bundling ikon Leaflet.
export default function LocationMap({ lat, lng, label }: LocationMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: 220, width: "100%", borderRadius: 8 }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[lat, lng]}
        radius={9}
        pathOptions={{ color: "#00897B", fillColor: "#00897B", fillOpacity: 0.6, weight: 2 }}
      >
        {label && <Popup>{label}</Popup>}
      </CircleMarker>
    </MapContainer>
  );
}
