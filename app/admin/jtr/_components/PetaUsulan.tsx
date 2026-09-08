"use client";

import { useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Circle, Tooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

export interface TitikTiang {
  kode: string;
  lat: number;
  lng: number;
  indukLat: number | null;
  indukLng: number | null;
}

interface Props {
  /** Titik gardu menurut master sebelum dikoreksi. Null bila dulu kosong. */
  lama: { lat: number; lng: number } | null;
  /** Titik yang diusulkan petugas. */
  baru: { lat: number; lng: number };
  /** Ketelitian GPS saat titik diambil, dalam meter. */
  akurasi: number | null;
  /** Tiang milik gardu ini — bukti terkuat, dan datanya sudah ada. */
  tiang: TitikTiang[];
  tinggi?: number;
}

const CITRA =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const JALAN = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
 * Peta pembanding untuk memutuskan koreksi titik gardu.
 *
 * Tiga hal sengaja ditampilkan bersama, karena dua titik saja belum cukup untuk
 * memutuskan:
 *
 *   1. Lingkaran ketelitian GPS — koreksi ±4 m dan ±30 m menuntut kepercayaan
 *      yang jauh berbeda padahal sama-sama satu titik di peta.
 *
 *   2. Tiang-tiang gardu itu. Ini bukti terkuat dan gratis: kalau titik baru
 *      duduk di pangkal rangkaian tiang sementara titik lama terlempar jauh dari
 *      semuanya, keputusannya jelas tanpa perlu berpikir. Kalau titik baru
 *      justru menjauh dari rangkaian, itu tanda petugas mungkin salah gardu.
 *
 *   3. Citra satelit sebagai latar bawaan. Gardu itu bangunan yang kelihatan
 *      dari udara; di atas peta jalan, dua titik berselisih 80 m sama-sama
 *      tampak "di pinggir jalan".
 */
export default function PetaUsulan({ lama, baru, akurasi, tiang, tinggi = 340 }: Props) {
  const [satelit, setSatelit] = useState(true);

  const semua: [number, number][] = [
    [baru.lat, baru.lng],
    ...(lama ? ([[lama.lat, lama.lng]] as [number, number][]) : []),
    ...tiang.map((t) => [t.lat, t.lng] as [number, number]),
  ];

  // Titik tengah dan zoom dibiarkan sederhana: dua titik + tiang biasanya berada
  // dalam satu kampung, jadi tengah aritmetik sudah memadai.
  const tengah: [number, number] = [
    semua.reduce((s, p) => s + p[0], 0) / semua.length,
    semua.reduce((s, p) => s + p[1], 0) / semua.length,
  ];

  return (
    <div className="relative rounded-xl overflow-hidden border border-line">
      <MapContainer
        center={tengah}
        zoom={17}
        scrollWheelZoom
        style={{ height: tinggi, width: "100%" }}
      >
        <TileLayer
          key={satelit ? "citra" : "jalan"}
          url={satelit ? CITRA : JALAN}
          maxZoom={19}
          attribution={satelit ? "&copy; Esri" : "&copy; OpenStreetMap"}
        />

        {/* Jaringan tiang gardu ini */}
        {tiang.map((t) => (
          <div key={t.kode}>
            {t.indukLat !== null && t.indukLng !== null && (
              <Polyline
                positions={[
                  [t.indukLat, t.indukLng],
                  [t.lat, t.lng],
                ]}
                pathOptions={{ color: "#FACC15", weight: 2.5, opacity: 0.9 }}
              />
            )}
            <CircleMarker
              center={[t.lat, t.lng]}
              radius={5}
              pathOptions={{ color: "#fff", weight: 1.5, fillColor: "#FACC15", fillOpacity: 1 }}
            >
              <Tooltip>{t.kode}</Tooltip>
            </CircleMarker>
          </div>
        ))}

        {/* Titik lama → titik baru */}
        {lama && (
          <>
            <Polyline
              positions={[
                [lama.lat, lama.lng],
                [baru.lat, baru.lng],
              ]}
              pathOptions={{ color: "#fff", weight: 2, dashArray: "6 6", opacity: 0.9 }}
            />
            <CircleMarker
              center={[lama.lat, lama.lng]}
              radius={9}
              pathOptions={{ color: "#fff", weight: 2, fillColor: "#EF4444", fillOpacity: 0.85 }}
            >
              <Tooltip permanent direction="top">Titik lama</Tooltip>
            </CircleMarker>
          </>
        )}

        {akurasi && akurasi > 0 && (
          <Circle
            center={[baru.lat, baru.lng]}
            radius={akurasi}
            pathOptions={{ color: "#22C55E", weight: 1, opacity: 0.7, fillOpacity: 0.12 }}
          />
        )}
        <CircleMarker
          center={[baru.lat, baru.lng]}
          radius={9}
          pathOptions={{ color: "#fff", weight: 2, fillColor: "#22C55E", fillOpacity: 0.95 }}
        >
          <Tooltip permanent direction="bottom">Titik baru</Tooltip>
        </CircleMarker>
      </MapContainer>

      <button
        type="button"
        onClick={() => setSatelit((s) => !s)}
        className="absolute top-2 right-2 z-[1000] h-8 px-3 rounded-lg bg-white/95 border border-line text-xs font-semibold text-ink shadow-sm hover:bg-white"
      >
        {satelit ? "Peta jalan" : "Citra satelit"}
      </button>

      <div className="absolute bottom-2 left-2 z-[1000] flex flex-wrap items-center gap-3 rounded-lg bg-black/60 px-3 py-1.5 text-[11px] text-white">
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#EF4444] ring-1 ring-white" /> titik lama
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#22C55E] ring-1 ring-white" /> titik baru
        </span>
        <span className="flex items-center gap-1.5">
          <i className="w-2.5 h-2.5 rounded-full bg-[#FACC15] ring-1 ring-white" /> tiang JTR
        </span>
      </div>
    </div>
  );
}
