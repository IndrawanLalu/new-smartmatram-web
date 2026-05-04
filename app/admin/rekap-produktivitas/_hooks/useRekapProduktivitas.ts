"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

export const EKSEKUTOR_OPTIONS = ["HARJAR", "HARGAR", "PERABASAN", "YANGU", "PDKB"];
export const ULP_OPTIONS       = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export interface PetugasRow {
  team_name: string;
  days: Record<number, number>; // day 1–31 → count
  total: number;
}

export interface Filter {
  ulp: string;
  bulan: number;
  tahun: number;
  eksekutor: string;
}

export function useRekapProduktivitas(user: CurrentUser) {
  const now = new Date();
  const [filter, setFilter] = useState<Filter>({
    ulp:       canSeeAllUnits(user.role) ? "" : (user.unit ?? ""),
    bulan:     now.getMonth() + 1,
    tahun:     now.getFullYear(),
    eksekutor: "PERABASAN",
  });
  const [rows,    setRows]    = useState<PetugasRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);

      const y   = filter.tahun;
      const m   = filter.bulan;
      const pad = (n: number) => String(n).padStart(2, "0");
      const startDate = `${y}-${pad(m)}-01`;
      const endDay    = new Date(y, m, 0).getDate();
      const endDate   = `${y}-${pad(m)}-${pad(endDay)}`;

      function baseQuery(table: "inspeksi" | "inspeksi_pohon", fields: string) {
        let qb = supabaseBrowser.from(table).select(fields)
          .eq("eksekutor", filter.eksekutor)
          .not("team_name", "is", null);
        if (filter.ulp) qb = qb.eq("ulp", filter.ulp);
        return qb;
      }

      // Fetch semua team_name yang pernah ada (tanpa filter tanggal)
      const [{ data: all1 }, { data: all2 },
             { data: d1   }, { data: d2   }] = await Promise.all([
        baseQuery("inspeksi",      "team_name"),
        baseQuery("inspeksi_pohon","team_name"),
        // Data bulan yang dipilih (dengan filter tanggal)
        baseQuery("inspeksi",      "team_name, tgl_eksekusi")
          .not("tgl_eksekusi", "is", null)
          .gte("tgl_eksekusi", startDate)
          .lte("tgl_eksekusi", endDate),
        baseQuery("inspeksi_pohon","team_name, tgl_eksekusi")
          .not("tgl_eksekusi", "is", null)
          .gte("tgl_eksekusi", startDate)
          .lte("tgl_eksekusi", endDate),
      ]);

      // Kumpulkan semua nama unik
      const allNames = new Set<string>();
      for (const item of [...(all1 ?? []), ...(all2 ?? [])]) {
        if (item.team_name) allNames.add(item.team_name as string);
      }

      // Hitung per hari dari data bulan
      const map = new Map<string, Record<number, number>>();
      for (const name of allNames) map.set(name, {});

      const combined = [...(d1 ?? []), ...(d2 ?? [])] as { team_name: string; tgl_eksekusi: string }[];
      for (const item of combined) {
        const name = item.team_name;
        const day  = new Date(item.tgl_eksekusi).getDate();
        const dm   = map.get(name);
        if (!dm) continue;
        dm[day] = (dm[day] ?? 0) + 1;
      }

      const result: PetugasRow[] = Array.from(map.entries())
        .map(([team_name, days]) => ({
          team_name,
          days,
          total: Object.values(days).reduce((a, b) => a + b, 0),
        }))
        .sort((a, b) => b.total - a.total);

      setRows(result);
      setLoading(false);
    }

    load();
  }, [filter]);

  const daysInMonth = new Date(filter.tahun, filter.bulan, 0).getDate();

  return { filter, setFilter, rows, loading, daysInMonth };
}
