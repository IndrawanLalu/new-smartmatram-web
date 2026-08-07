"use client";

/**
 * Agregasi tunggal untuk /admin/dashboard — satu hook untuk seluruh domain
 * pekerjaan: gangguan, inspeksi jaringan & pohon, work order, pengukuran gardu,
 * pemerataan beban, risiko ML, dan produktivitas petugas.
 *
 * Kenapa tidak memakai hook halaman yang sudah ada (useInspeksiJaringan,
 * usePengukuranGardu, dst)? Hook-hook itu dibuat untuk halaman kerjanya:
 * menarik seluruh kolom, memasang langganan realtime Supabase, membawa state
 * paginasi dan fungsi mutasi. Dipakai enam sekaligus di satu halaman itu jadi
 * belasan langganan realtime dan payload berlipat untuk data yang cuma
 * dijadikan angka.
 *
 * Pola yang dipegang:
 *  - Satu tarikan untuk jendela 24 bulan, semua periode DITURUNKAN di useMemo.
 *    Ganti periode tidak memicu fetch ulang.
 *  - `fetchAllRows` wajib: `inspeksi` (1.982), `inspeksi_pohon` (3.285) dan
 *    `gardu_latest_state` (984) semuanya di sekitar/di atas batas 1.000 baris
 *    PostgREST — tanpa paginasi angkanya salah diam-diam.
 *  - Angka yang tidak butuh baris pakai `count: "exact", head: true`.
 *  - Kolom seminimal mungkin, tidak ada `select("*")`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { fetchSheetData } from "@/lib/sheets";
import { parseIndonesianDate } from "@/lib/gangguanAnalytics";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import { buildWoStats, type WoStats } from "@/app/admin/work-order/_lib/woStats";
import { useFeederRisk } from "@/app/admin/command-center/_hooks/useFeederRisk";
// Ambang "pengukuran sudah basi" diimpor, tidak disalin: kalau ULP mengubah
// kebijakannya, dashboard dan halaman pengukuran-gardu harus ikut bersama.
import { AMBANG_BASI, pengukuranBasi } from "@/app/admin/pengukuran-gardu/_hooks/useGarduStatus";
// Ambang overload dinilai pada angka yang TAMPIL — lihat catatannya di sana.
import { bebanTampil, isOverload } from "@/app/admin/pengukuran-gardu/_hooks/usePengukuranGardu";

// ── Ambang ───────────────────────────────────────────────────────────────────
// Sengaja tetap, bukan dari `anomali_settings`: ambang di tabel itu default-nya
// NULL (= kriteria nonaktif), jadi ULP yang belum pernah menyetelnya akan
// tampil "0 anomali" — menyesatkan di halaman ringkasan. Angka ini sama dengan
// yang dipakai Morning Brief (lib/morningBrief.ts) supaya dua ringkasan yang
// dibaca manajemen tidak berbeda. Penyetelan per-ULP tetap di /pengukuran-gardu.
const OVERLOAD_PCT = 80;
const HIGH_TEMP_C = 60;

const BULAN_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

// ── Periode ──────────────────────────────────────────────────────────────────

export type PeriodKey = "bulan" | "3bulan" | "tahun";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "bulan", label: "Bulan Ini" },
  { key: "3bulan", label: "3 Bulan" },
  { key: "tahun", label: "Tahun Ini" },
];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface Window {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  prevLabel: string;
}

/** Jendela periode berjalan + jendela pembanding sepanjang yang sama. */
function buildWindow(period: PeriodKey, now: Date): Window {
  const y = now.getFullYear();
  const m = now.getMonth();

  if (period === "bulan") {
    return {
      start: iso(new Date(y, m, 1)),
      end: iso(now),
      prevStart: iso(new Date(y, m - 1, 1)),
      prevEnd: iso(new Date(y, m - 1, now.getDate())),
      prevLabel: "bulan lalu",
    };
  }
  if (period === "3bulan") {
    return {
      start: iso(new Date(y, m - 2, 1)),
      end: iso(now),
      prevStart: iso(new Date(y, m - 5, 1)),
      prevEnd: iso(new Date(y, m - 3, 0)),
      prevLabel: "3 bulan sebelumnya",
    };
  }
  return {
    start: iso(new Date(y, 0, 1)),
    end: iso(now),
    prevStart: iso(new Date(y - 1, 0, 1)),
    prevEnd: iso(new Date(y - 1, m, now.getDate())),
    prevLabel: "tahun lalu",
  };
}

const inWindow = (d: string | null, from: string, to: string) =>
  !!d && d.slice(0, 10) >= from && d.slice(0, 10) <= to;

/** Tanggal batas `n` bulan ke belakang, YYYY-MM-DD. */
function batasBulanLalu(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return iso(d);
}

/** Tambah hari pada tanggal ISO tanpa melewati objek Date bermuatan zona waktu —
 *  `new Date("2026-08-04")` diurai sebagai UTC sementara pembacaan baliknya
 *  memakai jam lokal, jadi selisih zona bisa menggeser tanggal sehari. */
function addDaysIso(dateIso: string, days: number): string {
  const [y, m, d] = dateIso.slice(0, 10).split("-").map(Number);
  return iso(new Date(y, m - 1, d + days));
}

/** Tanggal yang sama setahun sebelumnya. Untuk ember MINGGUAN dipakai −364 hari
 *  (52 minggu genap) supaya harinya tetap sejajar; −365 menggeser satu hari dan
 *  membuat perbandingan minggu-ke-minggu meleset. */
