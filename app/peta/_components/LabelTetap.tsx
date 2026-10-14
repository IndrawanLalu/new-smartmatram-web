"use client";

import { CircleMarker, Tooltip } from "react-leaflet";

/**
 * Label kecil yang tertulis tetap di samping satu titik peta: pita satu baris
 * tanpa kotak tooltip & tanpa panah, supaya tidak menutupi ikon di dekatnya.
 * Dipakai Nama tiang (mode biasa) dan Label (Mode SLD).
 *
 * Penambatnya CircleMarker tak terlihat ber-radius 0 — satu penanda Leaflet
 * hanya bisa membawa satu tooltip, dan tooltip ikon sudah dipakai rinciannya.
 */

const DASAR = "!border-0 !shadow-none !rounded !px-1 !py-0 !text-[10px] !font-semibold before:!hidden";
export const NADA_LABEL = {
  biasa: "!bg-[#0b1220]/80 !text-[#e2e8f0]",
  ub: "!bg-[#A855F7] !text-white",
  curiga: "!bg-red-600 !text-white",
  gardu: "!bg-[#1D3573] !text-white",
  alat: "!bg-[#B3701A] !text-white",
  pangkal: "!bg-[#0F172A] !text-white",
} as const;

export type NadaLabel = keyof typeof NADA_LABEL;

interface Props {
  posisi: [number, number];
  teks: string;
  nada: NadaLabel;
  arah?: "left" | "right";
  /** Geseran label dari titiknya, piksel [x, y]. */
  geser?: [number, number];
}

export default function LabelTetap({ posisi, teks, nada, arah = "right", geser = [6, 0] }: Props) {
  return (
    <CircleMarker center={posisi} radius={0} interactive={false} pathOptions={{ opacity: 0, fillOpacity: 0 }}>
      <Tooltip permanent direction={arah} offset={geser} className={`${DASAR} ${NADA_LABEL[nada]}`}>
        {teks}
      </Tooltip>
    </CircleMarker>
  );
}
