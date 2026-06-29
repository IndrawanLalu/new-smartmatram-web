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

      function inspeksiQuery(table: "inspeksi" | "inspeksi_pohon") {
        let qb = supabaseBrowser.from(table).select("team_name, tgl_eksekusi")
          .eq("eksekutor", filter.eksekutor)
          .not("team_name",    "is", null)
          .not("tgl_eksekusi", "is", null)
          .gte("tgl_eksekusi", startDate)
          .lte("tgl_eksekusi", endDate);
        if (filter.ulp) qb = qb.eq("ulp", filter.ulp);
        return qb;
      }

      // Fetch master petugas + data bulan sekaligus
      let petugasQuery = supabaseBrowser.from("petugas")
        .select("nama")
        .eq("group_name", filter.eksekutor)
        .eq("status", "aktif");
      if (filter.ulp) petugasQuery = petugasQuery.eq("ulp", filter.ulp);

      const [{ data: petugasList }, { data: d1 }, { data: d2 }] = await Promise.all([
        petugasQuery,
        inspeksiQuery("inspeksi"),
        inspeksiQuery("inspeksi_pohon"),
      ]);

      // Semua nama dari master petugas
      const allNames = new Set<string>(
        (petugasList ?? []).map((p) => p.nama as string).filter(Boolean)
      );

      // Inisialisasi map dari master petugas
      const map = new Map<string, Record<number, number>>();
      for (const name of allNames) map.set(name, {});

      const combined = [...(d1 ?? []), ...(d2 ?? [])] as { team_name: string; tgl_eksekusi: string }[];
      for (const item of combined) {
        const day = new Date(item.tgl_eksekusi).getDate();
        // team_name bisa berupa pasangan ("NAMA A & NAMA B") — pecah & kreditkan tiap petugas
        const names = item.team_name
          .split(/\s*[&,/]\s*/)
          .map((n) => n.trim())
          .filter(Boolean);
        for (const name of names) {
          const dm = map.get(name);
          if (!dm) continue; // hanya petugas yang ada di master; sisanya data lama, diabaikan
          dm[day] = (dm[day] ?? 0) + 1;
        }
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
