"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { detectAnomali, type AnomalySettings, DEFAULT_SETTINGS } from "../_utils/detectAnomali";
import type { JurusanData } from "./usePengukuranGardu";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GarduLatestState {
  source_id: string;
  event_type: "pengukuran" | "penyeimbangan";
  event_date: string;
  no_gardu: string;
  penyulang: string | null;
  alamat: string | null;
  kva_trafo: number;
  petugas_unit: string;
  petugas_nama: string | null;
  persen_beban: number;
  beban_kva: number;
  suhu_trafo: number | null;
  total_arus_r: number;
  total_arus_s: number;
  total_arus_t: number;
  total_arus_n: number;
  total_teg_rn: number | null;
  total_teg_sn: number | null;
  total_teg_tn: number | null;
  total_teg_rs: number | null;
  total_teg_st: number | null;
  total_teg_rt: number | null;
  perjurusan: Record<string, JurusanData> | null;
  jenis_pemeliharaan: string | null;
  wo_sent_at: string | null;
}

export interface GarduStatusFilter {
  search: string;
  penyulang: string;
  anomaliOnly: boolean;
  kvaTrafo: string;   // "" = semua, atau nilai kva spesifik
  minBeban: number;   // 0 = semua, atau minimum persen beban
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

// ── Hook: useGarduStatus ──────────────────────────────────────────────────────

export function useGarduStatus(
  user: CurrentUser,
  ulp: string,
  settings: AnomalySettings = DEFAULT_SETTINGS,
  enabled = true,
) {
  const [rawData, setRawData] = useState<GarduLatestState[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GarduStatusFilter>({
    search: "", penyulang: "", anomaliOnly: false, kvaTrafo: "", minBeban: 0,
  });
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabaseBrowser
        .from("gardu_latest_state")
        .select("*")
        .order("event_date", { ascending: false });

      if (!canSeeAllUnits(user.role) && user.unit) {
        query = query.eq("petugas_unit", user.unit);
      } else if (ulp) {
        query = query.eq("petugas_unit", ulp);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setRawData((data as GarduLatestState[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  }, [user.role, user.unit, ulp]);

  useEffect(() => { if (enabled) fetchData(); }, [fetchData, enabled]);

  // Anomali detection per gardu — memoized
  const anomaliMap = useMemo(
    () => new Map(rawData.map((row) => [row.no_gardu, detectAnomali(row, settings)])),
    [rawData, settings]
  );

  const filteredData = useMemo(() => {
    let data = rawData;

    if (filter.penyulang) {
      data = data.filter((d) => d.penyulang === filter.penyulang);
    }
    if (filter.kvaTrafo) {
      const kva = Number(filter.kvaTrafo);
      data = data.filter((d) => d.kva_trafo === kva);
    }
    if (filter.minBeban > 0) {
      data = data.filter((d) => d.persen_beban >= filter.minBeban);
    }
    if (filter.anomaliOnly) {
      data = data.filter((d) => anomaliMap.get(d.no_gardu)?.isAnomali);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      data = data.filter(
        (d) =>
          d.no_gardu.toLowerCase().includes(q) ||
          d.penyulang?.toLowerCase().includes(q) ||
          d.alamat?.toLowerCase().includes(q)
      );
    }

    return data;
  }, [rawData, filter, anomaliMap]);

  const paginatedData = useMemo(
    () => filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredData, page]
  );

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  const penyulangOptions = useMemo(
    () => [...new Set(rawData.map((d) => d.penyulang).filter(Boolean))] as string[],
    [rawData]
  );

  const anomaliCount = useMemo(
    () => rawData.filter((d) => anomaliMap.get(d.no_gardu)?.isAnomali).length,
    [rawData, anomaliMap]
  );

  const penyeimbanganCount = useMemo(
    () => rawData.filter((d) => d.event_type === "penyeimbangan").length,
    [rawData]
  );

  const avgBeban = useMemo(
    () => rawData.length > 0
      ? Math.round(rawData.reduce((s, d) => s + d.persen_beban, 0) / rawData.length)
      : 0,
    [rawData]
  );

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
