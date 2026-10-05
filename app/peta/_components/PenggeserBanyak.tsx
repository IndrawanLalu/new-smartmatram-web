"use client";

import { CircleMarker, Marker, Polyline, Tooltip } from "react-leaflet";
import type L from "leaflet";
import type { GeserTiang } from "../_hooks/useGeserBanyak";
import { IKON_GESER } from "./PenggeserTitik";

/**
 * Pegangan seret mode geser titik — satu per tiang yang sudah diklik. Titik
 * asal tetap terlihat (lingkaran putus-putus + garis ke posisi baru), sama
 * seperti geser satu tiang.
 */
export default function PenggeserBanyak({
  daftar,
  onSeret,
}: {
  daftar: GeserTiang[];
  onSeret: (id: string, lat: number, lng: number) => void;
}) {
  return (
    <>
      {daftar.map((g) => (
        <CircleMarker
          key={`asal-${g.id}`}
          center={g.asal}
          radius={10}
          interactive={false}
          pathOptions={{ color: "#5eead4", weight: 2, fillOpacity: 0, dashArray: "3 4" }}
        />
      ))}
      {daftar.map((g) => (
        <Polyline
          key={`garis-${g.id}`}
          positions={[g.asal, g.baru]}
          interactive={false}
          pathOptions={{ color: "#5eead4", weight: 2, dashArray: "5 5" }}
        />
      ))}
      {daftar.map((g) => (
        <Marker
          key={`seret-${g.id}`}
          position={g.baru}
          icon={IKON_GESER}
          draggable
          autoPan
          zIndexOffset={1000}
          eventHandlers={{
            dragend: (e) => {
              const p = (e.target as L.Marker).getLatLng();
              onSeret(g.id, p.lat, p.lng);
            },
          }}
        >
          <Tooltip direction="top" offset={[0, -12]}>
            <span className="text-[11px] font-semibold">{g.kode}</span>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
