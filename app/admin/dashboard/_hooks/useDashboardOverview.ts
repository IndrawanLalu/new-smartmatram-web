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
 * ── Agregasinya di DATABASE, bukan di browser ───────────────────────────────
 * Versi sebelumnya menarik ~9.500 baris (inspeksi 2.071, inspeksi_pohon 3.534,
 * gardu_master_state 2.526, pengukuran_gardu 1.261) hanya untuk menghasilkan
 * sekitar 40 angka. Karena `fetchAllRows` memaginasi berurutan, itu jadi belasan
 * request bolak-balik sebelum satu angka pun tampil.
 *
 * Sekarang satu panggilan RPC `dashboard_ringkas` (~1,6 KB) menggantikan
 * semuanya. Ambangnya DIKIRIM sebagai parameter, jadi TypeScript tetap
 * satu-satunya pemilik angka ambang — SQL tidak menyimpan salinannya.
 * Definisinya di `scripts/dashboard-ringkas-rpc.sql`.
 *
 * Yang TETAP ditarik dari klien, beserta alasannya:
 *  - Gangguan penyulang → sumbernya Google Sheets, bukan Postgres.
 *  - Work Order         → 233 baris, 0 KB setelah gzip; `buildWoStats` di TS
 *                         adalah satu-satunya definisi tahapan WO.
 *  - Risiko ML          → `useFeederRisk` sudah menyaring satu tanggal.
 *  - Ringkasan Yantek   → berkas JSON di server, lewat /api/yantek/ringkas.
 *
 * Konsekuensi yang diterima: ganti periode kini memicu satu panggilan RPC baru,
 * tidak lagi diturunkan dari cache 24 bulan. 1,6 KB per pergantian periode
 * jauh lebih murah daripada 63 KB sekali muat.
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
import { AMBANG_BASI } from "@/app/admin/_hooks/useGarduStatus";

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

// ── Bentuk balasan RPC ───────────────────────────────────────────────────────
// Cerminan `scripts/dashboard-ringkas-rpc.sql`. Kalau SQL-nya diubah, tipe ini
// harus ikut — tidak ada yang memeriksanya untuk kita.

interface RingkasRpc {
  kpi: {
    inspeksiNow: number; inspeksiPrev: number;
    garduNow: number; garduPrev: number;
    merataNow: number; merataPrev: number;
  };
  /** Peta 'YYYY-MM' → jumlah. Bulan tanpa kegiatan tidak muncul; kerangka
   *  12 bulannya disusun di klien, jadi bolongnya jadi nol di sana. */
  tren: { inspeksi: Record<string, number>; gardu: Record<string, number> };
  inspeksi: DomainInspeksi;
  gardu: DomainGardu;
  pemerataan: DomainPemerataan;
  padam: DomainPadam;
  produktivitas: DomainProduktivitas;
}

interface WoItemRow { batch_id: string; regu: string | null; status: string; verified_at: string | null; approved_at: string | null; sla_ok: boolean | null }
interface WoBatchRow { id: string; bulan: number; tahun: number; ulp: string | null }
interface GangguanRow { TANGGAL?: string; ULP?: string; PENYULANG?: string }
interface SlaRow { ulp: string; target_response_menit: number | null; target_recovery_menit: number | null }

interface RawBundle {
  ringkas: RingkasRpc | null;
  woItems: WoItemRow[];
  woBatches: WoBatchRow[];
  gangguan: GangguanRow[];
  sla: SlaRow[];
}

const RINGKAS_KOSONG: RingkasRpc = {
  kpi: { inspeksiNow: 0, inspeksiPrev: 0, garduNow: 0, garduPrev: 0, merataNow: 0, merataPrev: 0 },
  tren: { inspeksi: {}, gardu: {} },
  inspeksi: { jaringanBaru: 0, pohonBaru: 0, terbuka: 0, selesai: 0, byStatus: [], risikoSangatTinggi: 0 },
  gardu: {
    totalMaster: 0, terukur: 0, belumDiukur: 0, perluUkurUlang: 0, overload: 0,
    overloadDariPemeliharaan: 0, overloadDiPeriode: 0, suhuTinggi: 0, avgBeban: 0,
    bebanValues: [], overloadTeratas: [], diukur: 0, barisPengukuran: 0,
  },
  pemerataan: { selesai: 0, perbaikanRataRata: 0, terbaik: null },
  padam: { total: 0, pelangganPadam: 0, ens: 0, durasiRataRata: 0, topPenyebab: [] },
  produktivitas: { petugasAktif: 0, totalPetugas: 0, top: [] },
};

