"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  type CurrentUser,
  type InspeksiStatus,
  type UrgencyLevel,
  canSeeAllUnits,
  calcRemainingDays,
  getUrgencyLevel,
} from "@/lib/roles";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InspeksiPohon {
  id: string;
  deskripsi: string | null;
  eksekutor: string | null;
  petugas: string | null;
  inspektor: string | null;
  team_name: string | null;
  keterangan: string | null;
  penyulang: string | null;
  lokasi: string | null;
  ulp: string | null;
  status: string;
  jenis_pohon: string | null;
  tinggi_pohon: number | null;
  jarak_ke_jaringan: number | null;
  tingkat_risiko: string | null;
  prediksi_inspektur: string | null;
  tindakan_rekomendasi: string | null;
  foto_sebelum_url: string | null;
  foto_lokasi_url: string | null;
  foto_sesudah_url: string | null;
  koordinat: string | null;
  tgl_inspeksi: string | null;
  tgl_eksekusi: string | null;
  created_at: string;
  // Computed
  remainingDays: number;
  urgency: UrgencyLevel;
}

export interface FilterPohon {
  search: string;
  status: string;
  ulp: string;
  penyulang: string;
  tingkatRisiko: string;
  urgency: string;
  startDate: string;
  endDate: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useInspeksiPohon(user: CurrentUser) {
  const [rawData, setRawData] = useState<InspeksiPohon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [filter, setFilter] = useState<FilterPohon>({
    search: "",
    status: "",
    ulp: "",
    penyulang: "",
    tingkatRisiko: "",
    urgency: "",
    startDate: new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
  });

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabaseBrowser
        .from("inspeksi_pohon")
        .select("*")
        .order("tgl_inspeksi", { ascending: false })
        .order("created_at", { ascending: false });

      if (!canSeeAllUnits(user.role) && user.unit) {
        query = query.eq("ulp", user.unit);
      }

      // PERABASAN hanya lihat task milik mereka
      if (user.role === "PERABASAN") {
        query = query.eq("eksekutor", "PERABASAN");
      }

      const { data, error: err } = await query;
      if (err) throw err;

      // Hitung prediksi sisa hari
      const enriched: InspeksiPohon[] = (
        (data ?? []) as Omit<InspeksiPohon, "remainingDays" | "urgency">[]
      ).map((item) => {
        const remaining =
          item.tgl_inspeksi && item.prediksi_inspektur
            ? calcRemainingDays(item.tgl_inspeksi, item.prediksi_inspektur)
            : 999;
        return {
          ...item,
          remainingDays: remaining,
          urgency: getUrgencyLevel(remaining),
        };
      });

      // Sort: terbaru dulu (tgl_inspeksi DESC)
      enriched.sort((a, b) =>
        (b.tgl_inspeksi ?? "").localeCompare(a.tgl_inspeksi ?? "")
      );
      setRawData(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  }, [user.role, user.unit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = useCallback(
    async (id: string, newStatus: InspeksiStatus) => {
      setRawData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: newStatus } : item,
        ),
      );
      const { error: err } = await supabaseBrowser
        .from("inspeksi_pohon")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) fetchData();
    },
    [fetchData],
  );

  // Optimistic team update
  const updateTeam = useCallback(
    async (id: string, teamName: string | null) => {
      setRawData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, team_name: teamName } : item,
        ),
      );
      const { error: err } = await supabaseBrowser
        .from("inspeksi_pohon")
        .update({ team_name: teamName, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) fetchData();
    },
    [fetchData],
  );

  // Update eksekutor
  const updateEksekutor = useCallback(
    async (id: string, eksekutor: string | null) => {
      setRawData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, eksekutor } : item,
        ),
      );
      const { error: err } = await supabaseBrowser
        .from("inspeksi_pohon")
        .update({ eksekutor, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) fetchData();
    },
    [fetchData],
  );

  // Update keterangan
  const updateKeterangan = useCallback(
    async (id: string, keterangan: string) => {
      setRawData((prev) =>
        prev.map((item) => (item.id === id ? { ...item, keterangan } : item)),
      );
      const { error: err } = await supabaseBrowser
        .from("inspeksi_pohon")
        .update({ keterangan, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) fetchData();
    },
    [fetchData],
  );

  // Update deskripsi
  const updateDeskripsi = useCallback(
    async (id: string, deskripsi: string) => {
      setRawData((prev) =>
        prev.map((item) => (item.id === id ? { ...item, deskripsi } : item)),
      );
      const { error: err } = await supabaseBrowser
        .from("inspeksi_pohon")
        .update({ deskripsi, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) fetchData();
    },
    [fetchData],
  );

  // Upload foto sesudah ke Supabase Storage (bucket: inspections/pohon/sesudah/) + update DB
  const uploadFotoSesudah = useCallback(
    async (id: string, file: File): Promise<string> => {
      const ext = file.name.split(".").pop() ?? "jpg";
      const storagePath = `pohon/sesudah/${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabaseBrowser.storage
        .from("inspections")
        .upload(storagePath, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: urlData } = supabaseBrowser.storage
        .from("inspections")
        .getPublicUrl(storagePath);
      const url = urlData.publicUrl;

      const { error: dbErr } = await supabaseBrowser
        .from("inspeksi_pohon")
        .update({ foto_sesudah_url: url, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (dbErr) throw dbErr;

      setRawData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, foto_sesudah_url: url } : item,
        ),
      );
      return url;
    },
    [],
  );

  // Delete inspeksi pohon (optimistic)
  const deleteInspeksi = useCallback(
    async (id: string) => {
      setRawData((prev) => prev.filter((item) => item.id !== id));
      const { error: err } = await supabaseBrowser
        .from("inspeksi_pohon")
        .delete()
        .eq("id", id);
      if (err) fetchData();
    },
    [fetchData],
  );

  const filteredData = useMemo(() => {
    let data = rawData;

    if (filter.startDate) {
      data = data.filter((d) => (d.tgl_inspeksi ?? "") >= filter.startDate);
    }
    if (filter.endDate) {
      data = data.filter((d) => (d.tgl_inspeksi ?? "") <= filter.endDate);
    }
    if (filter.status) {
      data = data.filter((d) => d.status === filter.status);
    }
    if (filter.ulp) {
      data = data.filter((d) => d.ulp === filter.ulp);
    }
    if (filter.penyulang) {
      data = data.filter((d) => d.penyulang === filter.penyulang);
    }
    if (filter.tingkatRisiko) {
      data = data.filter((d) => d.tingkat_risiko === filter.tingkatRisiko);
    }
    if (filter.urgency) {
      data = data.filter((d) => d.urgency === filter.urgency);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      data = data.filter(
        (d) =>
          d.penyulang?.toLowerCase().includes(q) ||
          d.deskripsi?.toLowerCase().includes(q) ||
          d.jenis_pohon?.toLowerCase().includes(q) ||
          d.inspektor?.toLowerCase().includes(q) ||
          d.team_name?.toLowerCase().includes(q),
      );
    }

    return data;
  }, [rawData, filter]);

  const paginatedData = useMemo(
    () => filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredData, page],
  );

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  const sanggatUrgentCount = useMemo(
    () => rawData.filter((d) => d.urgency === "SANGAT URGENT").length,
    [rawData],
  );

  const ulpOptions = useMemo(
    () => [...new Set(rawData.map((d) => d.ulp).filter(Boolean))] as string[],
    [rawData],
  );
  const penyulangOptions = useMemo(
    () =>
      [...new Set(rawData.map((d) => d.penyulang).filter(Boolean))] as string[],
    [rawData],
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
    sanggatUrgentCount,
    ulpOptions,
    penyulangOptions,
    updateStatus,
    updateEksekutor,
    updateTeam,
    updateKeterangan,
    updateDeskripsi,
    uploadFotoSesudah,
    deleteInspeksi,
    refresh: fetchData,
  };
}
