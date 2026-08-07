"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { detectAnomali, type AnomalyRow, type AnomalySettings, DEFAULT_SETTINGS } from "../_utils/detectAnomali";
import type { JurusanData } from "./usePengukuranGardu";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Satu gardu dari master, beserta kondisi terakhirnya.
 *
 * Barisnya berasal dari view `gardu_master_state` — yaitu dari MASTER, bukan
 * dari pengukuran. Bedanya menentukan: dengan baris dari pengukuran, gardu yang
 * belum pernah diukur tidak punya baris sama sekali, jadi pertanyaan "mana yang
 * belum pernah diukur" mustahil dijawab oleh tabelnya sendiri.
 *
 * Konsekuensinya seluruh kolom kondisi boleh NULL. Itu bukan kelalaian data,
 * itu justru keadaan yang ingin ditampilkan.
 */
export interface GarduMasterState {
  // ── Identitas dari master ──
  kode: string;
  kode_amg: string | null;
  nama: string | null;
  alamat: string | null;
  penyulang: string | null;
  ulp: string;
  /** Daya trafo menurut master — inilah acuan yang benar. */
  kva_master: number | null;
  merk: string | null;
  status: string | null;
  lat: number | null;
  lng: number | null;

  // ── Kondisi terakhir — NULL semua kalau belum pernah diukur ──
  source_id: string | null;
  event_type: "pengukuran" | "penyeimbangan" | null;
  event_date: string | null;
  /** kVA yang diketik petugas saat mengukur — potret saat itu, bisa beda dari master. */
  kva_pengukuran: number | null;
  persen_beban: number | null;
  beban_kva: number | null;
  suhu_trafo: number | null;
  total_arus_r: number | null;
  total_arus_s: number | null;
  total_arus_t: number | null;
  total_arus_n: number | null;
  total_teg_rn: number | null;
  total_teg_sn: number | null;
  total_teg_tn: number | null;
  perjurusan: Record<string, JurusanData> | null;
  jenis_pemeliharaan: string | null;
  wo_sent_at: string | null;
  petugas_nama: string | null;

  // ── Penanda dari view ──
  belum_diukur: boolean;
  kva_beda: boolean;
}

/** Kunci baris. Kode gardu TIDAK unik lintas ULP — ekspor AMG memuat enam kode
 *  yang muncul di dua ULP berbeda, jadi memakai kode saja membuat dua gardu
 *  berbagi satu hasil deteksi anomali. */
export const kunciGardu = (r: { kode: string; ulp: string }) => `${r.kode}|${r.ulp}`;

export type StatusUkur = "" | "belum" | "basi" | "terukur";

export interface GarduStatusFilter {
  search: string;
  penyulang: string;
  anomaliOnly: boolean;
  kvaTrafo: string;      // "" = semua, atau nilai kva spesifik
  minBeban: number;      // 0 = semua, atau minimum persen beban
  statusUkur: StatusUkur; // "" = semua
}

// ── Timeline types (untuk modal) ──────────────────────────────────────────────

export interface TimelinePengukuran {
  id: string;
  type: "pengukuran";
  date: string;
  kva_trafo: number;
  persen_beban: number;
  beban_kva: number;
  suhu_trafo: number;
  total_arus_r: number;
  total_arus_s: number;
  total_arus_t: number;
  total_arus_n: number;
  total_teg_rn: number | null;
  total_teg_sn: number | null;
  total_teg_tn: number | null;
  perjurusan: Record<string, JurusanData> | null;
  petugas_nama: string | null;
  jenis_pemeliharaan: string | null;
  wo_sent_at: string | null;
}

export interface TimelinePenyeimbangan {
  id: string;
  type: "penyeimbangan";
  date: string;
  beban_pct_before: number;
  beban_pct_after: number;
  arus_r_before: number; arus_s_before: number; arus_t_before: number;
  arus_r_after: number;  arus_s_after: number;  arus_t_after: number;
  jenis_pemeliharaan: string | null;
  petugas_penyeimbang: string | null;
  catatan: string | null;
  pengukuran_id: string | null;
}

