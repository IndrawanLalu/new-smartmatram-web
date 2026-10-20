"use client";

import { CircleMarker, Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { Titik } from "@/lib/koordinat";
import type { HasilCari } from "../_hooks/useCariLokasi";
import { WARNA } from "../_ui";
import { meter } from "./JarakGardu";

/**
 * Hasil "Cari lokasi/koordinat" di peta: pin di titik yang dicari, garis
 * putus-putus ke tiap objek terdekat (warna = jenis jaringannya), dan cincin
 * di objeknya — supaya terbaca walau lapisannya belum dinyalakan.
 */

const PIN = L.divIcon({
  className: "",
  iconSize: [26, 34],
  iconAnchor: [13, 33],
  html: `<svg width="26" height="34" viewBox="0 0 26 34"><path d="M13 1C6.4 1 1 6.3 1 12.9 1 21.5 13 33 13 33s12-11.5 12-20.1C25 6.3 19.6 1 13 1z" fill="#F43F5E" stroke="#fff" stroke-width="2"/><circle cx="13" cy="13" r="4.5" fill="#fff"/></svg>`,
});

interface Garis {
  kunci: string;
  ke: Titik;
  warna: string;
  label: string;
}

export default function LapisanCariLokasi({ titik, hasil }: { titik: Titik | null; hasil: HasilCari | null }) {
  if (!titik) return null;
  const garis: Garis[] = hasil
    ? [
        ...hasil.jtm.map((x) => ({ kunci: `jtm-${x.penyulang}`, ke: x, warna: WARNA.jtm, label: `${x.penyulang} · ${x.kode}` })),
        ...hasil.gardu.map((x) => ({ kunci: `gardu-${x.kode}`, ke: x, warna: WARNA.gardu, label: `Gardu ${x.kode}` })),
        ...hasil.jtr.map((x) => ({ kunci: `jtr-${x.tiang_id}`, ke: x, warna: WARNA.jtr, label: `JTR ${x.kode}` })),
      ].map((g) => ({ ...g, label: `${g.label} — ${meter(g.ke.jarak)}` }))
    : [];

  return (
    <>
      {garis.map((g) => (
        <Polyline
          key={`l-${g.kunci}`}
          positions={[[titik.lat, titik.lng], [g.ke.lat, g.ke.lng]]}
          pathOptions={{ color: g.warna, weight: 2, opacity: 0.95, dashArray: "6 6" }}
          interactive={false}
        />
      ))}
      {garis.map((g) => (
        <CircleMarker
          key={`c-${g.kunci}`}
          center={[g.ke.lat, g.ke.lng]}
          radius={9}
          pathOptions={{ color: g.warna, weight: 3, fillOpacity: 0 }}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <span className="text-[11px]">{g.label}</span>
          </Tooltip>
        </CircleMarker>
      ))}
      <Marker position={[titik.lat, titik.lng]} icon={PIN} zIndexOffset={1000} />
    </>
  );
}
