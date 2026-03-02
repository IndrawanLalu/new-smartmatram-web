"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { fetchSheetData } from "@/lib/sheets";

export const MONTH_MAP: Record<string, number> = {
  Januari: 0,
  Februari: 1,
  Maret: 2,
  April: 3,
  Mei: 4,
  Juni: 5,
  Juli: 6,
  Agustus: 7,
  September: 8,
  Oktober: 9,
  November: 10,
  Desember: 11,
};

export const parseIndonesianDate = (dateString: string | undefined | null): Date | null => {
  if (!dateString || typeof dateString !== "string") return null;
  const parts = dateString.trim().split(" ");
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0]);
  const month = MONTH_MAP[parts[1]];
  const year = parseInt(parts[2]);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  if (day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  return new Date(year, month, day);
};

export const validateGangguanItem = (
  item: Record<string, string>,
  userUnit: string | null
): boolean => {
  if (!item || typeof item !== "object") return false;
  if (userUnit && item.ULP) {
    if (item.ULP.trim().toUpperCase() !== userUnit.toUpperCase()) return false;
  }
  const itemDate = parseIndonesianDate(item.TANGGAL);
  return itemDate !== null;
};

export const filterByDateRange = (
  items: Record<string, string>[],
  startDate: Date,
  endDate: Date
): Record<string, string>[] => {
  if (!Array.isArray(items) || !startDate || !endDate) return [];
  return items.filter((item) => {
    const d = parseIndonesianDate(item.TANGGAL);
    if (!d) return false;
    return d >= startDate && d <= endDate;
  });
};

interface UseGangguanDataOptions {
  startDate?: Date | null;
  endDate?: Date | null;
  sheetName?: string;
  range?: string;
  filterByUnit?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export const useGangguanData = (options: UseGangguanDataOptions = {}) => {
  const {
    startDate,
    endDate,
    sheetName = "gangguanPenyulang",
    range = "A:S",
    filterByUnit = false,
    autoRefresh = false,
    refreshInterval = 300000,
  } = options;

  const userUnit: string | null = null; // No Redux; extend later if needed

  const [data, setData] = useState<Record<string, string>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const rawData = await fetchSheetData(sheetName, range);
      if (!Array.isArray(rawData)) throw new Error("Data yang diterima tidak valid");

      // Skip header row if present
      const firstRow = rawData[0];
      const isFirstRowHeader =
        firstRow &&
        typeof firstRow.ulp === "string" &&
        (firstRow.ulp.toLowerCase().includes("ulp") ||
          firstRow.ulp.toLowerCase().includes("unit"));
      let filtered = isFirstRowHeader ? rawData.slice(1) : rawData;

      // Unit filter
      filtered = filtered.filter((item) =>
        validateGangguanItem(item, filterByUnit ? userUnit : null)
      );

      // Date range filter
      if (startDate && endDate) {
        filtered = filterByDateRange(filtered, startDate, endDate);
      }

      setData(filtered);
      setLastFetch(new Date());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Gagal memuat data: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [sheetName, range, startDate, endDate, filterByUnit, userUnit]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return;
    const id = setInterval(fetchData, refreshInterval);
    return () => clearInterval(id);
  }, [autoRefresh, refreshInterval, fetchData]);

  const processedData = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    const monthlyData = {
      currentYear: Array(12).fill(0) as number[],
      previousYear: Array(12).fill(0) as number[],
      total: data.length,
      totalCurrentYear: 0,
      totalPreviousYear: 0,
      percentageChange: 0,
    };

    data.forEach((item) => {
      const d = parseIndonesianDate(item.TANGGAL);
      if (!d) return;
      const m = d.getMonth();
      const y = d.getFullYear();
      if (y === currentYear) monthlyData.currentYear[m]++;
      else if (y === previousYear) monthlyData.previousYear[m]++;
    });

    monthlyData.totalCurrentYear = monthlyData.currentYear.reduce((s, v) => s + v, 0);
    monthlyData.totalPreviousYear = monthlyData.previousYear.reduce((s, v) => s + v, 0);

    if (monthlyData.totalPreviousYear === 0) {
      monthlyData.percentageChange = monthlyData.totalCurrentYear > 0 ? 100 : 0;
    } else {
      monthlyData.percentageChange =
        ((monthlyData.totalCurrentYear - monthlyData.totalPreviousYear) /
          monthlyData.totalPreviousYear) *
        100;
    }

    return monthlyData;
  }, [data]);

  return {
    data,
    processedData,
    loading,
    error,
    lastFetch,
    refresh: fetchData,
    userUnit,
  };
};