/** Larik dari JSON: kunci yang hilang atau bernilai `null` jadi larik kosong. */
function larik<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Rapikan balasan RPC supaya bentuknya pasti.
 *
 * `dashboard_ringkas` dipasang manual lewat SQL Editor, jadi versi fungsi di
 * database bisa tertinggal dari `scripts/dashboard-ringkas-rpc.sql` yang ada di
 * repo. Satu kunci yang belum ada di versi lama — `produktivitas.top` misalnya —
 * langsung menjatuhkan seluruh halaman dengan "Cannot read properties of
 * undefined" di tengah render, padahal yang hilang cuma satu kartu.
 *
 * Di sini kunci yang tidak dikenali jatuh ke nilai nol: kartunya tampil kosong,
 * halamannya tetap hidup. Pola yang sama sudah dipakai untuk balasan
 * /api/yantek/ringkas di bawah.
 */
function normalisasiRingkas(data: unknown): RingkasRpc {
  if (!data || typeof data !== "object") return RINGKAS_KOSONG;
  const d = data as Partial<RingkasRpc>;
  return {
    kpi: { ...RINGKAS_KOSONG.kpi, ...d.kpi },
    tren: {
      inspeksi: d.tren?.inspeksi ?? {},
      gardu: d.tren?.gardu ?? {},
    },
    inspeksi: {
      ...RINGKAS_KOSONG.inspeksi,
      ...d.inspeksi,
      byStatus: larik(d.inspeksi?.byStatus),
    },
    gardu: {
      ...RINGKAS_KOSONG.gardu,
      ...d.gardu,
      bebanValues: larik(d.gardu?.bebanValues),
      overloadTeratas: larik(d.gardu?.overloadTeratas),
    },
    pemerataan: { ...RINGKAS_KOSONG.pemerataan, ...d.pemerataan },
    padam: { ...RINGKAS_KOSONG.padam, ...d.padam, topPenyebab: larik(d.padam?.topPenyebab) },
    produktivitas: {
      ...RINGKAS_KOSONG.produktivitas,
      ...d.produktivitas,
      top: larik(d.produktivitas?.top),
    },
  };
}

const EMPTY: RawBundle = { ringkas: null, woItems: [], woBatches: [], gangguan: [], sla: [] };

