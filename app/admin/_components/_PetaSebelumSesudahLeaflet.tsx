"use client";

import { MapContainer, TileLayer, Marker, Polyline, Tooltip, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TitikUsulan } from "./PetaSebelumSesudah";

/** Penanda bulat berwarna — sama polanya dengan peta Command Center. */
const penanda = (warna: string, label: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${warna};width:16px;height:16px;border-radius:50%;
           border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"
           title="${label}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const LAMA = "#94A3B8";
const BARU = "#1D3573";

export default function PetaSebelumSesudahLeaflet({ titik }: { titik: TitikUsulan }) {
  const ada = titik.lamaLat !== null && titik.lamaLng !== null;
  const baru: [number, number] = [titik.baruLat, titik.baruLng];
  const lama: [number, number] | null = ada
    ? [titik.lamaLat as number, titik.lamaLng as number]
    : null;

  // Kedua titik harus muat sekaligus, berapa pun jaraknya — termasuk saat
  // selisihnya 14 km. Peta yang cuma memperlihatkan salah satunya membuat
  // admin menyetujui perpindahan yang tidak pernah dia lihat.
  const batas = lama ? L.latLngBounds([lama, baru]).pad(0.35) : undefined;

  return (
    <div className="h-[220px] rounded-xl overflow-hidden border border-line">
      <MapContainer
        center={baru}
        zoom={17}
        bounds={batas}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution=""
          maxZoom={19}
        />

        {/* Ketelitian GPS digambar sebagai lingkaran. Titik baru yang
            lingkarannya menelan titik lama berarti keduanya bisa jadi tempat
            yang sama — itu terlihat seketika di peta, tidak dari angka. */}
        {titik.akurasiM !== null && titik.akurasiM > 0 && (
          <Circle
            center={baru}
            radius={titik.akurasiM}
            pathOptions={{ color: BARU, weight: 1, fillOpacity: 0.08 }}
          />
        )}

        {lama && (
          <>
            <Polyline
              positions={[lama, baru]}
              pathOptions={{ color: "#DC2626", weight: 2, dashArray: "6 5" }}
            />
            <Marker position={lama} icon={penanda(LAMA, "Titik lama")}>
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span className="text-[10px] font-semibold">Sebelum</span>
              </Tooltip>
            </Marker>
          </>
        )}

        <Marker position={baru} icon={penanda(BARU, "Titik baru")}>
          <Tooltip permanent direction="top" offset={[0, -10]}>
            <span className="text-[10px] font-semibold">
              {lama ? "Sesudah" : "Titik petugas"}
            </span>
          </Tooltip>
        </Marker>
      </MapContainer>
    </div>
  );
}
