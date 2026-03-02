"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchSheetData } from "@/lib/sheets";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { parseIndonesianDate } from "@/app/admin/dashboard/_hooks/useGangguanData";
import type { CurrentUser } from "@/lib/roles";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GangguanItem {
  tanggal: string;
  parsedDate: Date | null;
  ulp: string;
  penyulang: string;
  durasi: string;
  jamPadam: string;
  penyebab: string;
  indikator: string;
}

export interface InspeksiItem {
  id: string;
  lokasi: string | null;
  penyulang: string | null;
  ulp: string | null;
  status: string;
  category: string | null;
  tgl_inspeksi: string | null;
}

export interface GarduMarker {
  kode: string;
  nama: string;
  lat: number;
  lng: number;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useCommandCenter(user: CurrentUser | null) {
  const [gangguanFeed, setGangguanFeed] = useState<GangguanItem[]>([]);
  const [inspeksiFeed, setInspeksiFeed] = useState<InspeksiItem[]>([]);
  const [garduList, setGarduList] = useState<GarduMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      // 1. Gangguan dari Google Sheets
      const rawGangguan = await fetchSheetData("gangguanPenyulang", "A:S");
      const filtered = rawGangguan
        .filter((r) => {
          if (!r.TANGGAL) return false;
          if (user?.unit && r.ULP?.trim().toUpperCase() !== user.unit.toUpperCase()) return false;
          return true;
        })
        .map((r): GangguanItem => ({
          tanggal: r.TANGGAL ?? "",
          parsedDate: parseIndonesianDate(r.TANGGAL),
          ulp: r.ULP ?? "",
          penyulang: r.PENYULANG_GANGGUAN ?? r["PENYULANG GANGGUAN"] ?? "",
          durasi: r.DURASI ?? "",
          jamPadam: r.JAM_PADAM ?? r["JAM PADAM"] ?? "",
          penyebab: r.PENYEBAB_GANGGUAN ?? r["PENYEBAB GANGGUAN"] ?? "",
          indikator: r.INDIKATOR ?? "",
        }))
        .sort((a, b) => {
          const ta = a.parsedDate?.getTime() ?? 0;
          const tb = b.parsedDate?.getTime() ?? 0;
          return tb - ta;
        })
        .slice(0, 50);
      setGangguanFeed(filtered);

      // 2. Inspeksi terbaru dari Supabase
      let inspQuery = supabaseBrowser
        .from("inspeksi")
        .select("id, lokasi, penyulang, ulp, status, category, tgl_inspeksi")
        .order("tgl_inspeksi", { ascending: false })
        .limit(20);
      if (user?.unit) inspQuery = inspQuery.eq("ulp", user.unit);
      const { data: inspData } = await inspQuery;
      setInspeksiFeed((inspData ?? []) as InspeksiItem[]);

      // 3. Gardu list dari Supabase (untuk map markers)
      const { data: garduData } = await supabaseBrowser
        .from("gardu")
        .select("kode, nama, lat, lng")
        .not("lat", "is", null)
        .not("lng", "is", null);
      setGarduList(
        (garduData ?? [])
          .filter((g) => g.lat && g.lng)
          .map((g) => ({ kode: g.kode, nama: g.nama, lat: Number(g.lat), lng: Number(g.lng) }))
      );

      setLastRefresh(new Date());
    } catch {
      // silent — panels tetap tampil dengan data lama
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  return { gangguanFeed, inspeksiFeed, garduList, loading, lastRefresh, refresh: fetchAll };
}