export type TimelineEvent = TimelinePengukuran | TimelinePenyeimbangan;

const PAGE_SIZE = 20;

// ── Cakupan pengukuran ────────────────────────────────────────────────────────

/**
 * Ambang "pengukuran sudah basi".
 *
 * Gardu bermuatan tinggi diukur lebih sering: pada beban segitu, kenaikan kecil
 * saja sudah menembus batas, jadi potret berumur tiga bulan tidak lagi bisa
 * dipercaya. Gardu berbeban rendah punya ruang lebih longgar.
 */
export const AMBANG_BASI = {
  bebanTinggi: 80,
  bulanTinggi: 3,
  bulanRendah: 5,
} as const;

export interface CakupanPengukuran {
  /** Gardu terdaftar di master yang belum pernah diukur sama sekali. */
  belumDiukur: number;
  /** Beban terakhir ≥80% dan sudah lewat 3 bulan sejak diukur. */
  basiTinggi: number;
  /** Beban terakhir <80% dan sudah lewat 5 bulan sejak diukur. */
  basiRendah: number;
  /** Jumlah gardu di master — penyebut untuk cakupan. */
  totalMaster: number;
  /** Gardu yang sudah punya setidaknya satu pengukuran/penyeimbangan. */
  terukur: number;
}

/** Tanggal batas `n` bulan ke belakang, dalam bentuk YYYY-MM-DD. */
function batasBulan(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Apakah pengukuran terakhir gardu ini sudah kedaluwarsa.
 *
 * Gardu yang belum pernah diukur mengembalikan `false` — ia punya kategorinya
 * sendiri, dan menghitungnya sebagai "basi" akan membuatnya masuk dua kartu.
 */
export function pengukuranBasi(
  // Sengaja tipe struktural minimal, bukan `GarduMasterState` utuh: dashboard
  // menarik kolom seperlunya dari view yang sama dan tetap harus memakai aturan
  // ini, bukan menyalin ulang tiga barisnya.
  r: { belum_diukur: boolean; persen_beban: number | null; event_date: string | null },
  b3: string,
  b5: string,
): boolean {
  if (r.belum_diukur || r.persen_beban === null || !r.event_date) return false;
  // Dibandingkan pada persen yang TAMPIL, sama dengan kartu overload.
  return Math.round(r.persen_beban) >= AMBANG_BASI.bebanTinggi ? r.event_date < b3 : r.event_date < b5;
}

/** Ambil kolom yang dibutuhkan detektor anomali. `null` = belum pernah diukur,
 *  jadi tidak ada yang bisa dinilai. */
function barisAnomali(r: GarduMasterState): AnomalyRow | null {
  if (r.belum_diukur || r.persen_beban === null) return null;
  return {
    // Anomali dinilai memakai kVA yang dipakai SAAT mengukur, bukan kVA master:
    // persen bebannya dihitung dari angka itu, jadi menilainya dengan angka lain
    // akan bertentangan dengan persentase yang tampil di baris yang sama.
    kva_trafo: r.kva_pengukuran ?? r.kva_master ?? 0,
    persen_beban: r.persen_beban,
    suhu_trafo: r.suhu_trafo,
    perjurusan: r.perjurusan,
    total_arus_r: r.total_arus_r ?? 0,
    total_arus_s: r.total_arus_s ?? 0,
    total_arus_t: r.total_arus_t ?? 0,
  };
}

// ── Hook: useGarduStatus ──────────────────────────────────────────────────────

export function useGarduStatus(
  user: CurrentUser,
  ulp: string,
  settings: AnomalySettings = DEFAULT_SETTINGS,
  enabled = true,
) {
  const [rawData, setRawData] = useState<GarduMasterState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GarduStatusFilter>({
    search: "", penyulang: "", anomaliOnly: false, kvaTrafo: "", minBeban: 0, statusUkur: "",
  });
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const unit = !canSeeAllUnits(user.role) && user.unit ? user.unit : ulp;

      // Wajib paginasi: PostgREST memotong di 1.000 baris tanpa berkata apa-apa,
      // dan master berisi 2.526 gardu — tanpa ini, lebih dari separuhnya hilang
      // dari tabel sekaligus dari semua hitungan KPI.
      //
      // Diurutkan (kode, ulp) karena kode saja tidak unik: tanpa urutan yang
      // benar-benar pasti, batas antar halaman bisa bergeser dan membuat baris
      // terlewat atau terhitung dua kali.
      const rows = await fetchAllRows<GarduMasterState>(() => {
        const q = supabaseBrowser
          .from("gardu_master_state")
          .select("*")
          .order("kode")
          .order("ulp");
        return unit ? q.eq("ulp", unit) : q;
      });

      setRawData(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  }, [user.role, user.unit, ulp]);

  useEffect(() => { if (enabled) fetchData(); }, [fetchData, enabled]);

  /** Deteksi anomali per gardu. Gardu yang belum pernah diukur tidak masuk peta
   *  ini sama sekali — tidak ada apa pun untuk dinilai. */
  const anomaliMap = useMemo(() => {
    const peta = new Map<string, ReturnType<typeof detectAnomali>>();
    for (const row of rawData) {
      const baris = barisAnomali(row);
      if (baris) peta.set(kunciGardu(row), detectAnomali(baris, settings));
    }
    return peta;
  }, [rawData, settings]);

  /** Kunci gardu yang pengukurannya sudah kedaluwarsa. Batas tanggalnya dihitung
   *  sekali di sini, bukan per baris. */
  const basiSet = useMemo(() => {
    const b3 = batasBulan(AMBANG_BASI.bulanTinggi);
    const b5 = batasBulan(AMBANG_BASI.bulanRendah);
    const set = new Set<string>();
    for (const row of rawData) if (pengukuranBasi(row, b3, b5)) set.add(kunciGardu(row));
    return set;
  }, [rawData]);

  const filteredData = useMemo(() => {
    let data = rawData;

    if (filter.penyulang) {
      data = data.filter((d) => d.penyulang === filter.penyulang);
    }
    if (filter.kvaTrafo) {
      const kva = Number(filter.kvaTrafo);
      data = data.filter((d) => d.kva_master === kva);
    }
    if (filter.statusUkur === "belum") {
      data = data.filter((d) => d.belum_diukur);
    } else if (filter.statusUkur === "terukur") {
      data = data.filter((d) => !d.belum_diukur);
    } else if (filter.statusUkur === "basi") {
      data = data.filter((d) => basiSet.has(kunciGardu(d)));
    }
    // Beban minimum hanya bermakna untuk gardu yang punya angka beban — yang
    // belum diukur otomatis tersaring keluar, dan itu memang benar.
    if (filter.minBeban > 0) {
      data = data.filter((d) => (d.persen_beban ?? -1) >= filter.minBeban);
    }
    if (filter.anomaliOnly) {
      data = data.filter((d) => anomaliMap.get(kunciGardu(d))?.isAnomali);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      data = data.filter(
        (d) =>
          d.kode.toLowerCase().includes(q) ||
          d.penyulang?.toLowerCase().includes(q) ||
          d.alamat?.toLowerCase().includes(q) ||
          d.nama?.toLowerCase().includes(q)
      );
    }

    return data;
  }, [rawData, filter, anomaliMap, basiSet]);

  const paginatedData = useMemo(
    () => filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredData, page]
  );

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  const penyulangOptions = useMemo(
    () => ([...new Set(rawData.map((d) => d.penyulang).filter(Boolean))] as string[]).sort(),
    [rawData]
  );

  const anomaliCount = useMemo(
    () => rawData.filter((d) => anomaliMap.get(kunciGardu(d))?.isAnomali).length,
    [rawData, anomaliMap]
  );

  const penyeimbanganCount = useMemo(
    () => rawData.filter((d) => d.event_type === "penyeimbangan").length,
    [rawData]
  );

  /** Rata-rata beban dihitung hanya atas gardu yang PUNYA pengukuran. Ikut
   *  membagi dengan gardu yang belum diukur akan menyeret angkanya turun dan
   *  membuat armada terlihat lebih longgar daripada kenyataannya. */
  const avgBeban = useMemo(() => {
    const terukur = rawData.filter((d) => d.persen_beban !== null);
    return terukur.length > 0
      ? Math.round(terukur.reduce((s, d) => s + (d.persen_beban ?? 0), 0) / terukur.length)
      : 0;
  }, [rawData]);

  /** Cakupan pengukuran — diturunkan dari baris yang sudah ada di memori.
   *  Tidak perlu query hitung terpisah: seluruh master memang sudah ditarik. */
  const cakupan = useMemo<CakupanPengukuran>(() => {
    const b3 = batasBulan(AMBANG_BASI.bulanTinggi);
    const b5 = batasBulan(AMBANG_BASI.bulanRendah);
    let belumDiukur = 0, basiTinggi = 0, basiRendah = 0;

    for (const r of rawData) {
      if (r.belum_diukur) { belumDiukur += 1; continue; }
      if (!pengukuranBasi(r, b3, b5)) continue;
      if ((r.persen_beban ?? 0) >= AMBANG_BASI.bebanTinggi) basiTinggi += 1;
      else basiRendah += 1;
    }

    return {
      belumDiukur, basiTinggi, basiRendah,
      totalMaster: rawData.length,
      terukur: rawData.length - belumDiukur,
    };
  }, [rawData]);

  return {
    data: paginatedData,
    allData: filteredData,
    rawData,
    loading,
    error,
    filter,
    setFilter,
    page,
    setPage,
    totalPages,
    totalFiltered: filteredData.length,
    penyulangOptions,
    anomaliMap,
    anomaliCount,
    penyeimbanganCount,
    avgBeban,
    cakupan,
    basiSet,
    refresh: fetchData,
  };
}

