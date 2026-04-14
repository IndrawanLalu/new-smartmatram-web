"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { TiangRef } from "./types";

// ── Google Sheets fetch ───────────────────────────────────────────────────────

const SPREADSHEET_ID = "18BdDjQX2YtvtdeZ1HzQozpxJNxigPHXWpnWPBgEOOK8";
const API_KEY = "AIzaSyAZ1aJVdOVCv4Of60ZwPRsabQsgLaBxzQU";

async function fetchSheetNames(): Promise<string[]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title&key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return (json.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
}

async function fetchSheetRows(sheetName: string): Promise<Record<string, string>[]> {
  const range = encodeURIComponent(`${sheetName}!A:Z`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${range}?key=${API_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  const rows: string[][] = json.values ?? [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
    return obj;
  });
}

// ── Hook ──────────────────────────────────────────────────────────────────────

function parseRows(rows: Record<string, string>[], feeder: string): TiangRef[] {
  return rows
    .map((row, i) => {
      const lat = parseFloat(row["LAT"] ?? "");
      const lng = parseFloat(row["LNG"] ?? "");
      if (isNaN(lat) || isNaN(lng)) return null;
      const kode = row["NO_TIANG"]?.trim() || `T${i + 1}`;
      return {
        id: `${feeder}_${kode}_${i}`,
        kode,
        lat,
        lng,
        feeder: row["FEEDER"]?.trim() || feeder,
        alamat: row["ALAMAT"]?.trim() || null,
      } as TiangRef;
    })
    .filter((t): t is TiangRef => t !== null);
}

export function useTiangReferensi(_feederOptions?: string[]) {
  const [tiangRef, setTiangRef] = useState<TiangRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLayer, setShowLayer] = useState(true);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [selectedFeeders, setSelectedFeeders] = useState<string[]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetNamesLoading, setSheetNamesLoading] = useState(true);

  // Fetch sheet names on mount
  useEffect(() => {
    fetchSheetNames()
      .then(setSheetNames)
      .catch(() => setSheetNames([]))
      .finally(() => setSheetNamesLoading(false));
  }, []);

  // Cache: feeder name → parsed TiangRef[] (persists across renders)
  const cache = useRef<Map<string, TiangRef[]>>(new Map());

  const toggleFeeder = useCallback((f: string) => {
    setSelectedFeeders((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }, []);

  useEffect(() => {
    if (selectedFeeders.length === 0) {
      setTiangRef([]);
      setError(null);
      return;
    }

    // Only fetch feeders not already in cache
    const missing = selectedFeeders.filter((f) => !cache.current.has(f));

    if (missing.length === 0) {
      // All cached — combine immediately, no network request
      setTiangRef(selectedFeeders.flatMap((f) => cache.current.get(f) ?? []));
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all(
      missing.map((f) =>
        fetchSheetRows(f)
          .then((rows) => ({ f, rows }))
          .catch(() => ({ f, rows: [] as Record<string, string>[] }))
      )
    )
      .then((results) => {
        if (cancelled) return;
        results.forEach(({ f, rows }) => {
          cache.current.set(f, parseRows(rows, f));
        });
        setTiangRef(selectedFeeders.flatMap((f) => cache.current.get(f) ?? []));
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Gagal memuat data tiang");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [selectedFeeders]);

  return {
    tiangRef,
    loading,
    error,
    showLayer,
    setShowLayer,
    snapEnabled,
    setSnapEnabled,
    selectedFeeders,
    toggleFeeder,
    sheetNames,
    sheetNamesLoading,
  };
}
