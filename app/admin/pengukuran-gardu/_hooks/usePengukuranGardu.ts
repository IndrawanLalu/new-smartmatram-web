"use client";

import { useState, useEffect, useMemo, useCallback, useRef, useId } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

// ── Thresholds ────────────────────────────────────────────────────────────────
// Definisinya pindah ke `lib/garduAmbang.ts` karena kini dipakai tiga halaman.
// Diekspor kembali dari sini supaya puluhan pemakainya tidak perlu diubah.

export {
  OVERLOAD_PCT, UNDERLOAD_PCT, HIGH_CURRENT_A, HIGH_TEMP_C,
} from "@/lib/garduAmbang";
export type { JurusanData } from "@/lib/garduAmbang";

import {
  OVERLOAD_PCT, UNDERLOAD_PCT, HIGH_CURRENT_A, HIGH_TEMP_C,
  type JurusanData,
} from "@/lib/garduAmbang";

/**
 * Persen beban SEBAGAIMANA TAMPIL — semua tabel, kartu, dan grafik membulatkan
 * ke persen terdekat.
 *
 * Klasifikasi wajib memakai angka yang sama dengan yang dibaca mata. Contoh
 * nyatanya: AM053 tercatat 79,73% dan tampil "80%" di seluruh layar, tapi
 * dulu tidak ikut terhitung overload karena pembandingnya memakai 79,73.
 * Hasilnya kartu berkata "4 gardu overload" sementara di tabel terlihat lima
 * baris bertuliskan 80% atau lebih — dan yang salah bukan orang yang
 * menghitungnya dengan jari.
 *
 * Konsekuensinya ambang efektifnya jadi 79,5%. Untuk trafo 160 kVA itu selisih
 * 0,8 kVA — jauh lebih kecil daripada ketidakpastian pengukuran tang ampere
 * yang jadi sumber angkanya.
 */
/**
 * Kolom `pengukuran_gardu` yang benar-benar dipakai — persis isi interface
 * `PengukuranGardu` di bawah.
 *
 * Tabelnya punya 48 kolom, 18 di antaranya warisan dengan NOL pemakaian di
 * seluruh aplikasi: `total_tegangan_*` (kembaran `total_teg_*`), `foto_arus`,
 * `foto_tegangan`, `input_amg`, `input_probis`, `unbalance`, `jam_ukur`,
 * `nama`, `petugas`. Hematnya setelah gzip kecil — kolom kembar sangat mudah
 * dikompresi — jadi yang dibeli di sini kejelasan kontrak, bukan byte: kolom
 * baru di tabel tidak lagi ikut terkirim ke browser tanpa ada yang memutuskan.
 *
 * Satu konstanta dipakai `usePengukuranGardu` dan `useFilterGardu` karena
 * keduanya menghasilkan `PengukuranGardu[]`. Dua daftar yang "seharusnya sama"
 * adalah cara termudah membuatnya melenceng.
 */
export const KOLOM_PENGUKURAN =
  "id,no_gardu,alamat,penyulang,kva_trafo,tanggal_pengukuran,jam_pengukuran,total_arus_r,total_arus_s,total_arus_t,total_arus_n,total_teg_rn,total_teg_sn,total_teg_tn,total_teg_rs,total_teg_st,total_teg_rt,perjurusan,beban_kva,persen_beban,suhu_trafo,petugas_nama,petugas_unit,created_at,wo_sent_at,jenis_pemeliharaan,amg_sent_at,amg_queued_at,amg_error,amg_attempts,lokasi_lat,lokasi_lng,lokasi_akurasi";

export const bebanTampil = (v: number | null | undefined) => Math.round(v ?? 0);