const APKT_KOSONG: DomainApkt = {
  total: 0, rptMedian: null, rctMedian: null, lewatResponse: 0, lewatRecovery: 0,
  targetResponse: null, targetRecovery: null, pelangganPadam: 0,
  ratingRataRata: null, jumlahRating: 0, terakhirData: null, harian: [], topPetugas: [],
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboardOverview(user: CurrentUser, period: PeriodKey, ulpFilter: string) {
  const [raw, setRaw] = useState<RawBundle>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** ULP efektif: UP3 memilih lewat dropdown, role lain terkunci ke unitnya. */
  const unit = canSeeAllUnits(user.role) ? ulpFilter : (user.unit ?? "");

  const { riskData, dateTgl: riskTgl, loading: riskLoading } = useFeederRisk(user);

  // Jendela periode dihitung lebih dulu: RPC-nya menerimanya sebagai parameter,
  // jadi `load` memang bergantung pada periode terpilih.
  const win = useMemo(() => buildWindow(period, new Date()), [period]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ringkasRes, woBatches, gangguanSheet, slaRes] = await Promise.all([
        // Satu panggilan menggantikan tujuh kueri dan ~9.500 baris. Ambangnya
        // dikirim dari sini supaya SQL tidak menyimpan salinan angka ambang.
        supabaseBrowser.rpc("dashboard_ringkas", {
          p_from: win.start,
          p_to: win.end,
          p_prev_from: win.prevStart,
          p_prev_to: win.prevEnd,
          p_ulp: unit,
          p_overload_pct: OVERLOAD_PCT,
          p_suhu_c: HIGH_TEMP_C,
          p_basi_tinggi: AMBANG_BASI.bulanTinggi,
          p_basi_rendah: AMBANG_BASI.bulanRendah,
        }),
        (async () => {
          const q = supabaseBrowser.from("wo_batch").select("id,bulan,tahun,ulp");
          const { data } = await (unit ? q.eq("ulp", unit) : q);
          return (data ?? []) as WoBatchRow[];
        })(),
        fetchSheetData("gangguanPenyulang", "A:S").catch(() => [] as Record<string, string>[]),
        supabaseBrowser.from("yantek_sla").select("ulp,target_response_menit,target_recovery_menit"),
      ]);

      if (ringkasRes.error) {
        // Pesan aslinya ikut ditampilkan: kalau fungsinya belum dibuat,
        // yang perlu dibaca orang adalah "function does not exist", bukan
        // "gagal memuat data".
        throw new Error(
          `${ringkasRes.error.message} — pastikan scripts/dashboard-ringkas-rpc.sql sudah dijalankan.`,
        );
      }

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
        ringkas: normalisasiRingkas(ringkasRes.data),
        woItems,
        woBatches,
        gangguan: (Array.isArray(gangguanSheet) ? gangguanSheet : []) as GangguanRow[],
        sla: (slaRes.data ?? []) as SlaRow[],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data dashboard");
      setRaw(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [unit, win]);

  useEffect(() => { void load(); }, [load]);

  // ── Turunan ────────────────────────────────────────────────────────────────

  /** Balasan RPC, dengan cadangan nol supaya turunan di bawah tidak perlu
   *  memeriksa null satu per satu. */
  const ringkas = raw.ringkas ?? RINGKAS_KOSONG;


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

  /** Jumlah gangguan per bulan — hanya gangguan yang masih dihitung di klien,
   *  sumbernya Google Sheets. */
  const gangguanPerBulan = useMemo(() => {
    const m = new Map<string, number>();
    gangguanEvents.forEach((g) => {
      const k = g.tglIso.slice(0, 7);
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return m;
  }, [gangguanEvents]);

  const kpi = useMemo(() => {
    const mk = (value: number, prev: number): Kpi => ({
      value,
      prev,
      deltaPct: prev > 0 ? ((value - prev) / prev) * 100 : null,
    });

    // Gangguan tetap dihitung di klien: sumbernya Sheets, bukan Postgres.
    const gangguanNow = gangguanEvents.filter((g) => inWindow(g.tglIso, win.start, win.end)).length;
    const gangguanPrev = gangguanEvents.filter((g) => inWindow(g.tglIso, win.prevStart, win.prevEnd)).length;
    const k = ringkas.kpi;

    return {
      gangguan: mk(gangguanNow, gangguanPrev),
      inspeksi: mk(k.inspeksiNow, k.inspeksiPrev),
      gardu: mk(k.garduNow, k.garduPrev),
      pemerataan: mk(k.merataNow, k.merataPrev),
    };
  }, [gangguanEvents, ringkas, win]);


  /** Tren 12 bulan untuk sparkline. Kerangkanya disusun di sini — RPC hanya
   *  mengirim bulan yang punya kegiatan, jadi bulan kosong jadi nol di sini. */
  const tren = useMemo<MonthPoint[]>(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return {
        key,
        label: BULAN_SHORT[d.getMonth()],
        gangguan: gangguanPerBulan.get(key) ?? 0,
        inspeksi: ringkas.tren.inspeksi[key] ?? 0,
        gardu: ringkas.tren.gardu[key] ?? 0,
      };
    });
  }, [gangguanPerBulan, ringkas]);


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

  const inspeksi = ringkas.inspeksi;

  const wo = useMemo<WoStats>(
    // Dashboard tidak memakai kolom ukuran per batch — volume ditampilkan di
    // halaman Work Order sendiri, di sini cukup jumlah baris per tahap.
    () => buildWoStats(raw.woItems, () => null),
    [raw.woItems],
  );

  const gardu = ringkas.gardu;

  const padam = ringkas.padam;

  // ── Ringkasan Yantek ───────────────────────────────────────────────────────
  // Datanya berupa berkas JSON di server (9.924 baris), jadi diringkas di sisi
  // server lewat /api/yantek/ringkas dan yang dikirim ke sini hanya angkanya.

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

  const pemerataan = ringkas.pemerataan;

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

  /** Produktivitas datang utuh dari RPC — `petugasAktif` dihitung di sana atas
   *  pengukuran, pemerataan, DAN inspeksi sekaligus. */
  const produktivitas = ringkas.produktivitas;

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
