"use client";

import { CircleMarker, Marker, Polyline } from "react-leaflet";
import L from "leaflet";

/**
 * Sorotan benda yang sedang dipilih, dan — saat "Geser titik" aktif — penanda
 * yang bisa diseret. Titik asal tetap digambar dengan garis putus-putus ke
 * posisi baru, supaya yang menggeser selalu melihat seberapa jauh dia memindah.
 */

export const IKON_GESER = L.divIcon({
  className: "",
  iconSize: [26, 26],
  iconAnchor: [13, 13],
  html: `<div style="width:26px;height:26px;border-radius:50%;border:3px solid #5eead4;background:rgba(94,234,212,0.25);box-shadow:0 0 0 2px #0b1220,0 2px 8px rgba(0,0,0,.6);cursor:grab"></div>`,
});

export default function PenggeserTitik({
  sorot,
  geser,
  onGeser,
}: {
  sorot: { lat: number; lng: number } | null;
  geser: { lat: number; lng: number } | null;
  onGeser: (lat: number, lng: number) => void;
}) {
  if (!sorot) return null;
  return (
    <>
      <CircleMarker
        center={[sorot.lat, sorot.lng]}
        radius={12}
        pathOptions={{ color: "#5eead4", weight: 2.5, fillOpacity: 0, dashArray: geser ? "3 4" : undefined }}
        interactive={false}
      />
      {geser && (
        <>
          <Polyline
            positions={[
              [sorot.lat, sorot.lng],
              [geser.lat, geser.lng],
            ]}
            pathOptions={{ color: "#5eead4", weight: 2, dashArray: "5 5" }}
            interactive={false}
          />
          <Marker
            position={[geser.lat, geser.lng]}
            icon={IKON_GESER}
            draggable
            autoPan
            eventHandlers={{
              dragend: (e) => {
                const p = (e.target as L.Marker).getLatLng();
                onGeser(p.lat, p.lng);
              },
            }}
          />
        </>
      )}
    </>
  );
}
