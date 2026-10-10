"use client";

import { CircleMarker } from "react-leaflet";
import type { SorotKoreksi } from "../_hooks/useKoreksiIsian";

/** Lingkaran koreksi isian: ujung rentang (hijau), tiang janggal (oranye). */
const WARNA: Record<SorotKoreksi["jenis"], string> = { ujung: "#5eead4", janggal: "#F97316" };

export default function LapisanKoreksi({ sorot }: { sorot: SorotKoreksi[] }) {
  return (
    <>
      {sorot.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lng]}
          radius={s.jenis === "ujung" ? 13 : 11}
          interactive={false}
          pathOptions={{ color: WARNA[s.jenis], weight: 3, fillColor: WARNA[s.jenis], fillOpacity: 0.12 }}
        />
      ))}
    </>
  );
}
