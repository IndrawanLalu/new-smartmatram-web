"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

// ── Thresholds ────────────────────────────────────────────────────────────────

export const OVERLOAD_PCT = 80;
export const UNDERLOAD_PCT = 20;
export const HIGH_CURRENT_A = 160;
export const HIGH_TEMP_C = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JurusanData {
  arus: { R: number; S: number; T: number; N: number };
  tegangan: { R: number; S: number; T: number };
}

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
  created_at: string;
  wo_sent_at: string | null;
  amg_sent_at: string | null;
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
      let query = supabaseBrowser
        .from("pengukuran_gardu")
        .select("*")
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

      if (filter.penyulang) {
        query = query.eq("penyulang", filter.penyulang);
      }

      const { data: rows, error: err } = await query;
      if (err) throw err;
      setData((rows as PengukuranGardu[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  }, [user.role, user.unit, filter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Derived Metrics ─────────────────────────────────────────────────────────

  // Data sudah sort tanggal DESC — ambil satu (terbaru) per no_gardu
  const latestData = useMemo(() => {
    const seen = new Set<string>();
    return data.filter((d) => {
      if (seen.has(d.no_gardu)) return false;
      seen.add(d.no_gardu);
      return true;
    });
  }, [data]);

  const overloadData = useMemo(
    () => latestData.filter((d) => d.persen_beban >= OVERLOAD_PCT),
    [latestData]
  );

  const underloadData = useMemo(
    () => latestData.filter((d) => d.persen_beban < UNDERLOAD_PCT && d.persen_beban >= 0),
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

  // Top gardu by % beban (untuk chart)
  const bebanChartData = useMemo(
    () =>
      [...latestData]
        .sort((a, b) => b.persen_beban - a.persen_beban)
        .slice(0, 20)
        .map((d) => ({
          name: d.no_gardu,
          persen: Math.round(d.persen_beban ?? 0),
          kva: Math.round(d.beban_kva ?? 0),
          kapasitas: d.kva_trafo,
        })),
    [latestData]
  );

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
    refresh: fetchData,
    patchRow,
    fetchAndPatchRow,
    deleteRow,
  };
}
