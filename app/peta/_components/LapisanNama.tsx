"use client";

import { CircleMarker, Tooltip } from "react-leaflet";
import type { TiangPeta } from "../_hooks/usePetaIsi";
import { titikTengahPortal } from "@/lib/penandaJtm";

/**
 * Label tetap di sebelah tiang: NAMA tiang dan/atau NOMOR KABEL JTR-nya.
 *
 * Nomor kabel dihitung per gardu (JTM & JTR gardu lain tidak dihitung), jadi
 * satu kabel bernomor selain 1 hampir selalu salah catat — labelnya merah,
 * supaya terlihat tanpa membuka tiang satu per satu.
 *
 * Kode gardu (AM013) ikut tombol Nama tiang, ditulis di samping SIMBOL
 * gardunya — untuk gardu portal itu di tengah kedua tiang, bukan di tiangnya.
 *
 * Label adalah elemen DOM, bukan gambar kanvas, jadi jumlahnya dibatasi: di
 * atas BATAS_NAMA label peta mulai tersendat, dan label yang bertumpuk juga
 * tak terbaca. Lebih dari itu → minta perbesar dulu (lihat bilah keadaan).
 */
export const BATAS_NAMA = 400;

const DASAR = "!border-0 !shadow-none !rounded !px-1 !py-0 !text-[10px] !font-semibold before:!hidden";
const NADA = {
  biasa: "!bg-[#0b1220]/80 !text-[#e2e8f0]",
  ub: "!bg-[#A855F7] !text-white",
  curiga: "!bg-red-600 !text-white",
  gardu: "!bg-[#1D3573] !text-white",
};

/** "3" sendirian = curiga; "1,2" = underbuild JTR; "1" = biasa. */
const nadaNomor = (n: string) => (n.includes(",") ? "ub" : n === "1" ? "biasa" : "curiga");

export default function LapisanNama({
  tiang,
  nama,
  nomor,
}: {
  tiang: TiangPeta[];
  nama: boolean;
  nomor: boolean;
}) {
  if ((!nama && !nomor) || tiang.length > BATAS_NAMA) return null;
  // Satu batang di dua kelompok (underbuild/pinjaman) = satu label berisi
  // keduanya, bukan dua label yang saling menimpa.
  const perBatang = new Map<string, { t: TiangPeta; bagian: string[]; nada: keyof typeof NADA }>();
  for (const t of tiang) {
    const nomorIni = nomor && t.jaringan === "jtr" && t.nomorKabel ? t.nomorKabel : null;
    const teks = [nama ? t.kode : null, nomorIni ? `kabel ${nomorIni.replace(/,/g, "·")}` : null]
      .filter(Boolean)
      .join(" · ");
    if (!teks) continue;
    const nadaIni = nomorIni ? nadaNomor(nomorIni) : "biasa";
    const ada = perBatang.get(t.id);
    if (!ada) perBatang.set(t.id, { t, bagian: [teks], nada: nadaIni });
    else {
      if (!ada.bagian.includes(teks)) ada.bagian.push(teks);
      if (nadaIni === "curiga" || (nadaIni === "ub" && ada.nada === "biasa")) ada.nada = nadaIni;
    }
  }
  const portal = titikTengahPortal(tiang);
  const gardu = nama
    ? [...new Map(tiang.filter((t) => t.penanda === "gardu" && t.garduDiTiang).map((t) => [t.id, t])).values()]
    : [];
  return (
    <>
      {gardu.map((t) => (
        <CircleMarker
          key={`gardu-${t.id}`}
          center={portal.get(t.id) ?? [t.lat, t.lng]}
          radius={0}
          interactive={false}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
        >
          <Tooltip permanent direction="left" offset={[-8, 0]} className={`${DASAR} ${NADA.gardu}`}>
            {t.garduDiTiang}
          </Tooltip>
        </CircleMarker>
      ))}
      {[...perBatang.values()].map(({ t, bagian, nada }) => (
        <CircleMarker
          key={`nama-${t.id}-${nada}`}
          center={[t.lat, t.lng]}
          radius={0}
          interactive={false}
          pathOptions={{ opacity: 0, fillOpacity: 0 }}
        >
          <Tooltip permanent direction="right" offset={[6, 0]} className={`${DASAR} ${NADA[nada]}`}>
            {bagian.join(" / ")}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
