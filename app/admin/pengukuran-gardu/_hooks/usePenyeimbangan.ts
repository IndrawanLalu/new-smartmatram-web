"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
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
}

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

export function usePenyeimbangan(ulp: string) {
  const now = new Date();
  const [data, setData] = useState<PenyeimbanganGardu[]>([]);
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
        .select("*")
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

  useEffect(() => { fetchData(); }, [fetchData]);

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
    const bebanPctAfter = row.kva_trafo > 0 ? (bebanKvaAfter / row.kva_trafo) * 100 : 0;

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
          kva_trafo:          row.kva_trafo,

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

      // 2. Update pengukuran_gardu dengan data baru (tanggal_pengukuran tidak berubah)
      const { error: updateErr } = await supabaseBrowser
        .from("pengukuran_gardu")
        .update({
          total_arus_r:   input.arusRAfter,
          total_arus_s:   input.arusSAfter,
          total_arus_t:   input.arusTAfter,
          total_arus_n:   input.arusNAfter,
          total_teg_rn:   input.tegRNAfter,
          total_teg_sn:   input.tegSNAfter,
          total_teg_tn:   input.tegTNAfter,
          beban_kva:      bebanKvaAfter,
          persen_beban:   bebanPctAfter,
          perjurusan:     input.perjurusanAfter,
        })
        .eq("id", row.id);

      if (updateErr) throw updateErr;

      await fetchData();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Gagal menyimpan";
    }
  }, [fetchData]);

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

      // Sync back to pengukuran_gardu if linked
      if (input.pengukuranId) {
        await supabaseBrowser
          .from("pengukuran_gardu")
          .update({
            total_arus_r: input.arusRAfter,
            total_arus_s: input.arusSAfter,
            total_arus_t: input.arusTAfter,
            total_arus_n: input.arusNAfter,
            beban_kva:    bebanKvaAfter,
            persen_beban: bebanPctAfter,
            perjurusan:   input.perjurusanAfter,
          })
          .eq("id", input.pengukuranId);
      }

      await fetchData();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Gagal mengupdate";
    }
  }, [fetchData]);

  const deleteItem = useCallback(async (id: string) => {
    await supabaseBrowser.from("penyeimbangan_gardu").delete().eq("id", id);
    await fetchData();
  }, [fetchData]);

  return { data, filteredData, loading, error, month, setMonth, year, setYear, filterJenis, setFilterJenis, savePenyeimbangan, updatePenyeimbangan, deleteItem, refresh: fetchData };
}
