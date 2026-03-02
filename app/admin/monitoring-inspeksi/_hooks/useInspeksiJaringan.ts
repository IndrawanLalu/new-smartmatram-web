"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  type CurrentUser,
  type InspeksiStatus,
  EKSEKUTOR_ROLES,
  canSeeAllUnits,
} from "@/lib/roles";

// ── Types ────────────────────────────────────────────────────────────────────

export interface InspeksiJaringan {
  id: string;
  category: string | null;
  deskripsi: string | null;
  temuan: string | null;
  status: string;
  lokasi: string | null;
  ulp: string | null;
  penyulang: string | null;
  inspektor: string | null;
  nama_inspektor: string | null;
  eksekutor: string | null;
  team_name: string | null;
  keterangan: string | null;
  koordinat: string | null;
  foto_sebelum_url: string | null;
  foto_lokasi_url: string | null;
  tgl_inspeksi: string | null;
  tgl_eksekusi: string | null;
  created_at: string;
}

export interface FilterJaringan {
  search: string;
  status: string;
  ulp: string;
  penyulang: string;
  category: string;
  eksekutor: string;
  startDate: string;
  endDate: string;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useInspeksiJaringan(user: CurrentUser) {
  const [rawData, setRawData] = useState<InspeksiJaringan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [filter, setFilter] = useState<FilterJaringan>({
    search: "",
    status: "",
    ulp: "",
    penyulang: "",
    category: "",
    eksekutor: "",
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
        .from("inspeksi")
        .select("*")
        .order("tgl_inspeksi", { ascending: false });

      // Filter unit (UP3 lihat semua)
      if (!canSeeAllUnits(user.role) && user.unit) {
        query = query.eq("ulp", user.unit);
      }

      // Tim eksekutor hanya lihat task yang ditugaskan ke mereka
      if (EKSEKUTOR_ROLES.includes(user.role)) {
        query = query.eq("eksekutor", user.role);
      }

      const { data, error: err } = await query;
      if (err) throw err;
      setRawData((data as InspeksiJaringan[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
    } finally {
      setLoading(false);
    }
  }, [user.role, user.unit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Optimistic status update
  const updateStatus = useCallback(
    async (id: string, newStatus: InspeksiStatus) => {
      setRawData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, status: newStatus } : item
        )
      );
      const { error: err } = await supabaseBrowser
        .from("inspeksi")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) fetchData();
    },
    [fetchData]
  );

  // Optimistic eksekutor update
  const updateEksekutor = useCallback(
    async (id: string, eksekutor: string | null) => {
      setRawData((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, eksekutor } : item
        )
      );
      const { error: err } = await supabaseBrowser
        .from("inspeksi")
        .update({ eksekutor, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (err) fetchData();
    },
    [fetchData]
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
    if (filter.category) {
      data = data.filter((d) => d.category === filter.category);
    }
    if (filter.eksekutor) {
      data = data.filter((d) => d.eksekutor === filter.eksekutor);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      data = data.filter(
        (d) =>
          d.penyulang?.toLowerCase().includes(q) ||
          d.lokasi?.toLowerCase().includes(q) ||
          d.temuan?.toLowerCase().includes(q) ||
          d.deskripsi?.toLowerCase().includes(q) ||
          d.inspektor?.toLowerCase().includes(q)
      );
    }

    return data;
  }, [rawData, filter]);

  const paginatedData = useMemo(
    () => filteredData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredData, page]
  );

  const totalPages = Math.ceil(filteredData.length / PAGE_SIZE);

  // Derived options for dropdowns (dari rawData bukan filteredData)
  const ulpOptions = useMemo(
    () => [...new Set(rawData.map((d) => d.ulp).filter(Boolean))] as string[],
    [rawData]
  );
  const penyulangOptions = useMemo(
    () =>
      [...new Set(rawData.map((d) => d.penyulang).filter(Boolean))] as string[],
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
    ulpOptions,
    penyulangOptions,
    updateStatus,
    updateEksekutor,
    refresh: fetchData,
  };
}