export const isOverload = (v: number | null | undefined) => bebanTampil(v) >= OVERLOAD_PCT;
export const isUnderload = (v: number | null | undefined) => bebanTampil(v) < UNDERLOAD_PCT;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PengukuranGardu {
  id: string;
  no_gardu: string;
  alamat: string | null;
  penyulang: string | null;
  kva_trafo: number;
  tanggal_pengukuran: string;
  jam_pengukuran: string | null;
  total_arus_r: number;
  total_arus_s: number;
  total_arus_t: number;
  total_arus_n: number;
  total_teg_rn: number;
  total_teg_sn: number;
  total_teg_tn: number;
  total_teg_rs: number | null;
  total_teg_st: number | null;
  total_teg_rt: number | null;
  perjurusan: Record<string, JurusanData>;
  beban_kva: number;
  persen_beban: number;
  suhu_trafo: number;
  petugas_nama: string | null;
  petugas_unit: string;
  /** NULL di SELURUH baris tabel `pengukuran_gardu` — kolomnya tidak pernah
   *  terisi. Tipenya dulu menyatakan `string`, dan kebohongan itu membuat
   *  pengurutan yang memakainya runtuh saat dijalankan. */
  created_at: string | null;
  wo_sent_at: string | null;
  jenis_pemeliharaan: string | null;
  amg_sent_at: string | null;
  amg_queued_at: string | null;
  amg_error: string | null;
  amg_attempts: number | null;
  /** Titik tempat petugas berdiri saat menyimpan pengukuran. NULL = GPS tidak
   *  tersedia — sengaja tidak diwajibkan, sebab gardu di dalam gedung sering
   *  tidak dapat sinyal dan pengukurannya tetap harus bisa tersimpan. */
  lokasi_lat: number | null;
  lokasi_lng: number | null;
  /** Akurasi GPS dalam meter. Titik berakurasi 500 m tidak bisa dipakai menilai
   *  apa pun, dan tanpa angka ini ia tak terbedakan dari titik yang presisi. */
  lokasi_akurasi: number | null;
  /** Baris ini sebenarnya hasil PEMERATAAN BEBAN, bukan pengukuran rutin.
   *  Kondisinya tetap kondisi nyata gardu, jadi ia ikut semua perhitungan —
   *  tapi tidak boleh masuk tabel Realisasi maupun antrean kirim AMG, karena
   *  barisnya tidak ada di tabel `pengukuran_gardu`. */
  dari_penyeimbangan?: boolean;
}

/** Baris `penyeimbangan_gardu` — kolom yang dipakai saja. */
interface PenyeimbanganRow {
  id: string;
  no_gardu: string;
  penyulang: string | null;
  alamat: string | null;
  ulp: string;
  kva_trafo: number;
  arus_r_after: number;
  arus_s_after: number;
  arus_t_after: number;
  arus_n_after: number;
  beban_kva_after: number;
  beban_pct_after: number;
  perjurusan_after: Record<string, JurusanData> | null;
  tgl_penyeimbangan: string;
  petugas_penyeimbang: string | null;
  jenis_pemeliharaan: string | null;
}

/**
 * Ubah hasil pemerataan jadi bentuk pengukuran.
 *
 * Pemerataan beban ADALAH pengukuran: petugas mengukur ulang setelah memindah
 * jurusan, dan angka sesudahnya itulah kondisi gardu yang berlaku. Tanpa ini,
 * gardu yang terakhir disentuh lewat pemerataan hilang dari seluruh hitungan
 * overload di halaman ini — tiga gardu Ampenan di atas 80% tidak terlihat sama
 * sekali karena kondisi terakhirnya berasal dari pemerataan.
 *
 * Suhu dan tegangan sengaja nol/null: pemerataan memang tidak mengukurnya, dan
 * mengarang angka di situ akan menyeret rata-rata suhu ke bawah.
 */
