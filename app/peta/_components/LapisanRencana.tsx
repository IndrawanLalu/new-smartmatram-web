"use client";

import { CircleMarker, Marker, Pane, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import type { PeranTitik } from "@/app/admin/pengukuran-gardu/_lib/rencanaJtr";
import type { OpsiPeta, RencanaPetaState } from "../_hooks/useRencanaPeta";

/**
 * Rencana perbaikan JTR di peta: gawang yang PINDAH (ke jurusan baru / gardu
 * sisip) disorot ungu tebal di bawah jaringan. Titik pecah diberi nomor
 * pilihan — yang terpilih ungu "PECAH n", lainnya abu "n". Penanda lain:
 * SISIP, KABEL (kabel kecil). Mode "pilih titik" memasang sasaran klik di
 * setiap tiang jurusan itu, di pane teratas supaya klik tidak membuka panel
 * tiang.
 */

export const WARNA_PINDAH = "#E879F9";

const GAYA: Record<PeranTitik, { label: string; latar: string; cincin: string }> = {
  pecah: { label: "PECAH", latar: "#7C3AED", cincin: "#C4B5FD" },
  sisip: { label: "SISIP", latar: "#DC2626", cincin: "#FCA5A5" },
  alternatif: { label: "ALT", latar: "#475569", cincin: "#CBD5E1" },
  kabel: { label: "KABEL", latar: "#D97706", cincin: "#FCD34D" },
};

const pil = (teks: string, latar: string) =>
  L.divIcon({
    className: "",
    iconSize: [70, 20],
    iconAnchor: [35, 30],
    html: `<div style="display:flex;justify-content:center"><span style="background:${latar};color:#fff;font:700 10px/1 sans-serif;letter-spacing:.5px;padding:4px 7px;border-radius:999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5);white-space:nowrap;cursor:pointer">${teks}</span></div>`,
  });

const IKON = Object.fromEntries((Object.keys(GAYA) as PeranTitik[]).map((p) => [p, pil(GAYA[p].label, GAYA[p].latar)])) as Record<PeranTitik, L.DivIcon>;

/** Opsi dikelompokkan per tiang titik pecah — satu tiang bisa punya beberapa cabang. */
function perTitik(opsi: OpsiPeta[]) {
  const g = new Map<string, OpsiPeta[]>();
  for (const o of opsi) g.set(o.titikId, [...(g.get(o.titikId) ?? []), o]);
  return [...g.values()];
}

export default function LapisanRencana({ s }: { s: RencanaPetaState | null }) {
  const data = s?.data;
  if (!s || !data) return null;
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
      {perTitik(data.opsi).map((grup) => {
        const aktif = grup.find((o) => o.kunci === s.terpilih);
        const nomor = grup.map((o) => o.nomor).join("·");
        // Klik berulang di tiang yang sama berganti ke cabang berikutnya.
        const berikut = grup[(grup.findIndex((o) => o.kunci === s.terpilih) + 1) % grup.length];
        return (
          <Marker
            key={`o-${grup[0].titikId}`}
            position={[grup[0].lat, grup[0].lng]}
            icon={aktif ? pil(`PECAH ${nomor}`, GAYA.pecah.latar) : pil(nomor, GAYA.alternatif.latar)}
            zIndexOffset={aktif ? 1000 : 900}
            eventHandlers={{ click: () => s.pilih(berikut.kunci) }}
          >
            <Tooltip direction="top" offset={[0, -26]}>
              <span className="text-[11px]">{grup[0].titikKode ?? "tiang"}</span>
            </Tooltip>
          </Marker>
        );
      })}
      {data.opsi.filter((o) => o.kunci === s.terpilih).map((o) => (
        <CircleMarker key="cincin-aktif" center={[o.lat, o.lng]} radius={11} pathOptions={{ color: GAYA.pecah.cincin, weight: 3, fillOpacity: 0 }} interactive={false} />
      ))}
      {s.modePilih && (
        <Pane name="rencana-pilih" style={{ zIndex: 660 }}>
          {data.tiang.map((t) => (
            <CircleMarker
              key={`pilih-${t.id}`}
              center={[t.lat, t.lng]}
              radius={8}
              pathOptions={{ color: "#C4B5FD", weight: 2, fillColor: "#7C3AED", fillOpacity: 0.25 }}
              eventHandlers={{ click: () => s.hitungDi(t.id) }}
            >
              <Tooltip direction="top" offset={[0, -8]}>
                <span className="text-[11px]">Pecah di {t.kode ?? "tiang"}</span>
              </Tooltip>
            </CircleMarker>
          ))}
        </Pane>
      )}
    </>
  );
}
