"use client";

import { CircleMarker, Marker, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { PeranTitik } from "@/app/admin/pengukuran-gardu/_lib/rencanaJtr";
import type { RencanaPeta } from "../_hooks/useRencanaPeta";

/**
 * Rencana perbaikan JTR di peta: gawang yang PINDAH (ke jurusan baru / gardu
 * sisip) disorot ungu tebal di bawah jaringan, tiang kuncinya diberi label
 * — PECAH, SISIP, ALT (titik pecah pilihan lain), KABEL (kabel kecil).
 */

export const WARNA_PINDAH = "#E879F9";

const GAYA: Record<PeranTitik, { label: string; latar: string; cincin: string }> = {
  pecah: { label: "PECAH", latar: "#7C3AED", cincin: "#C4B5FD" },
  sisip: { label: "SISIP", latar: "#DC2626", cincin: "#FCA5A5" },
  alternatif: { label: "ALT", latar: "#475569", cincin: "#CBD5E1" },
  kabel: { label: "KABEL", latar: "#D97706", cincin: "#FCD34D" },
};

const IKON = Object.fromEntries(
  (Object.keys(GAYA) as PeranTitik[]).map((p) => [
    p,
    L.divIcon({
      className: "",
      iconSize: [54, 20],
      iconAnchor: [27, 30],
      html: `<div style="display:flex;justify-content:center"><span style="background:${GAYA[p].latar};color:#fff;font:700 10px/1 sans-serif;letter-spacing:.5px;padding:4px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);white-space:nowrap">${GAYA[p].label}</span></div>`,
    }),
  ]),
) as Record<PeranTitik, L.DivIcon>;

export default function LapisanRencana({ data }: { data: RencanaPeta | null }) {
  if (!data) return null;
  return (
    <>
      {data.pindah.map((g, i) => (
        <Polyline key={`p-${i}`} positions={g} pathOptions={{ color: WARNA_PINDAH, weight: 9, opacity: 0.55 }} interactive={false} />
      ))}
      {data.titik.map((t) => (
        <CircleMarker
          key={`c-${t.peran}-${t.tiang_id}`}
          center={[t.lat, t.lng]}
          radius={11}
          pathOptions={{ color: GAYA[t.peran].cincin, weight: 3, fillOpacity: 0 }}
          interactive={false}
        />
      ))}
      {data.titik.map((t) => (
        <Marker key={`m-${t.peran}-${t.tiang_id}`} position={[t.lat, t.lng]} icon={IKON[t.peran]} zIndexOffset={900}>
          <Tooltip direction="top" offset={[0, -26]}>
            <span className="text-[11px]">{t.kode ?? "tiang"}</span>
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}