const setahunLalu = (dateIso: string, mingguan: boolean) =>
  mingguan
    ? addDaysIso(dateIso, -364)
    : `${Number(dateIso.slice(0, 4)) - 1}${dateIso.slice(4)}`;

// ── Bentuk data ──────────────────────────────────────────────────────────────

export interface Kpi {
  value: number;
  prev: number;
  /** null bila pembanding 0 — persentase dari nol tidak punya arti. */
  deltaPct: number | null;
}

/** Titik tren 12 bulan — dipakai sparkline pada KpiStrip, bukan grafik utama. */
export interface MonthPoint {
  key: string;
  label: string;
  gangguan: number;
  inspeksi: number;
  gardu: number;
}

/** Satu ember pada grafik gangguan. Kerapatannya mengikuti periode terpilih:
 *  harian (Bulan Ini) · mingguan (3 Bulan) · bulanan (Tahun Ini). */
export interface ChartPoint {
  key: string;
  label: string;
  gangguan: number;
  /** Rentang yang sama setahun sebelumnya — garis pembanding. */
  gangguanLalu: number;
  /** Sudah lewat? Ember masa depan tetap digambar (bentuk musiman tahun lalu
   *  tetap terlihat), tapi tidak boleh ikut dihitung saat membandingkan total. */
  lewat: boolean;
  /** Ember yang sedang berjalan — belum genap, ditandai arsir lebih rapat. */
  berjalan: boolean;
}

export interface AgendaItem {
  id: string;
  label: string;
  detail: string;
  tone: "kritis" | "waspada";
  href: string;
}

export interface DomainInspeksi {
  jaringanBaru: number;
  pohonBaru: number;
  terbuka: number;
  selesai: number;
  byStatus: { status: string; jumlah: number }[];
  risikoSangatTinggi: number;
}

/**
 * Gardu — angkanya ada DUA jenis dan sengaja dipisah.
 *
 * `kondisi*` menjawab "bagaimana keadaan armada sekarang", diambil dari
 * pengukuran ATAU pemeliharaan TERAKHIR tiap gardu, sama seperti tab Data Gardu
 * di /admin/pengukuran-gardu. Angka-angka itu TIDAK ikut periode terpilih:
 * gardu yang terakhir diukur bulan Juni tetap overload hari ini, dan bulan
 * berjalan baru memuat 18 pengukuran dari 2.526 gardu — menyaringnya dengan
 * periode akan menyembunyikan hampir seluruh armada.
 *
 * `aktivitas*` menjawab "apa yang dikerjakan pada periode ini" dan memang ikut
 * periode. Sebelumnya keduanya bercampur di bawah satu chip periode, sehingga
 * kartu overload memajang 12 gardu yang tersebar Juni–Agustus di bawah label
 * "Bulan Ini".
 */
export interface DomainGardu {
  // ── Kondisi armada (lepas dari periode) ──
  totalMaster: number;
  terukur: number;
  belumDiukur: number;
  perluUkurUlang: number;
  overload: number;
  /** Bagian dari `overload` yang kondisinya berasal dari pemeliharaan, bukan
   *  pengukuran rutin — halaman pengukuran-gardu membedakannya dengan lencana. */
  overloadDariPemeliharaan: number;
  /** Bagian dari `overload` yang diukur di dalam periode terpilih. */
  overloadDiPeriode: number;
  suhuTinggi: number;
  avgBeban: number;
  sebaran: { rentang: string; jumlah: number }[];
  /** Persentase beban tiap gardu terukur — bahan donat distribusi. */
  bebanValues: number[];
  overloadTeratas: {
    kode: string; ulp: string; persen: number;
    tanggal: string | null; dariPemeliharaan: boolean;
  }[];

  // ── Aktivitas (ikut periode) ──
  diukur: number;
  /** Baris pengukuran pada periode. Berbeda dari `diukur` begitu ada gardu yang
   *  diukur lebih dari sekali. */
  barisPengukuran: number;
}

/** Gangguan penyulang versi APKT (`padam_apkt`) — membawa dampak pelanggan yang
 *  tidak ada di Sheet gangguan. */
export interface DomainPadam {
  total: number;
  pelangganPadam: number;
  ens: number;
  durasiRataRata: number;
  topPenyebab: { nama: string; jumlah: number }[];
}

/**
 * Gangguan pelanggan — bersumber dari data **Analisis Yantek**, bukan tabel
 * `apkt_gangguan`.
 *
 * Alasannya tiga, semuanya terbukti dari datanya sendiri:
 *  - Yantek terisi sampai 4 Agustus, `apkt_gangguan` berhenti 28 Juli — dengan
 *    sumber lama, seksi ini kosong pada periode bawaan "Bulan Ini".
 *  - Yantek membawa `personil_yantek` (120 nama petugas asli), sedangkan
 *    `diselesaikan_oleh` di `apkt_gangguan` hanya berisi nama kanal.
 *  - Yantek juga membawa rating pelanggan.
 *
 * Angkanya MEDIAN, bukan rata-rata, mengikuti halaman Analisis Yantek: durasi
 * yantek berekor panjang (response bisa 219 menit dengan median 32), jadi
 * rata-rata sendirian memberi kesan yang salah.
 */
export interface DomainApkt {
  total: number;
  rptMedian: number | null;
  rctMedian: number | null;
  lewatResponse: number;
  lewatRecovery: number;
  targetResponse: number | null;
  targetRecovery: number | null;
  pelangganPadam: number;
  ratingRataRata: number | null;
  jumlahRating: number;
  /** Tanggal data terakhir yang tersimpan — datanya diunggah manual, jadi
   *  umurnya harus terlihat, bukan dibiarkan terbaca sebagai nihil gangguan. */
  terakhirData: string | null;
  harian: { key: string; label: string; jumlah: number; rpt: number | null; rct: number | null }[];
  topPetugas: { nama: string; jumlah: number; lewat: number }[];
}