function dariPenyeimbangan(r: PenyeimbanganRow): PengukuranGardu {
  return {
    // Awalan "ps-" supaya id-nya tidak mungkin bentrok dengan id pengukuran,
    // dan supaya baris sintetis ini kentara saat menelusuri masalah.
    id: `ps-${r.id}`,
    no_gardu: r.no_gardu,
    alamat: r.alamat,
    penyulang: r.penyulang,
    kva_trafo: r.kva_trafo,
    tanggal_pengukuran: r.tgl_penyeimbangan,
    jam_pengukuran: null,
    total_arus_r: r.arus_r_after,
    total_arus_s: r.arus_s_after,
    total_arus_t: r.arus_t_after,
    total_arus_n: r.arus_n_after,
    total_teg_rn: 0, total_teg_sn: 0, total_teg_tn: 0,
    total_teg_rs: null, total_teg_st: null, total_teg_rt: null,
    perjurusan: r.perjurusan_after ?? {},
    beban_kva: r.beban_kva_after,
    persen_beban: r.beban_pct_after,
    suhu_trafo: 0,
    petugas_nama: r.petugas_penyeimbang,
    petugas_unit: r.ulp,
    created_at: r.tgl_penyeimbangan,
    wo_sent_at: null,
    jenis_pemeliharaan: r.jenis_pemeliharaan ?? "PEMERATAAN BEBAN",
    amg_sent_at: null, amg_queued_at: null, amg_error: null, amg_attempts: null,
    // Pemerataan beban dicatat lewat jalurnya sendiri dan tidak merekam titik.
    lokasi_lat: null, lokasi_lng: null, lokasi_akurasi: null,
    dari_penyeimbangan: true,
  };
}

export interface HighCurrentItem {
  id: string;
  no_gardu: string;
  penyulang: string | null;
  jurusan: string;
  arus_r: number;
  arus_s: number;
  arus_t: number;
  max_arus: number;
}

export interface FilterPengukuran {
  month: number;
  year: number;
  ulp: string;
  penyulang: string;
}

