"use client";

import { CircleMarker, Tooltip } from "react-leaflet";
import type { TiangPeta } from "../_hooks/usePetaIsi";

/**
 * Nama tiang tertulis tetap di sebelah tiangnya — untuk membaca jaringan tanpa
 * mengarahkan kursor satu per satu.
 *
 * Label adalah elemen DOM, bukan gambar kanvas, jadi jumlahnya dibatasi: di
 * atas BATAS_NAMA label peta mulai tersendat, dan nama yang bertumpuk juga
 * tak terbaca. Lebih dari itu → minta perbesar dulu (lihat bilah keadaan).
 */
export const BATAS_NAMA = 400;

export default function LapisanNama({ tiang, aktif }: { tiang: TiangPeta[]; aktif: boolean }) {
  if (!aktif || tiang.length > BATAS_NAMA) return null;
  // Satu batang di dua kelompok (underbuild/pinjaman) = satu label berisi
  // kedua namanya, bukan dua label yang saling menimpa.
  const perBatang = new Map<string, TiangPeta & { nama: string[] }>();
  for (const t of tiang) {
    const ada = perBatang.get(t.id);
    if (!ada) perBatang.set(t.id, { ...t, nama: [t.kode] });
    else if (!ada.nama.includes(t.kode)) ada.nama.push(t.kode);
  }
  return (
    <>
      {[...perBatang.values()].map((t) => (
        <CircleMarker
          key={`nama-${t.id}`}
          center={[t.lat, t.lng]}
          radius={0}
          interactive={false}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
        >
          <Tooltip
            permanent
            direction="right"
            offset={[6, 0]}
            className="!bg-[#0b1220]/80 !text-[#e2e8f0] !border-0 !shadow-none !rounded !px-1 !py-0 !text-[10px] !font-semibold before:!hidden"
          >
            {t.nama.join(" / ")}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
