import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { KOLOM as KOLOM_RABAS, petaBaris as petaRabas, type BarisRabas } from "@/app/admin/wo-perabasan/_hooks/useDaftarPerabasan";
import { petaBaris as petaLuar, type BarisLuar } from "@/app/admin/wo-perabasan/_hooks/useLuarWoPerabasan";
import { petaBaris as petaHarjar, type BarisPemeliharaan } from "@/app/admin/pemeliharaan-jaringan/_hooks/usePemeliharaanJaringan";
import { tempelWo, type PemeliharaanMenunggu } from "@/app/admin/hargardu/_hooks/useHargarduApproval";
import { barisDariCatatan, petaCatatan, type BarisTabel } from "@/app/admin/optimasi-trafo/_hooks/useOptimasiTrafo";
import { KOLOM_PENGUKURAN, type PengukuranGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";
import type { PenyeimbanganGardu } from "@/app/admin/pengukuran-gardu/_hooks/usePenyeimbangan";
import { KOLOM as KOLOM_JTM, type BarisJtm, type InspeksiJtm } from "@/app/admin/jtm/_hooks/useDaftarJtm";
import type { InspeksiMenunggu } from "@/app/admin/jtr/_hooks/useApprovalJtr";

/**
 * Bahan Realisasi Bulanan (lampiran tagihan): pekerjaan DISETUJUI satu ULP
 * satu bulan dari `realisasi_rentang` (sumber yang sama dengan Realisasi
 * Harian & Copy to PRO NTB), lalu baris tiap modul dibaca BERDASARKAN id-nya
 * (`sumber`, `sumber_id` — scripts/realisasi-bulanan-lampiran.sql). Rincian
 * tidak menyaring ulang tanggal/status dengan aturannya sendiri, jadi isinya
 * = himpunan yang dihitung.
 */

export interface BarisRealisasi {
  tgl: string;
  kunci: string;
  bagian: string | null;
  ulp: string;
  objek: string;
  rincian: string | null;
  petugas: string | null;
  km: number | null;
  sumber: string;
  sumber_id: string;
}

export interface BahanLampiran {
  realisasi: BarisRealisasi[];
  perabasan: BarisRabas[];
  luar: BarisLuar[];
  harjtm: BarisPemeliharaan[];
  hargardu: PemeliharaanMenunggu[];
  penyeimbangan: PenyeimbanganGardu[];
  optimasi: BarisTabel[];
  pengukuran: PengukuranGardu[];
  jtm: BarisJtm[];
  jtr: InspeksiMenunggu[];
  /** Dicentang di web (wo_manual_item): JTM Tier 2 & Inspeksi Gardu Tier 1/2. */
  manual: BarisRealisasi[];
}

const POTONG = 150;
const dua = (n: number) => String(n).padStart(2, "0");

/** Baca baris `tabel` ber-id `ids`, dipecah per 150 (`in` masuk ke URL). */
async function perId<T>(tabel: string, kolom: string, ids: string[], kunciId = "id"): Promise<T[]> {
  const hasil: T[] = [];
  for (let i = 0; i < ids.length; i += POTONG) {
    const { data, error } = await supabaseBrowser.from(tabel).select(kolom).in(kunciId, ids.slice(i, i + POTONG));
    if (error) throw new Error(`${tabel}: ${error.message}`);
    hasil.push(...((data ?? []) as T[]));
  }
  return hasil;
}

/** Nama & tanggal WO asal inspeksi JTM/JTR (sambungan wo_item_id → view status item). */
async function woInspeksi(tabel: string, viewItem: string, ids: string[]) {
  const sambung = await perId<{ id: string; wo_item_id: string | null }>(tabel, "id,wo_item_id", ids).catch(() => []);
  const itemId = [...new Set(sambung.map((x) => x.wo_item_id).filter((x): x is string => !!x))];
  const item = await perId<{ id: string; wo_nama: string; tgl_wo: string }>(viewItem, "id,wo_nama,tgl_wo", itemId).catch(() => []);
  const perItem = new Map(item.map((x) => [x.id, x]));
  return new Map(sambung.flatMap((x) => (x.wo_item_id && perItem.has(x.wo_item_id) ? [[x.id, perItem.get(x.wo_item_id)!] as const] : [])));
}

export async function ambilLampiran(ulp: string, tahun: number, bulan: number): Promise<BahanLampiran> {
  const dari = `${tahun}-${dua(bulan)}-01`;
  const sampai = `${tahun}-${dua(bulan)}-${dua(new Date(tahun, bulan, 0).getDate())}`;
  const mentah = await fetchAllRows<Record<string, unknown>>(() =>
    supabaseBrowser
      .rpc("realisasi_rentang", { p_ulp: ulp, p_dari: dari, p_sampai: sampai })
      .eq("disetujui", true)
      .order("tgl")
      .order("sumber_id"),
  );
  if (mentah.length > 0 && !("sumber_id" in mentah[0])) {
    throw new Error("SQL realisasi-bulanan-lampiran.sql belum dijalankan di Supabase.");
  }
  const realisasi: BarisRealisasi[] = mentah.map((r) => ({
    tgl: String(r.tgl),
    kunci: String(r.kunci),
    bagian: (r.bagian as string | null) ?? null,
    ulp: String(r.ulp ?? ""),
    objek: String(r.objek ?? ""),
    rincian: (r.rincian as string | null) ?? null,
    petugas: (r.petugas as string | null) ?? null,
    km: r.km === null || r.km === undefined ? null : Number(r.km),
    sumber: String(r.sumber),
    sumber_id: String(r.sumber_id),
  }));

  const id = (sumber: string, kunci?: string) =>
    [...new Set(realisasi.filter((r) => r.sumber === sumber && (!kunci || r.kunci === kunci)).map((r) => r.sumber_id))];
  const kmPer = new Map(realisasi.map((r) => [`${r.sumber}|${r.sumber_id}`, r.km]));

  const idJtm = id("inspeksi_jtm");
  const idJtr = id("inspeksi_jtr");
  const [rabas, luar, harjtm, hargardu, seimbang, optimasi, ukur, jtm, jtr, woJtm, woJtr] = await Promise.all([
    perId<Record<string, unknown>>("wo_perabasan_item", KOLOM_RABAS, id("wo_perabasan_item")),
    perId<Record<string, unknown>>("perabasan_luar_wo", "*", id("perabasan_luar_wo")),
    perId<Record<string, unknown>>("pemeliharaan_jaringan_daftar", "*", id("pemeliharaan_jaringan")),
    perId<PemeliharaanMenunggu>("pemeliharaan_gardu_ringkas", "*", id("pemeliharaan_gardu")).then(tempelWo),
    perId<PenyeimbanganGardu>(
      "penyeimbangan_gardu",
      "*, pengukuran_after:pengukuran_gardu!hasil_penyeimbangan_id(id,amg_queued_at,amg_sent_at,amg_error,amg_attempts)",
      id("penyeimbangan_gardu"),
    ),
    perId<Record<string, unknown>>("optimasi_trafo_daftar", "*", id("optimasi_trafo")),
    perId<PengukuranGardu>("pengukuran_gardu", KOLOM_PENGUKURAN, id("pengukuran_gardu")),
    perId<InspeksiJtm>("inspeksi_jtm_ringkas", KOLOM_JTM, idJtm),
    perId<InspeksiMenunggu>("jtr_inspeksi", "*", idJtr),
    woInspeksi("inspeksi_jtm", "wo_inspeksi_item_status", idJtm),
    woInspeksi("inspeksi_jtr", "wo_inspeksi_item_status_jtr", idJtr),
  ]);

  const tglTeks = (v: string | null | undefined) => v ?? "";
  return {
    realisasi,
    perabasan: rabas.map(petaRabas).sort((a, b) => a.penyulang.localeCompare(b.penyulang) || a.urutan - b.urutan),
    luar: luar.map(petaLuar).sort((a, b) => a.tgl.localeCompare(b.tgl)),
    harjtm: harjtm.map(petaHarjar).sort((a, b) => a.tgl.localeCompare(b.tgl)),
    hargardu: hargardu.sort((a, b) => tglTeks(a.tgl_acuan).localeCompare(tglTeks(b.tgl_acuan))),
    penyeimbangan: seimbang.sort((a, b) => String(a.tgl_penyeimbangan ?? "").localeCompare(String(b.tgl_penyeimbangan ?? ""))),
    optimasi: optimasi.map((r) => barisDariCatatan(petaCatatan(r))).sort((a, b) =>
      (a.catatan?.tglOperasi ?? "").localeCompare(b.catatan?.tglOperasi ?? "")),
    pengukuran: ukur.sort((a, b) => String(a.tanggal_pengukuran ?? "").localeCompare(String(b.tanggal_pengukuran ?? ""))),
    // KMS = angka yang ditagih (segmen_panjang.panjang_pakai_km di realisasi), bukan panjang tampilan daftar.
    jtm: jtm
      .map((d) => ({
        ...d,
        panjang_km: kmPer.get(`inspeksi_jtm|${d.id}`) ?? 0,
        wo_nama: woJtm.get(d.id)?.wo_nama ?? null,
        tgl_wo: woJtm.get(d.id)?.tgl_wo ?? null,
        kembar: 0,
      }))
      .sort((a, b) => a.penyulang.localeCompare(b.penyulang) || (a.segmen_nama ?? "").localeCompare(b.segmen_nama ?? "")),
    jtr: jtr
      .map((d) => ({
        ...d,
        panjang_km: kmPer.get(`inspeksi_jtr|${d.id}`) ?? 0,
        wo_nama: woJtr.get(d.id)?.wo_nama ?? null,
        tgl_wo: woJtr.get(d.id)?.tgl_wo ?? null,
      }))
      .sort((a, b) => (a.penyulang ?? "").localeCompare(b.penyulang ?? "") || a.gardu_kode.localeCompare(b.gardu_kode, "id", { numeric: true })),
    manual: realisasi.filter((r) => r.sumber === "wo_manual_item"),
  };
}