export interface PhaseOverloadItem {
  id: string;
  no_gardu: string;
  penyulang: string | null;
  kva_trafo: number;
  i_nominal: number;
  arus_r: number;
  arus_s: number;
  arus_t: number;
  max_arus: number;
  pct_nominal: number;
  level: "warning" | "overload";
  phases: ("R" | "S" | "T")[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getNominalCurrent(kva: number): number {
  return (kva * 1000) / (Math.sqrt(3) * 400);
}

/**
 * Kunci pengurut "paling baru dulu": tanggal, lalu waktu simpan sebagai pemutus.
 *
 * Keduanya boleh NULL di database meskipun tipenya menyatakan string — dan itu
 * sempat membuat halaman ini runtuh (`Cannot read properties of null`). Nilai
 * kosong sengaja diurutkan paling belakang: baris tanpa tanggal tidak boleh
 * mengklaim posisi "terakhir" untuk sebuah gardu.
 *
 * Digabung jadi satu string karena tanggalnya lebar tetap (YYYY-MM-DD), jadi
 * urutan leksikografisnya sama dengan urutan waktunya.
 */
const kunciUrut = (r: PengukuranGardu) =>
  `${r.tanggal_pengukuran ?? ""}|${r.created_at ?? ""}`;

function getHighCurrentItems(data: PengukuranGardu[]): HighCurrentItem[] {
  const result: HighCurrentItem[] = [];
  for (const row of data) {
    const perjurusan = row.perjurusan ?? {};
    for (const [key, jurusan] of Object.entries(perjurusan)) {
      if (!jurusan?.arus) continue;
      const { R = 0, S = 0, T = 0 } = jurusan.arus;
      if (R > HIGH_CURRENT_A || S > HIGH_CURRENT_A || T > HIGH_CURRENT_A) {
        result.push({
          id: row.id,
          no_gardu: row.no_gardu,
          penyulang: row.penyulang,
          jurusan: key,
          arus_r: R,
          arus_s: S,
          arus_t: T,
          max_arus: Math.max(R, S, T),
        });
      }
    }
  }
  return result.sort((a, b) => b.max_arus - a.max_arus);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePengukuranGardu(user: CurrentUser) {
  const now = new Date();
  const [data, setData] = useState<PengukuranGardu[]>([]);
  /** Hasil pemerataan pada jendela yang sama — dipakai HANYA untuk menentukan
   *  kondisi terakhir gardu, tidak ikut ke tabel Realisasi. */
  const [penyeimbangan, setPenyeimbangan] = useState<PengukuranGardu[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterPengukuran>({
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    ulp: "",
    penyulang: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllRows<PengukuranGardu>(() => {
        let query = supabaseBrowser
          .from("pengukuran_gardu")
          .select(KOLOM_PENGUKURAN)
          // Baris hasil penyeimbangan dikecualikan dari rekap: itu bukan
          // pengukuran rutin, hanya pembawa data agar hasil pemerataan bisa
          // dikirim ke AMG lewat mesin yang sudah ada. Angkanya sudah tampil
          // sebagai kartu Penyeimbangan di riwayat gardu.
          .is("hasil_penyeimbangan_id", null)
          .order("tanggal_pengukuran", { ascending: false })
          .order("created_at", { ascending: false });

        // month=0 → Semua Bulan, tidak filter tanggal
        if (filter.month !== 0) {
          const startDate = `${filter.year}-${String(filter.month).padStart(2, "0")}-01`;
          const nextMonth = filter.month === 12 ? 1 : filter.month + 1;
          const nextYear  = filter.month === 12 ? filter.year + 1 : filter.year;
          const endDate   = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
          query = query.gte("tanggal_pengukuran", startDate).lt("tanggal_pengukuran", endDate);
        }

        if (!canSeeAllUnits(user.role) && user.unit) {
          query = query.eq("petugas_unit", user.unit);
        } else if (filter.ulp) {
          query = query.eq("petugas_unit", filter.ulp);
        }

        if (filter.penyulang) query = query.eq("penyulang", filter.penyulang);

        return query;
      });

      const hasilPemerataan = await fetchAllRows<PenyeimbanganRow>(() => {
        let q = supabaseBrowser
          .from("penyeimbangan_gardu")
          // Satu literal utuh, jangan dipecah dengan `+`: supabase-js membaca
          // daftar kolomnya dari tipe literal string, dan gabungan runtime
          // membuat inferensinya jatuh ke tipe galat.
          .select("id,no_gardu,penyulang,alamat,ulp,kva_trafo,arus_r_after,arus_s_after,arus_t_after,arus_n_after,beban_kva_after,beban_pct_after,perjurusan_after,tgl_penyeimbangan,petugas_penyeimbang,jenis_pemeliharaan")
          .order("tgl_penyeimbangan", { ascending: false })
          .order("id");

        if (filter.month !== 0) {
          const startDate = `${filter.year}-${String(filter.month).padStart(2, "0")}-01`;
          const nextMonth = filter.month === 12 ? 1 : filter.month + 1;
          const nextYear  = filter.month === 12 ? filter.year + 1 : filter.year;
          const endDate   = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
          q = q.gte("tgl_penyeimbangan", startDate).lt("tgl_penyeimbangan", endDate);
        }

        // Penyaring unitnya bernama `ulp` di sini, bukan `petugas_unit`.
        if (!canSeeAllUnits(user.role) && user.unit) q = q.eq("ulp", user.unit);
        else if (filter.ulp) q = q.eq("ulp", filter.ulp);

        if (filter.penyulang) q = q.eq("penyulang", filter.penyulang);

        return q;
      });

      setData(rows);
      setPenyeimbangan(hasilPemerataan.map(dariPenyeimbangan));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  }, [user.role, user.unit, filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Supabase Realtime ────────────────────────────────────────────────────────
  const instanceId = useId();
  const filterRef = useRef(filter);
  useEffect(() => { filterRef.current = filter; }, [filter]);
  const userRoleRef = useRef(user.role);
  const userUnitRef = useRef(user.unit);
  useEffect(() => { userRoleRef.current = user.role; userUnitRef.current = user.unit; }, [user.role, user.unit]);

  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`pengukuran-gardu-rt:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pengukuran_gardu" },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as unknown as PengukuranGardu;
            const f = filterRef.current;
            const role = userRoleRef.current;
            const unit = userUnitRef.current;
            if (f.month !== 0) {
              const d = new Date(row.tanggal_pengukuran);
              if (d.getMonth() + 1 !== f.month || d.getFullYear() !== f.year) return;
            }
            if (!canSeeAllUnits(role) && unit) {
              if (row.petugas_unit !== unit) return;
            } else if (f.ulp && row.petugas_unit !== f.ulp) return;
            if (f.penyulang && row.penyulang !== f.penyulang) return;
            setData((prev) => prev.some((r) => r.id === row.id) ? prev : [row, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as unknown as PengukuranGardu;
            setData((prev) => prev.map((r) => r.id === row.id ? { ...r, ...row } : r));
          } else if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string }).id;
            if (oldId) setData((prev) => prev.filter((r) => r.id !== oldId));
          }
        }
      )
      .subscribe();

    return () => { void supabaseBrowser.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived Metrics ─────────────────────────────────────────────────────────

  /**
   * Kondisi terakhir tiap gardu pada periode ini — dari pengukuran ATAU
   * pemerataan, mana yang paling baru.
   *
   * Pemerataan diperlakukan sebagai pengukuran karena memang begitu: petugas
   * mengukur ulang setelah memindah jurusan. Tanpa penggabungan ini, gardu yang
   * terakhir disentuh lewat pemerataan hilang dari hitungan overload halaman
   * ini, sementara dashboard (yang membaca `gardu_master_state`) tetap
   * memperhitungkannya — dua angka berbeda untuk pertanyaan yang sama.
   */
  const latestData = useMemo(() => {
    const seen = new Set<string>();
    return [...data, ...penyeimbangan]
      .sort((a, b) => kunciUrut(b).localeCompare(kunciUrut(a)))
      .filter((d) => {
        if (seen.has(d.no_gardu)) return false;
        seen.add(d.no_gardu);
        return true;
      });
  }, [data, penyeimbangan]);

  /**
   * Pengukuran terakhir per gardu — TANPA hasil pemerataan.
   *
   * Khusus tabel Realisasi Pengukuran: yang didaftar di sana adalah catatan
   * pengukuran yang benar-benar ada di `pengukuran_gardu`, karena barisnya bisa
   * disunting, dihapus, dan dikirim ke AMG. Hasil pemerataan tidak punya baris
   * di tabel itu, jadi ia tetap di luar realisasi — meski kondisinya ikut semua
   * perhitungan beban lewat `latestData`.
   */
  const latestPengukuran = useMemo(() => {
    const seen = new Set<string>();
    return data.filter((d) => {
      if (seen.has(d.no_gardu)) return false;
      seen.add(d.no_gardu);
      return true;
    });
  }, [data]);

  const overloadData = useMemo(
    () => latestData.filter((d) => isOverload(d.persen_beban)),
    [latestData]
  );

  const underloadData = useMemo(
    () => latestData.filter((d) => isUnderload(d.persen_beban) && d.persen_beban >= 0),
    [latestData]
  );

  const highTempData = useMemo(
    () => latestData.filter((d) => d.suhu_trafo > HIGH_TEMP_C),
    [latestData]
  );

  const highCurrentItems = useMemo(
    () => getHighCurrentItems(latestData),
    [latestData]
  );

  const phaseOverloadItems = useMemo((): PhaseOverloadItem[] => {
    return latestData
      .flatMap((row) => {
        const iNominal = getNominalCurrent(row.kva_trafo);
        const threshold = iNominal * 0.9;
        const phases: ("R" | "S" | "T")[] = [];
        if (row.total_arus_r > threshold) phases.push("R");
        if (row.total_arus_s > threshold) phases.push("S");
        if (row.total_arus_t > threshold) phases.push("T");
        if (phases.length === 0) return [];
        const maxArus = Math.max(row.total_arus_r, row.total_arus_s, row.total_arus_t);
        return [{
          id: row.id,
          no_gardu: row.no_gardu,
          penyulang: row.penyulang,
          kva_trafo: row.kva_trafo,
          i_nominal: iNominal,
          arus_r: row.total_arus_r,
          arus_s: row.total_arus_s,
          arus_t: row.total_arus_t,
          max_arus: maxArus,
          pct_nominal: (maxArus / iNominal) * 100,
          level: (maxArus >= iNominal ? "overload" : "warning") as "overload" | "warning",
          phases,
        }];
      })
      .sort((a, b) => b.pct_nominal - a.pct_nominal);
  }, [latestData]);

  // Gardu dengan alert apapun
  const alertGarduIds = useMemo(() => {
    const ids = new Set<string>();
    overloadData.forEach((d) => ids.add(d.id));
    highTempData.forEach((d) => ids.add(d.id));
    highCurrentItems.forEach((d) => ids.add(d.id));
    phaseOverloadItems.forEach((d) => ids.add(d.id));
    return ids;
  }, [overloadData, highTempData, highCurrentItems, phaseOverloadItems]);

  // Options untuk dropdown filter
  const penyulangOptions = useMemo(
    () => [...new Set(data.map((d) => d.penyulang).filter(Boolean))] as string[],
    [data]
  );

  // Rata-rata beban (dari data terbaru per gardu)
  const avgBeban = useMemo(
    () =>
      latestData.length > 0
        ? Math.round(latestData.reduce((s, d) => s + (d.persen_beban ?? 0), 0) / latestData.length)
        : 0,
    [latestData]
  );

  // Top gardu by % beban (untuk chart) — enriched untuk tooltip & click
  const bebanChartData = useMemo(
    () =>
      [...latestData]
        .sort((a, b) => b.persen_beban - a.persen_beban)
        .slice(0, 10)
        .map((d) => ({
          id:        d.id,
          name:      d.no_gardu,
          persen:    Math.round(d.persen_beban ?? 0),
          kva:       Math.round(d.beban_kva ?? 0),
          kapasitas: d.kva_trafo,
          alamat:    d.alamat ?? "—",
          arusR:     Math.round(d.total_arus_r),
          arusS:     Math.round(d.total_arus_s),
          arusT:     Math.round(d.total_arus_t),
          suhu:      d.suhu_trafo ?? 0,
        })),
    [latestData]
  );

  /** Persentase beban tiap gardu — bahan donat distribusi. Cuma angkanya,
   *  bukan seluruh barisnya: pengelompokan embernya milik grafik itu sendiri. */
  const bebanValues = useMemo(
    () => latestData.map((d) => d.persen_beban ?? 0),
    [latestData]
  );

  // Distribusi status beban per penyulang (untuk chart kanan dashboard)
  const penyulangChartData = useMemo(() => {
    const map = new Map<string, { overload: number; warning: number; normal: number }>();
    latestData.forEach((d) => {
      const key = d.penyulang ?? "Lainnya";
      if (!map.has(key)) map.set(key, { overload: 0, warning: 0, normal: 0 });
      const v = map.get(key)!;
      if (d.persen_beban >= OVERLOAD_PCT) v.overload++;
      else if (d.persen_beban >= 60)      v.warning++;
      else                                v.normal++;
    });
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, total: v.overload + v.warning + v.normal }))
      .sort((a, b) => b.overload - a.overload || b.warning - a.warning);
  }, [latestData]);

  // Patch satu baris di local state — tanpa re-fetch semua data
  const patchRow = useCallback((id: string, patch: Partial<PengukuranGardu>) => {
    setData(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  }, []);

  // Re-fetch satu baris dari DB lalu patch ke state (dipakai setelah edit)
  const fetchAndPatchRow = useCallback(async (id: string) => {
    const { data: row } = await supabaseBrowser
      .from("pengukuran_gardu")
      .select("*")
      .eq("id", id)
      .single();
    if (row) patchRow(id, row as PengukuranGardu);
  }, [patchRow]);

  // Hapus satu baris dari DB dan local state
  const deleteRow = useCallback(async (id: string) => {
    await supabaseBrowser.from("pengukuran_gardu").delete().eq("id", id);
    setData(prev => prev.filter(r => r.id !== id));
  }, []);

  return {
    data,
    latestData,
    latestPengukuran,
    loading,
    error,
    filter,
    setFilter,
    overloadData,
    underloadData,
    highTempData,
    highCurrentItems,
    phaseOverloadItems,
    alertGarduIds,
    penyulangOptions,
    avgBeban,
    bebanChartData,
    penyulangChartData,
    bebanValues,
    refresh: fetchData,
    patchRow,
    fetchAndPatchRow,
    deleteRow,
  };
}
