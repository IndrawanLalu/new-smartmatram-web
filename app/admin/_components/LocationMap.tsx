"use client";

import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface LocationMapProps {
  lat: number;
  lng: number;
  label?: string;
  /** Tinggi peta dalam piksel. Leaflet butuh tinggi eksplisit — wadah tanpa
   *  tinggi membuat petanya runtuh jadi 0px. */
  tinggi?: number;
}

// Pakai CircleMarker (tanpa aset ikon) supaya bebas masalah bundling ikon Leaflet.
// Dipakai bersama: bukti selesai Work Order dan detail master gardu.
export default function LocationMap({ lat, lng, label, tinggi = 220 }: LocationMapProps) {
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={16}
      scrollWheelZoom={false}
      style={{ height: tinggi, width: "100%" }}
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
