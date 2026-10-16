"use client";

import type { TiangPeta } from "../_hooks/usePetaIsi";
import { titikTengahPortal } from "@/lib/penandaJtm";
import LabelTetap, { type NadaLabel } from "./LabelTetap";

/**
 * Label tetap di sebelah tiang: NAMA tiang dan/atau NOMOR KABEL JTR-nya.
 *
 * Nomor kabel dihitung per gardu (JTM & JTR gardu lain tidak dihitung), jadi
 * satu kabel bernomor selain 1 hampir selalu salah catat — labelnya merah,
 * supaya terlihat tanpa membuka tiang satu per satu.
 *
 * Kode gardu (AM013) ikut tombol Nama tiang, ditulis di samping SIMBOL
 * gardunya — untuk gardu portal itu di tengah kedua tiang, bukan di tiangnya.
 * Nama peralatan (SAMPOERNA) di tiang LBS/recloser/FCO ditulis dengan cara
 * yang sama.
 *
 * Tiang PANGKAL JTM selalu berlabel "Pangkal <penyulang>" — juga saat Nama
 * tiang mati: jumlahnya sedikit, dan pangkal yang salah tempat (atau lebih
 * dari satu) langsung terlihat.
 *
 * Label adalah elemen DOM, bukan gambar kanvas, jadi jumlahnya dibatasi: di
 * atas BATAS_NAMA label peta mulai tersendat, dan label yang bertumpuk juga
 * tak terbaca. Lebih dari itu → minta perbesar dulu (lihat bilah keadaan).
 */
export const BATAS_NAMA = 400;

/** "3" sendirian = curiga; "1,2" = underbuild JTR; "1" = biasa. */
const nadaNomor = (n: string): NadaLabel => (n.includes(",") ? "ub" : n === "1" ? "biasa" : "curiga");

export default function LapisanNama({
  tiang,
  nama,
  nomor,
}: {
  tiang: TiangPeta[];
  nama: boolean;
  nomor: boolean;
}) {
  const pangkal = tiang.filter((t) => t.jaringan === "jtm" && t.pangkal);
  const labelPangkal = pangkal.map((t) => (
    <LabelTetap key={`pangkal-${t.id}-${t.kelompok}`} posisi={[t.lat, t.lng]} teks={`Pangkal ${t.kelompok}`} nada="pangkal" arah="left" geser={[-8, -12]} />
  ));
  if ((!nama && !nomor) || tiang.length > BATAS_NAMA) return <>{labelPangkal}</>;
  // Satu batang di dua kelompok (underbuild/pinjaman) = satu label berisi
  // keduanya, bukan dua label yang saling menimpa.
  const perBatang = new Map<string, { t: TiangPeta; bagian: string[]; nada: NadaLabel }>();
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
  const alat = nama
    ? [...new Map(tiang.filter((t) => t.penanda && t.penanda !== "gardu" && t.namaPeralatan).map((t) => [t.id, t])).values()]
    : [];
  return (
    <>
      {labelPangkal}
      {gardu.map((t) => (
        <LabelTetap key={`gardu-${t.id}`} posisi={portal.get(t.id) ?? [t.lat, t.lng]} teks={t.garduDiTiang ?? ""} nada="gardu" arah="left" geser={[-8, 0]} />
      ))}
      {alat.map((t) => (
        <LabelTetap key={`alat-${t.id}`} posisi={[t.lat, t.lng]} teks={t.namaPeralatan ?? ""} nada="alat" arah="left" geser={[-8, 0]} />
      ))}
      {[...perBatang.values()].map(({ t, bagian, nada }) => (
        <LabelTetap key={`nama-${t.id}-${nada}`} posisi={[t.lat, t.lng]} teks={bagian.join(" / ")} nada={nada} />
      ))}
    </>
  );
}
