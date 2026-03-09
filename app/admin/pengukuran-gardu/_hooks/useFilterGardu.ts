"use client";

import { useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type Role } from "@/lib/roles";
import {
  type PengukuranGardu,
  getNominalCurrent,
  HIGH_CURRENT_A,
  OVERLOAD_PCT,
  HIGH_TEMP_C,
} from "./usePengukuranGardu";

export interface FilterGardu {
  // Identitas & waktu
  ulp: string;
  penyulang: string;
  noGardu: string;
  tglDari: string;
  tglSampai: string;
  // Beban (%)
  bebanMin: string;
  bebanMax: string;
  // Kapasitas trafo
  kvaList: number[];
  // Suhu (°C)
  suhuMin: string;
  suhuMax: string;
  // Arus total per fasa (A)
  arusMaxFaseMin: string; // max(R,S,T) >= X → OR server query
  arusRMin: string;
  arusSMin: string;
  arusTMin: string;
  arusNMin: string;
  // Tegangan (V)
  tegUnderMax: string;  // any phase <= X (undervoltage)
  tegOverMin: string;   // all phases >= X (overvoltage)
  // Quick flags
  onlyOverload: boolean;
  onlyHighTemp: boolean;
  onlyHighCurrent: boolean;
  onlyPhaseOverload: boolean; // client-side only
}

export const INITIAL_FILTER: FilterGardu = {
  ulp: "", penyulang: "", noGardu: "",
  tglDari: "", tglSampai: "",
  bebanMin: "", bebanMax: "",
  kvaList: [],
  suhuMin: "", suhuMax: "",
  arusMaxFaseMin: "", arusRMin: "", arusSMin: "", arusTMin: "", arusNMin: "",
  tegUnderMax: "", tegOverMin: "",
  onlyOverload: false, onlyHighTemp: false, onlyHighCurrent: false, onlyPhaseOverload: false,
};

interface UserLike {
  role: Role;
  unit: string | null;
}

export function useFilterGardu(user: UserLike) {
  const [filter, setFilter] = useState<FilterGardu>(INITIAL_FILTER);
  const [results, setResults] = useState<PengukuranGardu[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (f: FilterGardu) => {
    setLoading(true);
    setError(null);
    setSearched(true);

    try {
      let query = supabaseBrowser
        .from("pengukuran_gardu")
        .select("*")
        .order("tanggal_pengukuran", { ascending: false });

      // Unit filter (role-based — always apply)
      if (!canSeeAllUnits(user.role) && user.unit) {
        query = query.eq("petugas_unit", user.unit);
      } else if (f.ulp) {
        query = query.eq("petugas_unit", f.ulp);
      }

      // Identitas
      if (f.penyulang) query = query.eq("penyulang", f.penyulang);
      if (f.noGardu) query = query.ilike("no_gardu", `%${f.noGardu}%`);
      if (f.tglDari) query = query.gte("tanggal_pengukuran", f.tglDari);
      if (f.tglSampai) query = query.lte("tanggal_pengukuran", f.tglSampai);

      // Beban (onlyOverload shortcut overrides bebanMin/Max)
      if (f.onlyOverload) {
        query = query.gte("persen_beban", OVERLOAD_PCT);
      } else {
        if (f.bebanMin) query = query.gte("persen_beban", parseFloat(f.bebanMin));
        if (f.bebanMax) query = query.lte("persen_beban", parseFloat(f.bebanMax));
      }

      // Kapasitas trafo
      if (f.kvaList.length > 0) query = query.in("kva_trafo", f.kvaList);

      // Suhu (onlyHighTemp shortcut overrides suhuMin/Max)
      if (f.onlyHighTemp) {
        query = query.gt("suhu_trafo", HIGH_TEMP_C);
      } else {
        if (f.suhuMin) query = query.gte("suhu_trafo", parseFloat(f.suhuMin));
        if (f.suhuMax) query = query.lte("suhu_trafo", parseFloat(f.suhuMax));
      }

      // Arus per fasa individual
      if (f.arusRMin) query = query.gte("total_arus_r", parseFloat(f.arusRMin));
      if (f.arusSMin) query = query.gte("total_arus_s", parseFloat(f.arusSMin));
      if (f.arusTMin) query = query.gte("total_arus_t", parseFloat(f.arusTMin));
      if (f.arusNMin) query = query.gte("total_arus_n", parseFloat(f.arusNMin));

      // Arus max fasa: setidaknya satu fasa >= X (OR)
      if (f.arusMaxFaseMin || f.onlyHighCurrent) {
        const v = f.arusMaxFaseMin ? parseFloat(f.arusMaxFaseMin) : HIGH_CURRENT_A;
        query = query.or(`total_arus_r.gte.${v},total_arus_s.gte.${v},total_arus_t.gte.${v}`);
      }

      // Tegangan undervoltage: setidaknya satu fasa <= X
      if (f.tegUnderMax) {
        const v = parseFloat(f.tegUnderMax);
        query = query.or(`total_teg_rn.lte.${v},total_teg_sn.lte.${v},total_teg_tn.lte.${v}`);
      }

      // Tegangan semua fasa >= X (AND)
      if (f.tegOverMin) {
        const v = parseFloat(f.tegOverMin);
        query = query
          .gte("total_teg_rn", v)
          .gte("total_teg_sn", v)
          .gte("total_teg_tn", v);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      // Deduplicate: satu baris per no_gardu (paling baru by tanggal)
      const seen = new Map<string, PengukuranGardu>();
      for (const row of (data ?? []) as PengukuranGardu[]) {
        const existing = seen.get(row.no_gardu);
        if (!existing || row.tanggal_pengukuran > existing.tanggal_pengukuran) {
          seen.set(row.no_gardu, row);
        }
      }

      let deduped = Array.from(seen.values());

      // Client-side: fase overload (max total >= iNominal)
      if (f.onlyPhaseOverload) {
        deduped = deduped.filter((r) => {
          const iNom = getNominalCurrent(r.kva_trafo);
          return Math.max(r.total_arus_r, r.total_arus_s, r.total_arus_t) >= iNom;
        });
      }

      setResults(deduped);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengambil data");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const reset = useCallback(() => {
    setFilter(INITIAL_FILTER);
    setResults([]);
    setSearched(false);
    setError(null);
  }, []);

  return { filter, setFilter, search, reset, results, loading, error, searched };
}