export interface DomainPemerataan {
  selesai: number;
  perbaikanRataRata: number;
  terbaik: { no_gardu: string; before: number; after: number } | null;
}

export interface DomainGangguan {
  total: number;
  topPenyulang: { nama: string; jumlah: number }[];
}

export interface DomainProduktivitas {
  petugasAktif: number;
  totalPetugas: number;
  top: { nama: string; jumlah: number }[];
}

// ── Baris mentah ─────────────────────────────────────────────────────────────

interface InspeksiRow { tgl_inspeksi: string | null; tgl_eksekusi: string | null; status: string; ulp: string | null; nama_inspektor: string | null }
/** Baris pohon dalam jendela hanya dipakai untuk tren & hitungan periode —
 *  kolom risiko/prediksi cukup ditarik pada kueri "terbuka" di bawah. */
type PohonRow = InspeksiRow;
interface PengukuranRow {
  no_gardu: string;
  tanggal_pengukuran: string | null;
  petugas_unit: string | null;
  petugas_nama: string | null;
  /** Terisi = baris pembawa hasil pemerataan, bukan pengukuran rutin. Halaman
   *  /admin/pengukuran-gardu mengecualikannya dari rekap; dashboard harus sama. */
  hasil_penyeimbangan_id: string | null;
}
interface PenyeimbanganRow { no_gardu: string; tgl_penyeimbangan: string | null; ulp: string | null; status: string; beban_pct_before: number; beban_pct_after: number }
/** Baris `gardu_master_state`: master sebagai penentu baris, kondisi menyusul
 *  dari pengukuran/pemeliharaan terakhir (boleh NULL). */
interface GarduMasterRow {
  kode: string;
  ulp: string;
  persen_beban: number | null;
  suhu_trafo: number | null;
  event_type: "pengukuran" | "penyeimbangan" | null;
  event_date: string | null;
  belum_diukur: boolean;
}
interface PadamRow {
  ulp: string | null; tgl_padam: string | null; penyebab_padam: string | null;
  jml_pelanggan_padam: number | null; lama_padam_jam: number | null; ens: number | null;
}
interface SlaRow { ulp: string; target_response_menit: number | null; target_recovery_menit: number | null }
interface WoItemRow { batch_id: string; regu: string | null; status: string; verified_at: string | null; approved_at: string | null; sla_ok: boolean | null }
interface WoBatchRow { id: string; bulan: number; tahun: number; ulp: string | null }
interface GangguanRow { TANGGAL?: string; ULP?: string; PENYULANG?: string }

/** Baris terbuka ditarik TANPA batas tanggal — lihat catatan di `load()`. */
interface TerbukaRow { status: string }
interface PohonTerbukaRow extends TerbukaRow {
  tgl_inspeksi: string | null;
  prediksi_inspektur: string | null;
  tingkat_risiko: string | null;
}

interface RawBundle {
  inspeksi: InspeksiRow[];
  pohon: PohonRow[];
  inspeksiTerbuka: TerbukaRow[];
  pohonTerbuka: PohonTerbukaRow[];
  pengukuran: PengukuranRow[];
  penyeimbangan: PenyeimbanganRow[];
  garduMaster: GarduMasterRow[];
  woItems: WoItemRow[];
  woBatches: WoBatchRow[];
  gangguan: GangguanRow[];
  padam: PadamRow[];
  sla: SlaRow[];
  totalPetugas: number;
}

const APKT_KOSONG: DomainApkt = {
  total: 0, rptMedian: null, rctMedian: null, lewatResponse: 0, lewatRecovery: 0,
  targetResponse: null, targetRecovery: null, pelangganPadam: 0,
  ratingRataRata: null, jumlahRating: 0, terakhirData: null, harian: [], topPetugas: [],
};

