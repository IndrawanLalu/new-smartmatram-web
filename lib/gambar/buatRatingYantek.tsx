import { ImageResponse } from "next/og";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ambilRentang } from "@/lib/yantekStore";
import { buildStats, extractPrefix, POSKO_MAP, toDateStr, type YantekRow } from "@/app/admin/yantek/_lib/yantek";
import { muatAset } from "./aset";
import { G_LEBAR, G_TINGGI } from "./gaya";
import { siapkanIkon } from "./ikon";
import { BARIS_PER_HALAMAN, RekapRating, type PetugasRating } from "./RekapRating";
import { GagalLaporan } from "./laporan";

/**
 * PNG Rekap Rating Yantek satu ULP, satu bulan. Barisnya SAMA dengan tab Rekap
 * di Analisis Yantek: bulan dari `waktu_lapor`, ULP dari prefix
 * `personil_yantek`, hitungan `buildStats`. Yang berbeda hanya urutannya —
 * ★5 terbanyak dulu, mengikuti patokan gambar (Promt.md).
 */

export async function buatGambarRatingYantek(ulp: string, tahun: number, bulan: number, halaman: number) {
  const periode = `${tahun}-${String(bulan).padStart(2, "0")}`;
  const kode = POSKO_MAP.find((p) => p.ulp === ulp)?.kode;
  if (!kode) throw new GagalLaporan(`ULP tidak dikenal: ${ulp}`);

  const [isi, aset] = await Promise.all([
    ambilRentang(supabaseAdmin, `${periode}-01`, `${periode}-31`),
    muatAset(),
  ]);
  const rows = isi
    .flatMap((x) => x.rows as YantekRow[])
    .filter((r) => r.waktu_lapor && toDateStr(r.waktu_lapor).startsWith(periode) && extractPrefix(r.personil_yantek ?? "") === kode);
  if (!rows.length) throw new GagalLaporan(`Belum ada data yantek ULP ${ulp} untuk ${periode}.`);

  const petugas: PetugasRating[] = buildStats(rows)
    .map((s) => ({ nama: s.petugas, totalWO: s.totalWO, r: s.r }))
    .sort((a, b) => b.r[5] - a.r[5] || b.totalWO - a.totalWO || a.nama.localeCompare(b.nama));

  const jumlahHalaman = Math.ceil(petugas.length / BARIS_PER_HALAMAN);
  if (halaman > jumlahHalaman) throw new GagalLaporan(`Halaman ${halaman} tidak ada — hanya ${jumlahHalaman}.`);

  const tanggal = rows.map((r) => toDateStr(r.waktu_lapor!)).sort();
  const el = (
    <RekapRating
      gambar={aset.gambar}
      ulp={ulp}
      dari={tanggal[0]}
      sampai={tanggal.at(-1)!}
      petugas={petugas}
      halaman={halaman}
      jumlahHalaman={jumlahHalaman}
    />
  );
  await siapkanIkon(el);
  return { gambar: new ImageResponse(el, { width: G_LEBAR, height: G_TINGGI, fonts: aset.fonts }), jumlahHalaman };
}
