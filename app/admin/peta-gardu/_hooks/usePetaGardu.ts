"use client";

import { useState, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits } from "@/lib/roles";
import type { CurrentUser } from "@/lib/roles";
import { fetchSheetData } from "@/lib/sheets";
import type { Gardu, Jalur, Tiang, PetaFilter, PetaStats } from "./types";

// ── Spreadsheet helpers ───────────────────────────────────────────────────────

type SheetRow = Record<string, string>;

function parseTitikGardu(url: string): [number, number] | null {
  const match = url?.match(/place\/([-\d.]+),([\d.]+)/);
  if (!match) return null;
  return [parseFloat(match[1]), parseFloat(match[2])];
}

// ── Haversine distance ────────────────────────────────────────────────────────

export function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function totalDistanceM(points: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineMeters(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1]);
  }
  return total;
}

// ── Default filter ────────────────────────────────────────────────────────────

const DEFAULT_FILTER: PetaFilter = {
  search: "",
  feeder: "",
  ulp: "",
  status: "",
  showGardu: true,
  showJalur: true,
  showTiang: true,
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePetaGardu(user: CurrentUser | null) {
  const [garduList, setGarduList] = useState<Gardu[]>([]);
  const [jalurList, setJalurList] = useState<Jalur[]>([]);
  const [tiangList, setTiangList] = useState<Tiang[]>([]);
  const [filter, setFilterState] = useState<PetaFilter>(DEFAULT_FILTER);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFilter = useCallback((patch: Partial<PetaFilter>) => {
    setFilterState((prev) => ({ ...prev, ...patch }));
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isAll = !user || canSeeAllUnits(user.role);
      const unit = user?.unit ?? null;

      // gardu dari Google Spreadsheet (dataGarduProbis), jalur & tiang dari Supabase
      const garduSheetPromise = fetchSheetData("dataGarduProbis", "A:Z");
      const jalurQ = supabaseBrowser
        .from("jalur")
        .select("id,nama,feeder,penghantar,jarak,status,warna");
      const koordinatQ = supabaseBrowser
        .from("jalur_koordinat")
        .select("jalur_id,urutan,lat,lng")
        .order("urutan", { ascending: true });
      const pengukuranQ = supabaseBrowser
        .from("pengukuran_gardu")
        .select("no_gardu,kva_trafo,beban_kva,persen_beban,tanggal_pengukuran,total_arus_r,total_arus_s,total_arus_t")
        .order("tanggal_pengukuran", { ascending: false });

      let tiangQ = supabaseBrowser
        .from("tiang")
        .select("id,kode,jenis,tinggi,kondisi,feeder,jalur_id,alamat,lat,lng,ulp,tgl_pasang,catatan")
        .not("lat", "is", null)
        .not("lng", "is", null);
      if (!isAll && unit) {
        tiangQ = tiangQ.eq("ulp", unit);
      }

      const [garduRows, jalurRes, koordinatRes, pengukuranRes] = await Promise.all([
        garduSheetPromise,
        jalurQ,
        koordinatQ,
        pengukuranQ,
      ]);

      if (jalurRes.error) throw jalurRes.error;
      if (koordinatRes.error) throw koordinatRes.error;

      // tiang: optional — table mungkin belum ada
      const tiangRes = await tiangQ;
      const tiangData: Tiang[] = tiangRes.error ? [] : (tiangRes.data as Tiang[] ?? []);

      // Assemble jalur with koordinat
      const koordinatRows = koordinatRes.data ?? [];
      type KoordRow = { jalur_id: string; urutan: number; lat: number; lng: number };
      type JalurRow = { id: string; nama: string | null; feeder: string | null; penghantar: string | null; jarak: number | null; status: string | null; warna: string | null };
      const assembled: Jalur[] = ((jalurRes.data ?? []) as JalurRow[]).map((j) => ({
        ...j,
        ulp: null,
        koordinat: (koordinatRows as KoordRow[])
          .filter((k) => k.jalur_id === j.id)
          .sort((a, b) => a.urutan - b.urutan)
          .map((k): [number, number] => [k.lat, k.lng]),
      }));

      // Build map: no_gardu → latest measurement (data sudah sort DESC)
      type PengukuranSnap = {
        no_gardu: string; kva_trafo: number; beban_kva: number; persen_beban: number;
        tanggal_pengukuran: string; total_arus_r: number; total_arus_s: number; total_arus_t: number;
      };
      const pengukuranMap = new Map<string, PengukuranSnap>();
      for (const p of ((pengukuranRes.data ?? []) as PengukuranSnap[])) {
        if (!pengukuranMap.has(p.no_gardu)) pengukuranMap.set(p.no_gardu, p);
      }

      // Parse spreadsheet rows → Gardu[]
      const garduParsed: Gardu[] = (garduRows as SheetRow[])
        .filter((row) => row["NO GARDU"] && row["TITIK GARDU"])
        .flatMap((row) => {
          const coords = parseTitikGardu(row["TITIK GARDU"]);
          if (!coords) return [];
          const [lat, lng] = coords;
          const ulpRaw = row["ULP"]?.replace(/^ULP\s+/i, "").trim() ?? null;
          return [{
            kode: row["NO GARDU"].trim(),
            nama: row["LOKASI GARDU"]?.trim() ?? row["NO GARDU"].trim(),
            alamat: row["LOKASI GARDU"]?.trim() ?? null,
            feeder: row["PENYULANG"]?.trim() ?? null,
            daya: row["DAYA GARDU"] ? parseFloat(row["DAYA GARDU"]) : null,
            merk: null,
            status: null,
            tgl_update: null,
            lat,
            lng,
            beban_kva: null,
            beban_persen: null,
            beban_total: null,
            ulp: ulpRaw,
          }];
        });

      // Merge pengukuran ke gardu
      setGarduList(garduParsed.map((g) => {
        const p = pengukuranMap.get(g.kode);
        return {
          ...g,
          ...(p ? {
            beban_kva: p.beban_kva,
            beban_persen: p.persen_beban,
            tgl_pengukuran: p.tanggal_pengukuran,
            kva_trafo: p.kva_trafo,
            pengukuran_arus_r: p.total_arus_r,
            pengukuran_arus_s: p.total_arus_s,
            pengukuran_arus_t: p.total_arus_t,
          } : { beban_kva: null, beban_persen: null }),
        };
      }));
      setJalurList(assembled);
      setTiangList(tiangData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data peta");
    } finally {
      setLoading(false);
    }
  }, [user]);

  // ── Filtered lists ──────────────────────────────────────────────────────────

  const filteredGardu = useMemo(() => {
    if (!filter.showGardu) return [];
    let list = garduList;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (g) =>
          g.kode.toLowerCase().includes(q) ||
          (g.nama ?? "").toLowerCase().includes(q) ||
          (g.feeder ?? "").toLowerCase().includes(q)
      );
    }
    if (filter.feeder) list = list.filter((g) => g.feeder === filter.feeder);
    if (filter.ulp) list = list.filter((g) => g.ulp === filter.ulp);
    if (filter.status) list = list.filter((g) => g.status === filter.status);
    return list;
  }, [garduList, filter]);

  const filteredJalur = useMemo(() => {
    if (!filter.showJalur) return [];
    let list = jalurList;
    if (filter.feeder) list = list.filter((j) => j.feeder === filter.feeder);
    if (filter.ulp) list = list.filter((j) => j.ulp === filter.ulp);
    if (filter.status) list = list.filter((j) => j.status === filter.status);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (j) =>
          (j.nama ?? "").toLowerCase().includes(q) ||
          (j.feeder ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [jalurList, filter]);

  const filteredTiang = useMemo(() => {
    if (!filter.showTiang) return [];
    let list = tiangList;
    if (filter.feeder) list = list.filter((t) => t.feeder === filter.feeder);
    if (filter.ulp) list = list.filter((t) => t.ulp === filter.ulp);
    if (filter.status) list = list.filter((t) => t.kondisi === filter.status);
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter(
        (t) =>
          t.kode.toLowerCase().includes(q) ||
          (t.feeder ?? "").toLowerCase().includes(q) ||
          (t.alamat ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [tiangList, filter]);

  const feederOptions = useMemo(() => {
    const set = new Set<string>();
    garduList.forEach((g) => g.feeder && set.add(g.feeder));
    jalurList.forEach((j) => j.feeder && set.add(j.feeder));
    tiangList.forEach((t) => t.feeder && set.add(t.feeder));
    return Array.from(set).sort();
  }, [garduList, jalurList, tiangList]);

  const stats: PetaStats = useMemo(() => {
    const jalurKm =
      jalurList.reduce((sum, j) => sum + (j.jarak ?? 0), 0) / 1000;
    return {
      garduCount: garduList.length,
      jalurCount: jalurList.length,
      jalurKm,
      tiangCount: tiangList.length,
    };
  }, [garduList, jalurList, tiangList]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const insertJalur = useCallback(
    async (
      data: Omit<Jalur, "id" | "koordinat" | "jarak">,
      points: [number, number][]
    ) => {
      const jarak = totalDistanceM(points);
      // Generate ID client-side — hindari .select() setelah insert (rentan RLS block)
      const jalurId = crypto.randomUUID();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { ulp: _ulp, ...insertData } = data; // ulp tidak ada di tabel jalur lama
      const { error } = await supabaseBrowser
        .from("jalur")
        .insert({ id: jalurId, ...insertData, jarak });
      if (error) throw error;

      const koords = points.map((p, i) => ({
        jalur_id: jalurId,
        urutan: i,
        lat: p[0],
        lng: p[1],
      }));
      const { error: kErr } = await supabaseBrowser
        .from("jalur_koordinat")
        .insert(koords);
      if (kErr) throw kErr;
      fetchAll();
    },
    [fetchAll]
  );

  const updateJalur = useCallback(
    async (
      id: string,
      data: Partial<Omit<Jalur, "id" | "koordinat">>,
      points?: [number, number][]
    ) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { ulp: _ulp, ...safeData } = data as Partial<Jalur>;
      const updateData = points
        ? { ...safeData, jarak: totalDistanceM(points) }
        : safeData;
      const { error } = await supabaseBrowser
        .from("jalur")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;

      if (points) {
        await supabaseBrowser.from("jalur_koordinat").delete().eq("jalur_id", id);
        const koords = points.map((p, i) => ({
          jalur_id: id,
          urutan: i,
          lat: p[0],
          lng: p[1],
        }));
        const { error: kErr } = await supabaseBrowser
          .from("jalur_koordinat")
          .insert(koords);
        if (kErr) throw kErr;
      }
      fetchAll();
    },
    [fetchAll]
  );

  const deleteJalur = useCallback(
    async (id: string) => {
      await supabaseBrowser.from("jalur_koordinat").delete().eq("jalur_id", id);
      const { error } = await supabaseBrowser
        .from("jalur")
        .delete()
        .eq("id", id);
      if (error) throw error;
      fetchAll();
    },
    [fetchAll]
  );

  const insertTiang = useCallback(
    async (data: Omit<Tiang, "id">) => {
      const { error } = await supabaseBrowser.from("tiang").insert(data);
      if (error) throw error;
      fetchAll();
    },
    [fetchAll]
  );

  const updateTiang = useCallback(
    async (id: string, data: Partial<Tiang>) => {
      const { error } = await supabaseBrowser
        .from("tiang")
        .update(data)
        .eq("id", id);
      if (error) throw error;
      fetchAll();
    },
    [fetchAll]
  );

  const deleteTiang = useCallback(
    async (id: string) => {
      const { error } = await supabaseBrowser.from("tiang").delete().eq("id", id);
      if (error) throw error;
      fetchAll();
    },
    [fetchAll]
  );

  return {
    garduList,
    jalurList,
    tiangList,
    filteredGardu,
    filteredJalur,
    filteredTiang,
    feederOptions,
    filter,
    setFilter,
    stats,
    loading,
    error,
    refresh: fetchAll,
    insertJalur,
    updateJalur,
    deleteJalur,
    insertTiang,
    updateTiang,
    deleteTiang,
  };
}
