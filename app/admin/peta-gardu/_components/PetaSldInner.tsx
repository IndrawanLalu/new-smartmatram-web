"use client";

import { Fragment, useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { htmlPenandaJtm } from "@/lib/penandaJtm";
import type { GarduInfo, GrafSld, Simpul } from "@/lib/sld";
import type { Penanda } from "@/app/peta/_hooks/usePenandaJtm";

/**
 * Peta SLD: hanya pangkal, garis ringkas, keypoint, dan gardu — bukan ribuan
 * tiang. Yang padam dalam simulasi digambar merah tebal di atas garis biasa.
 */

interface Props {
  graf: GrafSld[];
  warna: Map<string, string>;
  gardu: Map<string, GarduInfo>;
  penanda: Map<string, Penanda>;
  padam: Set<string> | null;
  terpilih: string | null;
  label: boolean;
  onPilih: (penyulang: string, simpulId: string) => void;
}

const MERAH = "#DC2626";

/** Ikon dibuat sekali, dipakai ulang semua penanda (lihat app/peta/PetaInner). */
const ikonRumah = (warna: string) =>
  L.divIcon({
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 14],
    html: `<svg viewBox="0 0 16 16" width="16" height="16" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))">
      <polygon points="8,1 15,7 1,7" fill="${warna}" stroke="#fff" stroke-width="0.8"/>
      <rect x="3" y="7" width="10" height="8" fill="${warna}" stroke="#fff" stroke-width="0.8"/></svg>`,
  });
const IKON_GARDU = {
  hijau: ikonRumah("#16A34A"),
  kuning: ikonRumah("#F59E0B"),
  merah: ikonRumah(MERAH),
  abu: ikonRumah("#94A3B8"),
};
const IKON_PANGKAL = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="width:22px;height:22px;border-radius:4px;background:#0F172A;border:2px solid #fff;color:#fff;font:700 11px/18px sans-serif;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.5)">P</div>`,
});

const nadaGardu = (g: GarduInfo | undefined) =>
  !g || g.persen === null ? "abu" : g.persen >= 80 ? "merah" : g.persen >= 60 ? "kuning" : "hijau";

function Fokus({ graf }: { graf: GrafSld[] }) {
  const peta = useMap();
  const kunci = graf.map((g) => g.penyulang).join("|");
  useEffect(() => {
    const titik = graf.flatMap((g) => [...g.simpul.values()].map((s) => [s.lat, s.lng] as [number, number]));
    if (titik.length) peta.fitBounds(L.latLngBounds(titik), { padding: [40, 40], maxZoom: 17 });
    // Hanya saat pilihan penyulang berubah, bukan tiap simulasi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci, peta]);
  return null;
}

export default function PetaSldInner({ graf, warna, gardu, penanda, padam, terpilih, label, onPilih }: Props) {
  const ikonKeypoint = useMemo(() => {
    const m = new Map<string, L.DivIcon>();
    for (const [kode, p] of penanda) {
      m.set(kode, L.divIcon({
        className: "",
        html: htmlPenandaJtm(p.bentuk, p.warna, 16),
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      }));
    }
    return m;
  }, [penanda]);

  const tanda = (s: Simpul) => (s.penanda ? penanda.get(s.penanda)?.label ?? s.penanda : "");

  return (
    <MapContainer center={[-8.58, 116.1]} zoom={12} className="h-full w-full" preferCanvas>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
      <Fokus graf={graf} />

      {graf.map((g) => (
        <Fragment key={g.penyulang}>
          {[...g.simpul.values()].map((s) =>
            s.jalur.length > 1 ? (
              <Polyline
                key={`g-${s.id}-${padam?.has(s.id) ? 1 : 0}`}
                positions={s.jalur}
                pathOptions={
                  padam?.has(s.id)
                    ? { color: MERAH, weight: 6, opacity: 0.9 }
                    : { color: warna.get(g.penyulang), weight: 3.5, opacity: 0.85 }
                }
                interactive={false}
              />
            ) : null,
          )}

          {[...g.simpul.values()].map((s) => {
            const pilih = { click: () => onPilih(g.penyulang, s.id) };
            const sorot = terpilih === s.id && (
              <CircleMarker center={[s.lat, s.lng]} radius={14} interactive={false} pathOptions={{ color: MERAH, weight: 3, fillOpacity: 0 }} />
            );
            if (s.jenis === "pangkal" || s.jenis === "keypoint") {
              const ikon = s.jenis === "pangkal" ? IKON_PANGKAL : ikonKeypoint.get(s.penanda ?? "");
              if (!ikon) return null;
              return (
                <Fragment key={s.id}>
                  {sorot}
                  <Marker position={[s.lat, s.lng]} icon={ikon} eventHandlers={pilih} zIndexOffset={600}>
                    <Tooltip direction="top" offset={[0, -10]} permanent={label}>
                      <span className="text-[11px] font-semibold">{s.kode}</span>
                      <span className="block text-[10px]">
                        {s.jenis === "pangkal" ? `Pangkal ${g.penyulang}` : tanda(s)} · klik untuk simulasi lepas
                      </span>
                    </Tooltip>
                  </Marker>
                </Fragment>
              );
            }
            if (s.jenis === "gardu") {
              const info = s.gardu ? gardu.get(s.gardu) : undefined;
              return (
                <Marker key={s.id} position={[s.lat, s.lng]} icon={IKON_GARDU[nadaGardu(info)]} zIndexOffset={400}>
                  <Tooltip direction="top" offset={[0, -14]} permanent={label}>
                    <span className="text-[11px] font-semibold">{s.gardu ?? `${s.kode} (kode gardu belum diisi)`}</span>
                    {info && (
                      <span className="block text-[10px]">
                        {info.nama ?? ""} · {info.daya ?? "?"} kVA
                        {info.persen !== null ? ` · beban ${info.persen.toFixed(0)}%` : " · belum diukur"}
                      </span>
                    )}
                  </Tooltip>
                </Marker>
              );
            }
            return s.jenis === "ujung" ? (
              <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={3} interactive={false}
                pathOptions={{ color: warna.get(g.penyulang), weight: 1, fillOpacity: 1 }} />
            ) : null;
          })}
        </Fragment>
      ))}
    </MapContainer>
  );
}
