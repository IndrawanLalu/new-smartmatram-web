"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchSheetData } from "@/lib/sheets";
import { parseIndonesianDate, validateGangguanItem } from "./useGangguanData";

interface UseTop10GangguanOptions {
  startDate?: Date | null;
  endDate?: Date | null;
  sheetName?: string;
  range?: string;
  filterByUnit?: boolean;
  top?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const useTop10Gangguan = (options: UseTop10GangguanOptions = {}) => {
  const {
    startDate,
    endDate,
    sheetName = "gangguanPenyulang",
    range = "A:S",
    filterByUnit = false,
    top = 10,
    autoRefresh = false,
    refreshInterval = 300000,
  } = options;

  const userUnit: string | null = null;

  const [data, setData] = useState<[string, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const rawData = await fetchSheetData(sheetName, range);
      if (!Array.isArray(rawData)) throw new Error("Data yang diterima tidak valid");

      const firstRow = rawData[0];
      const isFirstRowHeader =
        firstRow &&
        typeof firstRow.ulp === "string" &&
        (firstRow.ulp.toLowerCase().includes("ulp") ||
          firstRow.ulp.toLowerCase().includes("unit"));
      const rows = isFirstRowHeader ? rawData.slice(1) : rawData;

      const filtered = rows.filter((item) => {
        if (!validateGangguanItem(item, filterByUnit ? userUnit : null)) return false;
        if (startDate && endDate) {
          const d = parseIndonesianDate(item.TANGGAL);
          if (!d) return false;
          return d >= startDate && d <= endDate;
        }
        return true;
      });

      const counts: Record<string, number> = {};
      filtered.forEach((item) => {
        const penyulang = (
          item.PENYULANG_GANGGUAN ||
          item.penyulang ||
          "Tidak Diketahui"
        ).toString().trim();
        if (penyulang) counts[penyulang] = (counts[penyulang] || 0) + 1;
      });

      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, top) as [string, number][];

      setData(sorted);
      setLastFetch(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Gagal memuat data: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [sheetName, range, startDate, endDate, filterByUnit, userUnit, top]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInterval, fetchData]);

  const processedData = useMemo(() => {
    const totalGangguan = data.reduce((sum, [, count]) => sum + count, 0);
    const avgGangguan = data.length > 0 ? (totalGangguan / data.length).toFixed(1) : "0";
    const topPenyulang = data.length > 0 ? data[0] : null;
    return {
      gangguanTerbanyak: data,
      totalGangguan,
      avgGangguan,
      topPenyulang,
      totalPenyulang: data.length,
    };
  }, [data]);

  return {
    ...processedData,
    loading,
    error,
    lastFetch,
    refresh: fetchData,
    userUnit,
  };
};
