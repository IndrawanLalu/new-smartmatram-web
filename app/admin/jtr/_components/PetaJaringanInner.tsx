"use client";

import { useState, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, Rectangle, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { TiangBaris } from "../_hooks/useTiangJtr";

interface Props {
  tiang: TiangBaris[];
}

/**
 * Batas menampilkan nama tiang sekaligus.
 *
 * Tiap nama adalah satu elemen DOM yang ikut digambar ulang setiap peta digeser.
 * Beberapa ratus masih lancar; ribuan membuat peta tersendat justru saat sedang
 * dipakai menelusuri jaringan.
 */
const BATAS_NAMA = 400;

const CITRA =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const JALAN = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/** Warna tiang mengikuti keadaannya — merah lebih dulu terlihat daripada dibaca. */
function warna(t: TiangBaris): string {
  if ((t.kondisi && t.kondisi !== "Baik") || t.arde_kondisi === "Putus") return "#EF4444";
  // Arde yang tidak ada bukan penanda apa pun — sebagian besar tiang JTR
  // memang tidak berarde. Kalau ikut diwarnai, hampir seluruh peta jadi kuning
  // dan warna berhenti berarti.
  if ((t.rawan_row?.length ?? 0) > 0 || !!t.catatan_perbaikan?.trim()) return "#F59E0B";
  return "#22C55E";
}

export default function PetaJaringanInner({ tiang }: Props) {
  // Bawaan peta jalan, bukan citra satelit: petak citra jauh lebih berat dan
  // untuk menelusuri jaringan, jalan dan nama tempat justru lebih menolong.
  // Citra tetap sedia untuk menilai satu titik dari dekat.
  const [satelit, setSatelit] = useState(false);
  const [tampilNama, setTampilNama] = useState(false);

  const berkoordinat = useMemo(
    () => tiang.filter((t) => t.lat !== null && t.lng !== null),
    [tiang],
  );

  const petaId = useMemo(() => new Map(tiang.map((t) => [t.id, t])), [tiang]);

  // Titik gardu — satu penanda per gardu, bukan per tiang.
  const gardu = useMemo(() => {
    const m = new Map<string, { kode: string; nama: string | null; lat: number; lng: number }>();
    for (const t of tiang) {
      if (t.gardu_lat === null || t.gardu_lng === null) continue;
      const k = `${t.gardu_kode}|${t.ulp}`;
      if (!m.has(k))
        m.set(k, { kode: t.gardu_kode, nama: t.gardu_nama, lat: t.gardu_lat, lng: t.gardu_lng });
    }
    return [...m.values()];
  }, [tiang]);

  const tengah = useMemo<[number, number]>(() => {
    const titik = [
      ...berkoordinat.map((t) => [t.lat!, t.lng!] as [number, number]),
      ...gardu.map((g) => [g.lat, g.lng] as [number, number]),
    ];
    if (titik.length === 0) return [-8.58, 116.1];
    return [
      titik.reduce((s, p) => s + p[0], 0) / titik.length,
      titik.reduce((s, p) => s + p[1], 0) / titik.length,
    ];
  }, [berkoordinat, gardu]);

  return (
    <div className="relative h-full rounded-xl overflow-hidden border border-line">
      <MapContainer center={tengah} zoom={15} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          key={satelit ? "citra" : "jalan"}
          url={satelit ? CITRA : JALAN}
          maxZoom={19}
          attribution={satelit ? "&copy; Esri" : "&copy; OpenStreetMap"}
        />

        {/* Ruas jaringan: tiap tiang ke induknya, atau ke gardu bila pangkal. */}
        {berkoordinat.map((t) => {
          const induk = t.induk_id ? petaId.get(t.induk_id) : null;
          const aLat = induk ? induk.lat : t.gardu_lat;
          const aLng = induk ? induk.lng : t.gardu_lng;
          if (aLat === null || aLng === null) return null;
          return (
            <Polyline
              key={`r-${t.id}`}
              positions={[
                [aLat, aLng],
                [t.lat!, t.lng!],
              ]}
              pathOptions={{ color: "#38BDF8", weight: 3, opacity: 0.9 }}
            />
          );
        })}

        {gardu.map((g) => (
          <Rectangle
            key={`g-${g.kode}`}
            bounds={[
              [g.lat - 0.00009, g.lng - 0.00009],
              [g.lat + 0.00009, g.lng + 0.00009],
            ]}
            pathOptions={{ color: "#fff", weight: 2, fillColor: "#1D3573", fillOpacity: 1 }}
          >
            <Popup>
              <b>{g.kode}</b>
              {g.nama ? <><br />{g.nama}</> : null}
            </Popup>
          </Rectangle>
        ))}

        {berkoordinat.map((t) => (
          <CircleMarker
            key={t.id}
            center={[t.lat!, t.lng!]}
            radius={8}
            pathOptions={{ color: "#fff", weight: 2, fillColor: warna(t), fillOpacity: 1 }}
          >
            {tampilNama && (
              <Tooltip permanent direction="right" offset={[9, 0]} className="tooltip-tiang">
                {t.kode}
              </Tooltip>
            )}
            <Popup>
              <b>{t.kode}</b>
              <br />
              {t.jenis ?? "—"} {t.tinggi ? `${t.tinggi} m` : ""} · {t.kondisi ?? "—"}
              <br />
              {t.tiang_konduktor?.length
                ? t.tiang_konduktor
                    .map((k) => `${k.jenis ?? ""} ${k.ukuran ?? ""}`.trim())
                    .join(" | ")
                : "kabel belum dicatat"}
              <br />
              Arde: {t.arde_kondisi ?? "—"}
              {(t.rawan_row?.length ?? 0) > 0 && (
                <>
                  <br />
                  ROW: {t.rawan_row!.join(", ")}
                </>
              )}
              {t.catatan_perbaikan?.trim() && (
                <>
                  <br />
                  <i>{t.catatan_perbaikan}</i>
                </>
              )}
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      <div className="absolute top-2 right-2 z-[1000] flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setSatelit((s) => !s)}
          className="h-8 px-3 rounded-lg bg-white/95 border border-line text-xs font-semibold text-ink shadow-sm hover:bg-white"
        >
          {satelit ? "Peta jalan" : "Citra satelit"}
        </button>
        <button
          type="button"
          disabled={berkoordinat.length > BATAS_NAMA}
          title={
            berkoordinat.length > BATAS_NAMA
              ? `Terlalu banyak tiang (${berkoordinat.length}) untuk ditampilkan namanya sekaligus. Saring dulu penyulang atau gardunya.`
              : undefined
          }
          onClick={() => setTampilNama((v) => !v)}
          className={`h-8 px-3 rounded-lg border text-xs font-semibold shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            tampilNama
              ? "bg-navy-600 border-navy-600 text-white"
              : "bg-white/95 border-line text-ink hover:bg-white"
          }`}
        >
          {tampilNama ? "Sembunyikan nama" : "Nama tiang"}
        </button>
      </div>

      <div className="absolute bottom-2 left-2 z-[1000] flex flex-wrap items-center gap-3 rounded-lg bg-black/60 px-3 py-1.5 text-[11px] text-white">
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-[2px] bg-[#1D3573] ring-1 ring-white" /> gardu
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#22C55E] ring-1 ring-white" /> baik
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] ring-1 ring-white" /> perlu perhatian
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#EF4444] ring-1 ring-white" /> rusak
        </span>
      </div>
    </div>
  );
}
