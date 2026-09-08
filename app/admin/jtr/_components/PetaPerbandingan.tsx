"use client";

import { useState, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Rectangle, Tooltip, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { TiangBanding, Perubahan } from "../_hooks/useApprovalJtr";

type Mode = "sebelum" | "sesudah" | "selisih";

interface Props {
  tiang: TiangBanding[];
  gardu: { lat: number; lng: number } | null;
  garduKode: string;
  tinggi?: number;
}

const CITRA =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const JALAN = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const WARNA: Record<Perubahan, string> = {
  lama: "#64748B",
  baru: "#22C55E",
  berubah: "#F59E0B",
  hilang: "#EF4444",
};

const LABEL: Record<Perubahan, string> = {
  lama: "sudah ada",
  baru: "tiang baru",
  berubah: "data dikoreksi",
  hilang: "tidak aktif lagi",
};

/**
 * Peta sebelum vs sesudah satu inspeksi gardu.
 *
 * Yang dicari admin bukan "seperti apa jaringannya", melainkan "apa yang
 * berubah". Karena itu bawaannya **Selisih** — satu peta dengan perubahannya
 * diwarnai — bukan dua peta berdampingan yang harus dibandingkan sendiri dengan
 * mata. Tampilan Sebelum dan Sesudah tetap disediakan untuk memastikan.
 */
export default function PetaPerbandingan({ tiang, gardu, garduKode, tinggi = 420 }: Props) {
  const [mode, setMode] = useState<Mode>("selisih");
  const [satelit, setSatelit] = useState(false);

  const tampil = useMemo(() => {
    const berkoordinat = tiang.filter((t) => t.lat !== null && t.lng !== null);
    if (mode === "sebelum") return berkoordinat.filter((t) => t.perubahan !== "baru");
    if (mode === "sesudah") return berkoordinat.filter((t) => t.perubahan !== "hilang");
    return berkoordinat;
  }, [tiang, mode]);

  const petaId = useMemo(() => new Map(tiang.map((t) => [t.id, t])), [tiang]);

  const tengah = useMemo<[number, number]>(() => {
    const titik = [
      ...tampil.map((t) => [t.lat!, t.lng!] as [number, number]),
      ...(gardu ? ([[gardu.lat, gardu.lng]] as [number, number][]) : []),
    ];
    if (titik.length === 0) return [-8.58, 116.1];
    return [
      titik.reduce((s, p) => s + p[0], 0) / titik.length,
      titik.reduce((s, p) => s + p[1], 0) / titik.length,
    ];
  }, [tampil, gardu]);

  const hitung = useMemo(() => {
    const c: Record<Perubahan, number> = { lama: 0, baru: 0, berubah: 0, hilang: 0 };
    for (const t of tiang) c[t.perubahan]++;
    return c;
  }, [tiang]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-surface p-1">
          {(["sebelum", "selisih", "sesudah"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 h-8 rounded-lg text-sm font-semibold capitalize transition-colors ${
                mode === m ? "bg-navy-600 text-white" : "text-ink-soft hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-soft">
          {(Object.keys(WARNA) as Perubahan[])
            .filter((k) => hitung[k] > 0)
            .map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <i
                  className="w-2.5 h-2.5 rounded-full ring-1 ring-white"
                  style={{ background: WARNA[k] }}
                />
                {LABEL[k]} <b className="text-ink">{hitung[k]}</b>
              </span>
            ))}
        </div>

        <button
          onClick={() => setSatelit((s) => !s)}
          className="ml-auto h-8 px-3 rounded-lg border border-line bg-white text-xs font-semibold text-ink hover:bg-surface"
        >
          {satelit ? "Peta jalan" : "Citra satelit"}
        </button>
      </div>

      <div className="rounded-xl overflow-hidden border border-line">
        <MapContainer center={tengah} zoom={17} scrollWheelZoom style={{ height: tinggi, width: "100%" }}>
          <TileLayer
            key={satelit ? "citra" : "jalan"}
            url={satelit ? CITRA : JALAN}
            maxZoom={19}
            attribution={satelit ? "&copy; Esri" : "&copy; OpenStreetMap"}
          />

          {tampil.map((t) => {
            const induk = t.indukId ? petaId.get(t.indukId) : null;
            const aLat = induk?.lat ?? gardu?.lat ?? null;
            const aLng = induk?.lng ?? gardu?.lng ?? null;
            if (aLat === null || aLng === null) return null;
            return (
              <Polyline
                key={`r-${t.id}`}
                positions={[
                  [aLat, aLng],
                  [t.lat!, t.lng!],
                ]}
                pathOptions={{
                  color: WARNA[t.perubahan],
                  weight: t.perubahan === "lama" ? 2 : 3,
                  opacity: t.perubahan === "lama" ? 0.5 : 0.9,
                  dashArray: t.perubahan === "hilang" ? "6 5" : undefined,
                }}
              />
            );
          })}

          {gardu && (
            <Rectangle
              bounds={[
                [gardu.lat - 0.00009, gardu.lng - 0.00009],
                [gardu.lat + 0.00009, gardu.lng + 0.00009],
              ]}
              pathOptions={{ color: "#fff", weight: 2, fillColor: "#1D3573", fillOpacity: 1 }}
            >
              <Tooltip>{garduKode}</Tooltip>
            </Rectangle>
          )}

          {tampil.map((t) => (
            <CircleMarker
              key={t.id}
              center={[t.lat!, t.lng!]}
              radius={t.perubahan === "lama" ? 6 : 8}
              pathOptions={{
                color: "#fff",
                weight: 2,
                fillColor: WARNA[t.perubahan],
                fillOpacity: t.perubahan === "lama" ? 0.75 : 1,
              }}
            >
              <Popup>
                <b>{t.kode}</b> — {LABEL[t.perubahan]}
                <br />
                Jurusan {t.jurusan ?? "—"} · {t.kondisi ?? "—"}
                {t.rincian.length > 0 && (
                  <>
                    <br />
                    <span style={{ color: "#B45309" }}>{t.rincian.join("; ")}</span>
                  </>
                )}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
