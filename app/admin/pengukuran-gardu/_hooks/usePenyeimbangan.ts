"use client";

import { useState, useEffect, useCallback, useId, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { antreKeAmg } from "../_lib/amgQueue";
import type { JurusanData, PengukuranGardu } from "./usePengukuranGardu";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PenyeimbanganGardu {
  id: string;
  pengukuran_id: string | null; // TEXT (matches pengukuran_gardu.id type)
  no_gardu: string;
  penyulang: string | null;
  alamat: string | null;
  ulp: string | null;
  kva_trafo: number;

  arus_r_before: number;
  arus_s_before: number;
  arus_t_before: number;
  arus_n_before: number;
  beban_kva_before: number;
  beban_pct_before: number;
  perjurusan_before: Record<string, JurusanData>;

  arus_r_after: number;
  arus_s_after: number;
  arus_t_after: number;
  arus_n_after: number;
  beban_kva_after: number;
  beban_pct_after: number;
  perjurusan_after: Record<string, JurusanData>;

  tgl_penyeimbangan: string;
  petugas_penyeimbang: string | null;
  catatan: string | null;
  jenis_pemeliharaan: string | null;
  created_at: string;

  /** Bukti foto per fasa dari aplikasi mobile — empat foto disimpan terpisah,
   *  disusun 2×2 saat ditampilkan. Null untuk rekap yang diinput lewat web. */
  foto_total: FotoFasa | null;
  foto_perjurusan: Record<string, FotoFasa> | null;

  /** 'Dikerjakan' = petugas sudah mengklaim tapi belum menyetor hasil. */
  status: string;
  petugas_uid: string | null;
  diklaim_at: string | null;

  /** Baris pengukuran "setelah" — pembawa data ke AMG. Array karena PostgREST
   *  mengembalikan relasi terbalik sebagai daftar; isinya paling banyak satu. */
  pengukuran_after?: {
    id: string;
    amg_queued_at: string | null;
    amg_sent_at: string | null;
    amg_error: string | null;
    amg_attempts: number;
  }[];
}

/** Satu foto beserta waktu pengambilannya (patokan server, jatuh ke jam HP). */
export interface FotoSlot {
  url: string;
  waktu: string;
  sumber_waktu: "server" | "hp";
}

/** Foto per fasa. Fasa yang arusnya 0 tidak difoto, jadi bisa tidak ada.
 *
 *  Nilainya bisa `string` (bentuk lama, sebelum cap waktu) atau `FotoSlot`.
 *  Rekap yang tersimpan sebelum 3 Agustus 2026 memakai bentuk lama — baca
 *  SELALU lewat `urlFoto()` / `waktuFoto()`, jangan diakses langsung. */
export type FotoFasa = Partial<Record<"R" | "S" | "T" | "N", FotoSlot | string>>;

export const urlFoto = (v?: FotoSlot | string): string | undefined =>
  typeof v === "string" ? v : v?.url;

export const waktuFoto = (v?: FotoSlot | string): string | undefined =>
  typeof v === "string" ? undefined : v?.waktu;

export const sumberWaktuFoto = (v?: FotoSlot | string): string | undefined =>
  typeof v === "string" ? undefined : v?.sumber_waktu;

export interface SavePenyeimbanganInput {
  pengukuranRow: PengukuranGardu;
  perjurusanAfter: Record<string, JurusanData>;
  arusRAfter: number;
  arusSAfter: number;
  arusTAfter: number;
  arusNAfter: number;
  tegRNAfter: number;
  tegSNAfter: number;
  tegTNAfter: number;
  tglPenyeimbangan: string;
  petugasPenyeimbang: string;
  catatan: string;
  jenisPemeliharaan: string;
}

export interface UpdatePenyeimbanganInput {
  id: string;
  /** Pengukuran ASAL (kondisi sebelum). Disimpan sebagai rujukan saja — JANGAN
   *  dipakai untuk menulis apa pun. Menimpanya menghapus bukti kondisi sebelum. */
  pengukuranId: string | null;
  kvaTrafo: number;
  perjurusanAfter: Record<string, JurusanData>;
  arusRAfter: number;
  arusSAfter: number;
  arusTAfter: number;
  arusNAfter: number;
  tegRNAfter: number;
  tegSNAfter: number;
  tegTNAfter: number;
  tglPenyeimbangan: string;
  petugasPenyeimbang: string;
  catatan: string;
  jenisPemeliharaan: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Daya trafo menurut master gardu.
 *
 * `null` kalau gardunya belum ada di master — pemanggilnya lalu jatuh ke kVA
 * pengukuran. Lebih baik memakai angka lapangan daripada menolak menyimpan
 * pekerjaan yang sudah dikerjakan petugas.
 */
async function ambilKvaMaster(kode: string, ulp: string | null): Promise<number | null> {
  let q = supabaseBrowser.from("gardu").select("daya").eq("kode", kode);
  // Kode gardu tidak unik lintas ULP — tanpa penyaring ini bisa terambil daya
  // gardu ULP lain yang kebetulan berkode sama.
  if (ulp) q = q.eq("ulp", ulp);
  const { data } = await q.limit(1).maybeSingle();
  const daya = (data as { daya: number | null } | null)?.daya;
  return typeof daya === "number" && daya > 0 ? daya : null;
}

export function usePenyeimbangan(ulp: string) {
  const now = new Date();
  const [data, setData] = useState<PenyeimbanganGardu[]>([]);
  /** id pengukuran yang SUDAH pernah diseimbangkan, LINTAS BULAN.
   *
   *  Sengaja terpisah dari `data`: status "sudah seimbang" di tabel Gardu Sudah
   *  di-WO tidak boleh ikut jendela bulan yang dipilih di rekap. Dulu memakai
   *  `data`, sehingga gardu yang diratakan Juli tampak belum seimbang begitu
   *  rekap dipindah ke Agustus — pekerjaannya seolah hilang. */
  const [pengukuranSeimbang, setPengukuranSeimbang] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [filterJenis, setFilterJenis] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear  = month === 12 ? year + 1 : year;
      const endDate   = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

      let query = supabaseBrowser
        .from("penyeimbangan_gardu")
        .select(
          "*, pengukuran_after:pengukuran_gardu!hasil_penyeimbangan_id(id,amg_queued_at,amg_sent_at,amg_error,amg_attempts)",
        )
        .gte("tgl_penyeimbangan", startDate)
        .lt("tgl_penyeimbangan", endDate)
        .order("tgl_penyeimbangan", { ascending: false });

      if (ulp) query = query.eq("ulp", ulp);

      const { data: rows, error: err } = await query;
      if (err) throw err;
      setData((rows as PenyeimbanganGardu[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  }, [month, year, ulp]);

  /** Hanya kolom id — muatannya ringan meski dikumpulkan lintas tahun.
   *  Paginasi wajib: batas 1000 baris PostgREST akan memotong diam-diam begitu
   *  rekap menumpuk, dan gejalanya berupa status yang "hilang" tanpa error. */
  const fetchSeimbang = useCallback(async () => {
    let query = supabaseBrowser
      .from("penyeimbangan_gardu")
      .select("pengukuran_id")
      .not("pengukuran_id", "is", null);
    if (ulp) query = query.eq("ulp", ulp);

    const rows = await fetchAllRows<{ pengukuran_id: string }>(() => query);
    setPengukuranSeimbang(new Set(rows.map((r) => r.pengukuran_id)));
  }, [ulp]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchSeimbang(); }, [fetchSeimbang]);

  // ── Supabase Realtime: status kirim AMG ──────────────────────────────────────
  // Kolom `amg_*` diubah oleh AGEN LOKAL, di luar aplikasi ini. Tanpa langganan
  // ini barisnya bertahan di "ANTRE" sampai halaman dimuat ulang — persis
  // keluhan yang muncul, dan bedanya dengan tabel Pengukuran Gardu yang memang
  // sudah punya langganan serupa.
  //
  // Yang didengarkan `pengukuran_gardu`, bukan `penyeimbangan_gardu`: di situlah
  // kolom amg_* berada, terhubung lewat `hasil_penyeimbangan_id`.
  const instanceId = useId();
  useEffect(() => {
    const channel = supabaseBrowser
      .channel(`penyeimbangan-amg-rt:${instanceId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pengukuran_gardu" },
        (payload) => {
          const baru = payload.new as {
            id?: string;
            amg_queued_at?: string | null;
            amg_sent_at?: string | null;
            amg_error?: string | null;
            amg_attempts?: number | null;
          };
          if (!baru.id) return;

          setData((prev) => {
            let kena = false;
            const next = prev.map((item) => {
              const after = item.pengukuran_after?.[0];
              if (!after || after.id !== baru.id) return item;
              kena = true;
              return {
                ...item,
                pengukuran_after: [{
                  ...after,
                  amg_queued_at: baru.amg_queued_at ?? null,
                  amg_sent_at: baru.amg_sent_at ?? null,
                  amg_error: baru.amg_error ?? null,
                  amg_attempts: baru.amg_attempts ?? 0,
                }],
              };
            });
            // Sebagian besar perubahan `pengukuran_gardu` tidak ada sangkut
            // pautnya dengan rekap ini; kembalikan acuan yang sama supaya tidak
            // memicu render ulang percuma.
            return kena ? next : prev;
          });
        },
      )
      .subscribe();

    return () => { void supabaseBrowser.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Client-side filter by jenis — data lengkap tetap tersedia untuk WO table
  const filteredData = useMemo(
    () => (!filterJenis ? data : data.filter((d) => d.jenis_pemeliharaan === filterJenis)),
    [data, filterJenis]
  );

  const savePenyeimbangan = useCallback(async (input: SavePenyeimbanganInput): Promise<string | null> => {
    const row = input.pengukuranRow;

    // Hitung beban after dari arus × tegangan
    const bebanKvaAfter =
      (input.arusRAfter * input.tegRNAfter +
        input.arusSAfter * input.tegSNAfter +
        input.arusTAfter * input.tegTNAfter) / 1000;

    // Daya trafo diambil dari MASTER, bukan dari baris pengukuran.
    //
    // kVA di baris pengukuran diketik petugas di lapangan dan bisa salah baca
    // papan nama. Dulu angka itu ikut tersalin ke sini, sehingga memperbaiki
    // kVA di pengukuran tidak membetulkan rekap pemerataannya — gardunya tetap
    // terbaca overload selamanya. AM197 contohnya: diketik 100 kVA padahal 160,
    // membuat beban 84,9 kVA terbaca 84,9% (overload) alih-alih 53,1%.
    const kvaMaster = await ambilKvaMaster(row.no_gardu, row.petugas_unit);
    const kvaDipakai = kvaMaster ?? row.kva_trafo;
    const bebanPctAfter = kvaDipakai > 0 ? (bebanKvaAfter / kvaDipakai) * 100 : 0;

    try {
      // 1. Insert rekap penyeimbangan
      const { error: insertErr } = await supabaseBrowser
        .from("penyeimbangan_gardu")
        .insert({
          pengukuran_id:      row.id,
          no_gardu:           row.no_gardu,
          penyulang:          row.penyulang,
          alamat:             row.alamat,
          ulp:                row.petugas_unit,
          // Yang dicatat adalah kVA yang BENAR-BENAR dipakai menghitung
          // persentase di atas, supaya baris ini bisa diaudit sendiri.
          kva_trafo:          kvaDipakai,

          arus_r_before:      row.total_arus_r,
          arus_s_before:      row.total_arus_s,
          arus_t_before:      row.total_arus_t,
          arus_n_before:      row.total_arus_n,
          beban_kva_before:   row.beban_kva,
          beban_pct_before:   row.persen_beban,
          perjurusan_before:  row.perjurusan ?? {},

          arus_r_after:       input.arusRAfter,
          arus_s_after:       input.arusSAfter,
          arus_t_after:       input.arusTAfter,
          arus_n_after:       input.arusNAfter,
          beban_kva_after:    bebanKvaAfter,
          beban_pct_after:    bebanPctAfter,
          perjurusan_after:   input.perjurusanAfter,

          tgl_penyeimbangan:   input.tglPenyeimbangan,
          petugas_penyeimbang: input.petugasPenyeimbang || null,
          catatan:             input.catatan || null,
          jenis_pemeliharaan:  input.jenisPemeliharaan || null,
        });

      if (insertErr) throw insertErr;

      // pengukuran_gardu TIDAK di-update — data historis pengukuran harus immutable.
      // Kondisi terkini gardu dibaca dari gardu_latest_state view (merge pengukuran + penyeimbangan).

      // Daftar "sudah seimbang" ikut disegarkan: rekap baru harus langsung
      // terlihat di tabel Gardu Sudah di-WO, apa pun bulan yang sedang dipilih.
      await Promise.all([fetchData(), fetchSeimbang()]);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Gagal menyimpan";
    }
  }, [fetchData, fetchSeimbang]);

  const updatePenyeimbangan = useCallback(async (input: UpdatePenyeimbanganInput): Promise<string | null> => {
    const bebanKvaAfter =
      (input.arusRAfter * input.tegRNAfter +
        input.arusSAfter * input.tegSNAfter +
        input.arusTAfter * input.tegTNAfter) / 1000;
    const bebanPctAfter = input.kvaTrafo > 0 ? (bebanKvaAfter / input.kvaTrafo) * 100 : 0;

    try {
      const { error: updateErr } = await supabaseBrowser
        .from("penyeimbangan_gardu")
        .update({
          arus_r_after:        input.arusRAfter,
          arus_s_after:        input.arusSAfter,
          arus_t_after:        input.arusTAfter,
          arus_n_after:        input.arusNAfter,
          beban_kva_after:     bebanKvaAfter,
          beban_pct_after:     bebanPctAfter,
          perjurusan_after:    input.perjurusanAfter,
          tgl_penyeimbangan:   input.tglPenyeimbangan,
          petugas_penyeimbang: input.petugasPenyeimbang || null,
          catatan:             input.catatan || null,
          jenis_pemeliharaan:  input.jenisPemeliharaan || null,
        })
        .eq("id", input.id);

      if (updateErr) throw updateErr;

      // Koreksi ikut diterapkan ke baris pengukuran "setelah" — pembawa data ke
      // AMG — supaya angka yang dikirim sama dengan rekap yang sudah dibetulkan.
      // Dicocokkan lewat FK, jadi tidak perlu tahu id-nya lebih dulu.
      //
      // Pengukuran ASAL (input.pengukuranId) SENGAJA TIDAK DISENTUH. Dulu baris
      // itu ikut ditimpa nilai sesudah, sehingga menyunting satu rekap diam-diam
      // menghapus bukti kondisi sebelum — dan baris anomali yang jadi dasar WO
      // mendadak terlihat sehat. Kondisi sesudah sudah punya barisnya sendiri.
      await supabaseBrowser
        .from("pengukuran_gardu")
        .update({
          total_arus_r:       input.arusRAfter,
          total_arus_s:       input.arusSAfter,
          total_arus_t:       input.arusTAfter,
          total_arus_n:       input.arusNAfter,
          total_teg_rn:       input.tegRNAfter,
          total_teg_sn:       input.tegSNAfter,
          total_teg_tn:       input.tegTNAfter,
          beban_kva:          bebanKvaAfter,
          persen_beban:       bebanPctAfter,
          perjurusan:         input.perjurusanAfter,
          tanggal_pengukuran: input.tglPenyeimbangan,
        })
        .eq("hasil_penyeimbangan_id", input.id);

      await fetchData();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Gagal mengupdate";
    }
  }, [fetchData]);

  /** Antrekan hasil pemerataan ke AMG lewat baris pengukuran "setelah".
   *  Memakai endpoint yang sama dengan pengukuran biasa — agen lokal yang
   *  mengirim, karena AMG hanya bisa dijangkau dari jaringan intranet PLN. */
  const kirimKeAmg = useCallback(async (row: PenyeimbanganGardu): Promise<string | null> => {
    const after = row.pengukuran_after?.[0];
    if (!after) {
      return "Hasil ini belum punya baris pengukuran untuk AMG. Hanya pekerjaan yang dicatat lewat aplikasi mobile yang bisa dikirim.";
    }
    const err = await antreKeAmg(after.id);
    if (err) return err;
    await fetchData();
    return null;
  }, [fetchData]);

  const deleteItem = useCallback(async (id: string) => {
    const { error } = await supabaseBrowser.from("penyeimbangan_gardu").delete().eq("id", id);
    if (error) { await fetchData(); return; }
    setData((prev) => prev.filter((item) => item.id !== id));
    // Gardu-nya kembali berstatus belum seimbang di tabel Gardu Sudah di-WO.
    await fetchSeimbang();
  }, [fetchData, fetchSeimbang]);

  return { data, filteredData, pengukuranSeimbang, loading, error, month, setMonth, year, setYear, filterJenis, setFilterJenis, savePenyeimbangan, updatePenyeimbangan, kirimKeAmg, deleteItem, refresh: fetchData };
}