const EMPTY: RawBundle = {
  inspeksi: [], pohon: [], inspeksiTerbuka: [], pohonTerbuka: [],
  pengukuran: [], penyeimbangan: [],
  garduMaster: [], woItems: [], woBatches: [], gangguan: [],
  padam: [], sla: [], totalPetugas: 0,
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboardOverview(user: CurrentUser, period: PeriodKey, ulpFilter: string) {
  const [raw, setRaw] = useState<RawBundle>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** ULP efektif: UP3 memilih lewat dropdown, role lain terkunci ke unitnya. */
  const unit = canSeeAllUnits(user.role) ? ulpFilter : (user.unit ?? "");

  const { riskData, dateTgl: riskTgl, loading: riskLoading } = useFeederRisk(user);

  // Jendela tarikan: 1 Januari tahun lalu — cukup untuk tren 12 bulan sekaligus
  // pembanding "tahun lalu" pada periode Tahun Ini.
  const fetchFrom = useMemo(() => `${new Date().getFullYear() - 1}-01-01`, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Filter unit ditulis berulang alih-alih lewat helper generik: pembungkus
      // generik di atas query-builder Supabase memicu TS2589 (instansiasi tipe
      // terlalu dalam) begitu rantainya panjang.
      const [
        inspeksi, pohon, inspeksiTerbuka, pohonTerbuka,
        pengukuran, penyeimbangan, garduMaster, woBatches, gangguanSheet, petugasCount,
        padam, sla,
      ] = await Promise.all([
        fetchAllRows<InspeksiRow>(() => {
          const q = supabaseBrowser
            .from("inspeksi")
            .select("tgl_inspeksi,tgl_eksekusi,status,ulp,nama_inspektor")
            .gte("tgl_inspeksi", fetchFrom);
          return (unit ? q.eq("ulp", unit) : q).order("id");
        }),
        fetchAllRows<PohonRow>(() => {
          const q = supabaseBrowser
            .from("inspeksi_pohon")
            .select("tgl_inspeksi,tgl_eksekusi,status,ulp,nama_inspektor")
            .gte("tgl_inspeksi", fetchFrom);
          return (unit ? q.eq("ulp", unit) : q).order("id");
        }),
        // Pekerjaan yang MASIH TERBUKA ditarik tanpa batas tanggal. Temuan 2024
        // yang belum ditutup tetap tunggakan hari ini; kalau ikut disaring
        // jendela 24 bulan, angkanya menyusut diam-diam seiring waktu. Payload-nya
        // kecil karena kolomnya sedikit dan barisnya hanya yang belum selesai.
        fetchAllRows<TerbukaRow>(() => {
          const q = supabaseBrowser.from("inspeksi").select("status").neq("status", "Selesai");
          return (unit ? q.eq("ulp", unit) : q).order("id");
        }),
        fetchAllRows<PohonTerbukaRow>(() => {
          const q = supabaseBrowser
            .from("inspeksi_pohon")
            .select("status,tgl_inspeksi,prediksi_inspektur,tingkat_risiko")
            .neq("status", "Selesai");
          return (unit ? q.eq("ulp", unit) : q).order("id");
        }),
        fetchAllRows<PengukuranRow>(() => {
          const q = supabaseBrowser
            .from("pengukuran_gardu")
            .select("no_gardu,tanggal_pengukuran,petugas_unit,petugas_nama,hasil_penyeimbangan_id")
            .gte("tanggal_pengukuran", fetchFrom);
          return (unit ? q.eq("petugas_unit", unit) : q).order("id");
        }),
        fetchAllRows<PenyeimbanganRow>(() => {
          const q = supabaseBrowser
            .from("penyeimbangan_gardu")
            .select("no_gardu,tgl_penyeimbangan,ulp,status,beban_pct_before,beban_pct_after")
            .gte("tgl_penyeimbangan", fetchFrom);
          return (unit ? q.eq("ulp", unit) : q).order("id");
        }),
        // Master sebagai penentu baris, bukan `gardu_latest_state`. Bedanya
        // menentukan: dengan baris dari pengukuran, 1.546 gardu yang belum
        // pernah diukur tidak punya baris sama sekali, sehingga 985 gardu
        // terbaca seolah itulah seluruh armada — padahal masternya 2.526.
        fetchAllRows<GarduMasterRow>(() => {
          const q = supabaseBrowser
            .from("gardu_master_state")
            .select("kode,ulp,persen_beban,suhu_trafo,event_type,event_date,belum_diukur");
          return (unit ? q.eq("ulp", unit) : q).order("kode").order("ulp");
        }),
        (async () => {
          const q = supabaseBrowser.from("wo_batch").select("id,bulan,tahun,ulp");
          const { data } = await (unit ? q.eq("ulp", unit) : q);
          return (data ?? []) as WoBatchRow[];
        })(),
        fetchSheetData("gangguanPenyulang", "A:S").catch(() => [] as Record<string, string>[]),
        supabaseBrowser
          .from("petugas")
          .select("id", { count: "exact", head: true })
          .eq("status", "aktif")
          .then((r) => r.count ?? 0),
        // Padam APKT — 114 baris seluruhnya, cukup sekali tarik.
        fetchAllRows<PadamRow>(() => {
          const q = supabaseBrowser
            .from("padam_apkt")
            .select("ulp,tgl_padam,penyebab_padam,jml_pelanggan_padam,lama_padam_jam,ens")
            .gte("tgl_padam", fetchFrom);
          return (unit ? q.eq("ulp", unit) : q).order("id");
        }),
        (async () => {
          const { data } = await supabaseBrowser
            .from("yantek_sla")
            .select("ulp,target_response_menit,target_recovery_menit");
          return (data ?? []) as SlaRow[];
        })(),
      ]);

      // Item WO ditarik terpisah karena bergantung pada daftar batch di atas.
      const batchIds = woBatches.map((b) => b.id);
      const woItems = batchIds.length
        ? await fetchAllRows<WoItemRow>(() =>
            supabaseBrowser
              .from("wo_item")
              .select("batch_id,regu,status,verified_at,approved_at,sla_ok")
              .in("batch_id", batchIds)
              .order("id"),
          )
        : [];

      setRaw({
        inspeksi, pohon, inspeksiTerbuka, pohonTerbuka,
        pengukuran, penyeimbangan, garduMaster,
        woItems, woBatches,
        gangguan: (Array.isArray(gangguanSheet) ? gangguanSheet : []) as GangguanRow[],
        padam, sla,
        totalPetugas: petugasCount,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data dashboard");
      setRaw(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [unit, fetchFrom]);

  useEffect(() => { void load(); }, [load]);

  // ── Turunan ────────────────────────────────────────────────────────────────

  const win = useMemo(() => buildWindow(period, new Date()), [period]);

  /** Gangguan dari Sheets — disaring unit & dijadikan tanggal ISO sekali saja. */
  const gangguanEvents = useMemo(() => {
    const want = unit.toUpperCase();
    return raw.gangguan
      .map((r) => ({
        tgl: parseIndonesianDate(r.TANGGAL),
        ulp: (r.ULP ?? "").trim().toUpperCase(),
        penyulang: (r.PENYULANG ?? "").trim(),
      }))
      .filter((r) => r.tgl && (!want || r.ulp === want))
      .map((r) => ({ ...r, tglIso: iso(r.tgl as Date) }));
  }, [raw.gangguan, unit]);

  const kpi = useMemo(() => {
    const mk = (value: number, prev: number): Kpi => ({
      value,
      prev,
      deltaPct: prev > 0 ? ((value - prev) / prev) * 100 : null,
    });

    const countIn = <T,>(rows: T[], get: (r: T) => string | null, a: string, b: string) =>
      rows.filter((r) => inWindow(get(r), a, b)).length;

    const gangguanNow = gangguanEvents.filter((g) => inWindow(g.tglIso, win.start, win.end)).length;
    const gangguanPrev = gangguanEvents.filter((g) => inWindow(g.tglIso, win.prevStart, win.prevEnd)).length;

    const insNow =
      countIn(raw.inspeksi, (r) => r.tgl_inspeksi, win.start, win.end) +
      countIn(raw.pohon, (r) => r.tgl_inspeksi, win.start, win.end);
    const insPrev =
      countIn(raw.inspeksi, (r) => r.tgl_inspeksi, win.prevStart, win.prevEnd) +
      countIn(raw.pohon, (r) => r.tgl_inspeksi, win.prevStart, win.prevEnd);

    // Gardu unik, bukan baris. Pemerataan ikut terhitung sebagai pengukuran:
    // petugas memang mengukur ulang setelah memindah jurusan, jadi gardu yang
    // hanya disentuh lewat pemerataan tetap gardu yang diukur pada periode itu.
    const garduUnik = (a: string, b: string) =>
      new Set([
        ...raw.pengukuran
          .filter((r) => inWindow(r.tanggal_pengukuran, a, b))
          .map((r) => r.no_gardu),
        ...raw.penyeimbangan
          .filter((r) => inWindow(r.tgl_penyeimbangan, a, b))
          .map((r) => r.no_gardu),
      ]).size;
    const garduNow = garduUnik(win.start, win.end);
    const garduPrev = garduUnik(win.prevStart, win.prevEnd);

    const merataNow = countIn(raw.penyeimbangan, (r) => r.tgl_penyeimbangan, win.start, win.end);
    const merataPrev = countIn(raw.penyeimbangan, (r) => r.tgl_penyeimbangan, win.prevStart, win.prevEnd);

    return {
      gangguan: mk(gangguanNow, gangguanPrev),
      inspeksi: mk(insNow, insPrev),
      gardu: mk(garduNow, garduPrev),
      pemerataan: mk(merataNow, merataPrev),
    };
  }, [gangguanEvents, raw.inspeksi, raw.pohon, raw.pengukuran, raw.penyeimbangan, win]);

  /** Tren 12 bulan — hanya untuk sparkline KPI. */
  const tren = useMemo<MonthPoint[]>(() => {
    const now = new Date();
    const points: MonthPoint[] = [];
    const index = new Map<string, MonthPoint>();

    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const p: MonthPoint = { key, label: BULAN_SHORT[d.getMonth()], gangguan: 0, inspeksi: 0, gardu: 0 };
      points.push(p);
      index.set(key, p);
    }

    const bump = (d: string | null, field: "gangguan" | "inspeksi" | "gardu") => {
      if (!d) return;
      const p = index.get(d.slice(0, 7));
      if (p) p[field] += 1;
    };

    gangguanEvents.forEach((g) => bump(g.tglIso, "gangguan"));
    raw.inspeksi.forEach((r) => bump(r.tgl_inspeksi, "inspeksi"));
    raw.pohon.forEach((r) => bump(r.tgl_inspeksi, "inspeksi"));
    raw.pengukuran.forEach((r) => bump(r.tanggal_pengukuran, "gardu"));

    return points;
  }, [gangguanEvents, raw.inspeksi, raw.pohon, raw.pengukuran]);

  /** Jumlah gangguan per tanggal — dasar semua kerapatan ember di bawah.
   *  Gangguan berasal dari Sheets dan TIDAK disaring jendela 24 bulan, jadi
   *  rentang tahun lalu selalu tersedia. */
  const gangguanPerHari = useMemo(() => {
    const m = new Map<string, number>();
    gangguanEvents.forEach((g) => m.set(g.tglIso, (m.get(g.tglIso) ?? 0) + 1));
    return m;
  }, [gangguanEvents]);

  /** Grafik gangguan: kerapatan ember mengikuti periode terpilih. */
  const trenChart = useMemo<ChartPoint[]>(() => {
    const hariIni = iso(new Date());
    const now = new Date();

    /** Jumlah kejadian pada rentang `panjang` hari mulai `mulai`. */
    const jumlah = (mulai: string, panjang: number) => {
      let n = 0;
      for (let i = 0; i < panjang; i++) n += gangguanPerHari.get(addDaysIso(mulai, i)) ?? 0;
      return n;
    };

    /** `panjangLalu` dipisah karena bulan yang sama bisa beda panjang antar tahun
     *  (Februari kabisat) — memakai panjang tahun ini akan menyerempet 1 Maret. */
    const buat = (
      mulai: string, panjang: number, label: string, mingguan: boolean, panjangLalu = panjang,
    ): ChartPoint => {
      const akhir = addDaysIso(mulai, panjang - 1);
      return {
        key: mulai,
        label,
        gangguan: jumlah(mulai, panjang),
        gangguanLalu: jumlah(setahunLalu(mulai, mingguan), panjangLalu),
        lewat: mulai <= hariIni,
        berjalan: mulai <= hariIni && akhir >= hariIni,
      };
    };

    if (period === "bulan") {
      // Satu batang per hari, sebulan penuh — hari yang belum datang tetap
      // digambar supaya bentuk bulannya utuh.
      const jml = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return Array.from({ length: jml }, (_, i) => {
        const tgl = iso(new Date(now.getFullYear(), now.getMonth(), i + 1));
        return buat(tgl, 1, String(i + 1), false);
      });
    }

    if (period === "3bulan") {
      // Blok tujuh hari berjangkar pada awal jendela, bukan minggu kalender —
      // supaya tiap batang mewakili panjang yang persis sama.
      const mulai = win.start;
      const jmlHari = Math.round(
        (new Date(win.end).getTime() - new Date(mulai).getTime()) / 86_400_000,
      ) + 1;
      const blok = Math.ceil(jmlHari / 7);
      return Array.from({ length: blok }, (_, i) => {
        const awal = addDaysIso(mulai, i * 7);
        const [, m, d] = awal.split("-");
        return buat(awal, 7, `${Number(d)}/${Number(m)}`, true);
      });
    }

    // Tahun Ini — satu batang per bulan, Januari sampai Desember. Bulan yang
    // belum datang tetap digambar: bentuk musiman tahun lalu di garis pembanding
    // justru bagian yang berguna dari tampilan ini.
    return Array.from({ length: 12 }, (_, i) => {
      const awal = iso(new Date(now.getFullYear(), i, 1));
      const panjang = new Date(now.getFullYear(), i + 1, 0).getDate();
      const panjangLalu = new Date(now.getFullYear() - 1, i + 1, 0).getDate();
      return buat(awal, panjang, BULAN_SHORT[i], false, panjangLalu);
    });
  }, [gangguanPerHari, period, win]);

  const inspeksi = useMemo<DomainInspeksi>(() => {
    const terbuka = [...raw.inspeksiTerbuka, ...raw.pohonTerbuka];
    const selesaiPeriode = [...raw.inspeksi, ...raw.pohon].filter(
      (r) => r.status === "Selesai" && inWindow(r.tgl_eksekusi, win.start, win.end),
    );

    const byStatus = new Map<string, number>();
    terbuka.forEach((r) => byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1));

    return {
      jaringanBaru: raw.inspeksi.filter((r) => inWindow(r.tgl_inspeksi, win.start, win.end)).length,
      pohonBaru: raw.pohon.filter((r) => inWindow(r.tgl_inspeksi, win.start, win.end)).length,
      terbuka: terbuka.length,
      selesai: selesaiPeriode.length,
      byStatus: [...byStatus.entries()]
        .map(([status, jumlah]) => ({ status, jumlah }))
        .sort((a, b) => b.jumlah - a.jumlah),
      risikoSangatTinggi: raw.pohonTerbuka.filter((r) => r.tingkat_risiko === "Sangat Tinggi").length,
    };
  }, [raw.inspeksi, raw.pohon, raw.inspeksiTerbuka, raw.pohonTerbuka, win]);

  const wo = useMemo<WoStats>(
    // Dashboard tidak memakai kolom ukuran per batch — volume ditampilkan di
    // halaman Work Order sendiri, di sini cukup jumlah baris per tahap.
    () => buildWoStats(raw.woItems, () => null),
    [raw.woItems],
  );

  const gardu = useMemo<DomainGardu>(() => {
    const st = raw.garduMaster;
    const terukur = st.filter((g) => !g.belum_diukur);
    const bebanValues = terukur.map((g) => g.persen_beban ?? 0);
    const b3 = batasBulanLalu(AMBANG_BASI.bulanTinggi);
    const b5 = batasBulanLalu(AMBANG_BASI.bulanRendah);

    const overloadRows = terukur
      .filter((g) => isOverload(g.persen_beban))
      .sort((a, b) => (b.persen_beban ?? 0) - (a.persen_beban ?? 0));

    // Pemerataan dihitung sebagai pengukuran — kondisinya memang hasil ukur
    // ulang. Dihitung per GARDU, bukan per baris: satu gardu yang diukur dua
    // kali dalam sebulan tetap satu gardu yang diukur.
    const kegiatanPeriode = [
      ...raw.pengukuran
        .filter((r) => inWindow(r.tanggal_pengukuran, win.start, win.end))
        .map((r) => r.no_gardu),
      ...raw.penyeimbangan
        .filter((r) => inWindow(r.tgl_penyeimbangan, win.start, win.end))
        .map((r) => r.no_gardu),
    ];

    // Ember memakai angka yang tampil, sama seperti kartu overload di atasnya —
    // kalau tidak, gardu bertulisan "80%" jatuh ke ember "60–80%".
    const rentang = [
      { rentang: "< 40%", test: (v: number) => bebanTampil(v) < 40 },
      { rentang: "40–60%", test: (v: number) => bebanTampil(v) >= 40 && bebanTampil(v) < 60 },
      { rentang: "60–80%", test: (v: number) => bebanTampil(v) >= 60 && bebanTampil(v) < OVERLOAD_PCT },
      { rentang: "≥ 80%", test: (v: number) => bebanTampil(v) >= OVERLOAD_PCT },
    ];

    return {
      totalMaster: st.length,
      terukur: terukur.length,
      belumDiukur: st.length - terukur.length,
      perluUkurUlang: terukur.filter((g) => pengukuranBasi(g, b3, b5)).length,
      overload: overloadRows.length,
      overloadDariPemeliharaan: overloadRows.filter((g) => g.event_type === "penyeimbangan").length,
      overloadDiPeriode: overloadRows.filter((g) => inWindow(g.event_date, win.start, win.end)).length,
      suhuTinggi: terukur.filter((g) => (g.suhu_trafo ?? 0) >= HIGH_TEMP_C).length,
      avgBeban: bebanValues.length
        ? bebanValues.reduce((a, b) => a + b, 0) / bebanValues.length
        : 0,
      sebaran: rentang.map((r) => ({ rentang: r.rentang, jumlah: bebanValues.filter(r.test).length })),
      bebanValues,
      overloadTeratas: overloadRows.slice(0, 8).map((g) => ({
        kode: g.kode,
        ulp: g.ulp,
        persen: g.persen_beban ?? 0,
        tanggal: g.event_date,
        dariPemeliharaan: g.event_type === "penyeimbangan",
      })),
      diukur: new Set(kegiatanPeriode).size,
      barisPengukuran: kegiatanPeriode.length,
    };
  }, [raw.garduMaster, raw.pengukuran, raw.penyeimbangan, win]);

  const padam = useMemo<DomainPadam>(() => {
    const dalam = raw.padam.filter((r) => inWindow(r.tgl_padam, win.start, win.end));
    const durasi = dalam.map((r) => r.lama_padam_jam ?? 0).filter((v) => v > 0);
    const per = new Map<string, number>();
    dalam.forEach((r) => {
      const n = (r.penyebab_padam ?? "").trim();
      if (n) per.set(n, (per.get(n) ?? 0) + 1);
    });

    return {
      total: dalam.length,
      pelangganPadam: dalam.reduce((s, r) => s + (r.jml_pelanggan_padam ?? 0), 0),
      ens: dalam.reduce((s, r) => s + (r.ens ?? 0), 0),
      durasiRataRata: durasi.length ? durasi.reduce((a, b) => a + b, 0) / durasi.length : 0,
      topPenyebab: [...per.entries()]
        .map(([nama, jumlah]) => ({ nama, jumlah }))
        .sort((a, b) => b.jumlah - a.jumlah)
        .slice(0, 5),
    };
  }, [raw.padam, win]);

  // ── Ringkasan Yantek ───────────────────────────────────────────────────────
  // Datanya berupa berkas JSON di server (9.924 baris), jadi diringkas di sisi
  // server lewat /api/yantek/ringkas dan yang dikirim ke sini hanya angkanya.
  // Ini satu-satunya bagian yang menarik ulang saat periode berganti — memang
  // harus, karena berkas yang dibaca ditentukan oleh rentang tanggalnya.
  const [apkt, setApkt] = useState<DomainApkt>(APKT_KOSONG);

  /** Ambang SLA: baris khusus ULP menang; kalau tidak ada, pakai baris "ALL"
   *  yang dipakai sebagai setelan menyeluruh di Analisis Yantek. Tanpa cadangan
   *  ini, menyaring per ULP menghasilkan nol baris dan seluruh hitungan SLA mati
   *  diam-diam. */
  const targetSla = useMemo(() => {
    const cocok = unit
      ? raw.sla.find((s) => s.ulp?.toUpperCase() === unit.toUpperCase())
      : undefined;
    const dipakai = cocok ?? raw.sla.find((s) => s.ulp?.toUpperCase() === "ALL") ?? null;
    return {
      response: dipakai?.target_response_menit ?? null,
      recovery: dipakai?.target_recovery_menit ?? null,
    };
  }, [raw.sla, unit]);

  useEffect(() => {
    let hidup = true;
    const q = new URLSearchParams({ from: win.start, to: win.end });
    if (unit) q.set("ulp", unit);
    if (targetSla.response !== null) q.set("tr", String(targetSla.response));
    if (targetSla.recovery !== null) q.set("tc", String(targetSla.recovery));

    void (async () => {
      try {
        const res = await fetch(`/api/yantek/ringkas?${q}`);
        const j = await res.json();
        if (!hidup || j?.error) return;
        setApkt({
          total: j.total ?? 0,
          rptMedian: j.rptMedian ?? null,
          rctMedian: j.rctMedian ?? null,
          lewatResponse: j.lewatResponse ?? 0,
          lewatRecovery: j.lewatRecovery ?? 0,
          targetResponse: targetSla.response,
          targetRecovery: targetSla.recovery,
          pelangganPadam: j.pelangganPadam ?? 0,
          ratingRataRata: j.ratingRataRata ?? null,
          jumlahRating: j.jumlahRating ?? 0,
          terakhirData: j.terakhirData ?? null,
          harian: j.harian ?? [],
          topPetugas: j.topPetugas ?? [],
        });
      } catch {
        if (hidup) setApkt(APKT_KOSONG);
      }
    })();
    return () => { hidup = false; };
  }, [win.start, win.end, unit, targetSla]);

  const pemerataan = useMemo<DomainPemerataan>(() => {
    const dalamPeriode = raw.penyeimbangan.filter((r) => inWindow(r.tgl_penyeimbangan, win.start, win.end));
    const selisih = dalamPeriode.map((r) => r.beban_pct_before - r.beban_pct_after);
    const terbaikIdx = selisih.length ? selisih.indexOf(Math.max(...selisih)) : -1;

    return {
      selesai: dalamPeriode.length,
      perbaikanRataRata: selisih.length ? selisih.reduce((a, b) => a + b, 0) / selisih.length : 0,
      terbaik:
        terbaikIdx >= 0
          ? {
              no_gardu: dalamPeriode[terbaikIdx].no_gardu,
              before: dalamPeriode[terbaikIdx].beban_pct_before,
              after: dalamPeriode[terbaikIdx].beban_pct_after,
            }
          : null,
    };
  }, [raw.penyeimbangan, win]);

  const gangguan = useMemo<DomainGangguan>(() => {
    const dalamPeriode = gangguanEvents.filter((g) => inWindow(g.tglIso, win.start, win.end));
    const per = new Map<string, number>();
    dalamPeriode.forEach((g) => {
      if (g.penyulang) per.set(g.penyulang, (per.get(g.penyulang) ?? 0) + 1);
    });
    return {
      total: dalamPeriode.length,
      topPenyulang: [...per.entries()]
        .map(([nama, jumlah]) => ({ nama, jumlah }))
        .sort((a, b) => b.jumlah - a.jumlah)
        .slice(0, 5),
    };
  }, [gangguanEvents, win]);

  const produktivitas = useMemo<DomainProduktivitas>(() => {
    const per = new Map<string, number>();
    const tambah = (nama: string | null) => {
      const n = (nama ?? "").trim();
      if (n) per.set(n, (per.get(n) ?? 0) + 1);
    };

    raw.pengukuran
      .filter((r) => inWindow(r.tanggal_pengukuran, win.start, win.end))
      .forEach((r) => tambah(r.petugas_nama));
    [...raw.inspeksi, ...raw.pohon]
      .filter((r) => inWindow(r.tgl_inspeksi, win.start, win.end))
      .forEach((r) => tambah(r.nama_inspektor));

    return {
      petugasAktif: per.size,
      totalPetugas: raw.totalPetugas,
      top: [...per.entries()]
        .map(([nama, jumlah]) => ({ nama, jumlah }))
        .sort((a, b) => b.jumlah - a.jumlah)
        .slice(0, 5),
    };
  }, [raw.pengukuran, raw.inspeksi, raw.pohon, raw.totalPetugas, win]);

  /** Risiko ML: useFeederRisk hanya menyaring unit milik user, jadi pilihan
   *  dropdown UP3 disaring di sini. */
  const risiko = useMemo(() => {
    const want = unit.toUpperCase();
    const rows = want ? riskData.filter((r) => (r.ulp ?? "").toUpperCase() === want) : riskData;
    return {
      tgl: riskTgl,
      kritis: rows.filter((r) => r.risk_level === "kritis").length,
      waspada: rows.filter((r) => r.risk_level === "waspada").length,
      teratas: rows.slice(0, 5).map((r) => ({
        penyulang: r.penyulang,
        skor: r.risk_score,
        level: r.risk_level,
        penyebab: r.predicted_cause,
      })),
    };
  }, [riskData, riskTgl, unit]);

  /** Baris "butuh tindakan" — hanya hal yang benar-benar bisa ditindak hari ini. */
  const agenda = useMemo<AgendaItem[]>(() => {
    const items: AgendaItem[] = [];
    const add = (
      id: string, jumlah: number, label: string, detail: string,
      tone: AgendaItem["tone"], href: string,
    ) => {
      if (jumlah > 0) items.push({ id, label: `${jumlah} ${label}`, detail, tone, href });
    };

    add("overload", gardu.overload, "gardu overload",
      `Beban ≥ ${OVERLOAD_PCT}% pada pengukuran/pemeliharaan terakhir`, "kritis", "/admin/pengukuran-gardu");
    add("suhu", gardu.suhuTinggi, "gardu suhu tinggi",
      `Suhu trafo ≥ ${HIGH_TEMP_C}°C`, "kritis", "/admin/pengukuran-gardu");
    add("belumUkur", gardu.belumDiukur, "gardu belum pernah diukur",
      `Terdaftar di master, dari ${gardu.totalMaster} gardu`, "waspada", "/admin/pengukuran-gardu");
    add("apktSla", apkt.lewatResponse, "gangguan lewat SLA response",
      apkt.targetResponse ? `Response > ${apkt.targetResponse} menit` : "Melewati target response",
      "waspada", "/admin/yantek");
    add("risiko", risiko.kritis, "penyulang risiko kritis",
      riskTgl ? `Prediksi ML untuk ${riskTgl}` : "Prediksi ML", "kritis", "/admin/command-center");
    // Tidak ada pil "pohon lewat tenggat": aplikasi mobile mengisi
    // `prediksi_inspektur` dengan "1" secara tetap (inspectionService.ts),
    // bukan penilaian inspektur — turunannya membuat 81% pohon terbuka
    // "lewat tenggat", jadi angkanya benar secara harfiah tapi tidak memilah
    // apa pun. Pakai `tingkat_risiko` yang memang terisi bermakna.
    add("sla", wo.slaNot, "work order lewat SLA",
      "Diverifikasi di luar batas waktu", "waspada", "/admin/work-order");
    add("pohonRisiko", inspeksi.risikoSangatTinggi, "pohon risiko sangat tinggi",
      "Belum selesai dikerjakan", "waspada", "/admin/monitoring-inspeksi");
    add("terbuka", inspeksi.terbuka, "inspeksi belum selesai",
      "Seluruh temuan yang masih terbuka", "waspada", "/admin/monitoring-inspeksi");

    return items;
  }, [gardu, risiko, riskTgl, inspeksi, wo, apkt]);

  return {
    loading: loading || riskLoading,
    error,
    refresh: load,
    window: win,
    period,
    kpi,
    tren,
    trenChart,
    agenda,
    inspeksi,
    wo,
    gardu,
    pemerataan,
    gangguan,
    padam,
    apkt,
    produktivitas,
    risiko,
  };
}
