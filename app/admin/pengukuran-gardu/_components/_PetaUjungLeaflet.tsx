"use client";

import { MapContainer, TileLayer, Marker, Polyline, Tooltip, Circle } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { TitikPetaUjung } from "./PetaUjung";

/** Penanda bulat berwarna — sepola peta persetujuan titik gardu. */
const penanda = (warna: string) =>
  L.divIcon({
    className: "",
    html: `<div style="background:${warna};width:16px;height:16px;border-radius:50%;
           border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

const GARDU = "#94A3B8";
const UKUR = "#1D3573";
const TIANG = "#D97706";

export default function PetaUjungLeaflet({ titik }: { titik: TitikPetaUjung }) {
  const ukur: [number, number] = [titik.ukurLat, titik.ukurLng];
  const gardu: [number, number] | null = titik.garduLat !== null && titik.garduLng !== null ? [titik.garduLat, titik.garduLng] : null;
  const tiang: [number, number] | null = titik.tiangLat !== null && titik.tiangLng !== null ? [titik.tiangLat, titik.tiangLng] : null;

  // Semua titik harus muat sekaligus — titik ukur 400 m dari gardu harus
  // TERLIHAT 400 m, itulah yang diperiksa admin.
  const semua = [ukur, ...(gardu ? [gardu] : []), ...(tiang ? [tiang] : [])];
  const batas = semua.length > 1 ? L.latLngBounds(semua).pad(0.35) : undefined;

  return (
    <div className="h-[260px] rounded-xl overflow-hidden border border-line">
      <MapContainer center={ukur} zoom={17} bounds={batas} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="" maxZoom={19} />

        {titik.akurasiM !== null && titik.akurasiM > 0 && (
          <Circle center={ukur} radius={titik.akurasiM} pathOptions={{ color: UKUR, weight: 1, fillOpacity: 0.08 }} />
        )}

        {gardu && (
          <>
            <Polyline positions={[gardu, ukur]} pathOptions={{ color: "#64748B", weight: 2, dashArray: "6 5" }} />
            <Marker position={gardu} icon={penanda(GARDU)}>
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span className="text-[10px] font-semibold">Gardu</span>
              </Tooltip>
            </Marker>
          </>
        )}

        {tiang && (
          <>
            <Polyline positions={[tiang, ukur]} pathOptions={{ color: TIANG, weight: 2, dashArray: "4 4" }} />
            <Marker position={tiang} icon={penanda(TIANG)}>
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span className="text-[10px] font-semibold">Ujung terjauh</span>
              </Tooltip>
            </Marker>
          </>
        )}

        <Marker position={ukur} icon={penanda(UKUR)}>
          <Tooltip permanent direction="top" offset={[0, -10]}>
            <span className="text-[10px] font-semibold">Titik ukur</span>
          </Tooltip>
        </Marker>
      </MapContainer>
    </div>
  );
}