// ── Hook: useGarduTimeline ────────────────────────────────────────────────────
// Fetch semua event (pengukuran + penyeimbangan) untuk satu gardu

export function useGarduTimeline(noGardu: string | null) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!noGardu) { setEvents([]); return; }
    let cancelled = false;
    setLoading(true);

    async function load() {
      const [pgRes, psRes] = await Promise.all([
        supabaseBrowser
          .from("pengukuran_gardu")
          .select("id,tanggal_pengukuran,kva_trafo,persen_beban,beban_kva,suhu_trafo,total_arus_r,total_arus_s,total_arus_t,total_arus_n,total_teg_rn,total_teg_sn,total_teg_tn,perjurusan,petugas_nama,jenis_pemeliharaan,wo_sent_at")
          .eq("no_gardu", noGardu)
          // Baris hasil penyeimbangan disembunyikan dari riwayat: angkanya sama
          // persis dengan kartu Penyeimbangan, jadi tanpa filter ini satu
          // pekerjaan tampil sebagai dua kartu bertanggal sama. Baris itu ada
          // semata sebagai pembawa data ke AMG.
          .is("hasil_penyeimbangan_id", null)
          .order("tanggal_pengukuran", { ascending: false }),

        supabaseBrowser
          .from("penyeimbangan_gardu")
          .select("id,tgl_penyeimbangan,beban_pct_before,beban_pct_after,arus_r_before,arus_s_before,arus_t_before,arus_r_after,arus_s_after,arus_t_after,jenis_pemeliharaan,petugas_penyeimbang,catatan,pengukuran_id")
          .eq("no_gardu", noGardu)
          .order("tgl_penyeimbangan", { ascending: false }),
      ]);

      if (cancelled) return;

      const pg: TimelinePengukuran[] = (pgRes.data ?? []).map((r) => ({
        ...r,
        type: "pengukuran" as const,
        date: r.tanggal_pengukuran,
      }));

      const ps: TimelinePenyeimbangan[] = (psRes.data ?? []).map((r) => ({
        ...r,
        type: "penyeimbangan" as const,
        date: r.tgl_penyeimbangan,
      }));

      const merged: TimelineEvent[] = [...pg, ...ps].sort(
        (a, b) => b.date.localeCompare(a.date)
      );
      setEvents(merged);
      setLoading(false);
    }

    load();
    return () => { cancelled = true; };
  }, [noGardu]);

  return { events, loading };
}
