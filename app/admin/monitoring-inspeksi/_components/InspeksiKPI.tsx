"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { ClipboardList, TreePine, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";

interface KpiData {
  totalJaringan: number;
  totalPohon: number;
  belumSelesai: number; // status != 'Selesai'
  selesaiBulanIni: number;
  sanggatUrgentPohon: number;
}

interface InspeksiKPIProps {
  user: CurrentUser;
  filterUlp?: string;
}

export default function InspeksiKPI({ user, filterUlp }: InspeksiKPIProps) {
  const [kpi, setKpi] = useState<KpiData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchKpi() {
      setLoading(true);
      const ulpFilter = !canSeeAllUnits(user.role) && user.unit
        ? user.unit
        : (filterUlp || null);

      const now = new Date();
      const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split("T")[0];

      const [jaringan, pohon, belumSelesai, selesaiBulanIni] =
        await Promise.all([
          // Total jaringan
          (ulpFilter
            ? supabaseBrowser.from("inspeksi").select("id", { count: "exact", head: true }).eq("ulp", ulpFilter)
            : supabaseBrowser.from("inspeksi").select("id", { count: "exact", head: true })
          ),
          // Total pohon
          (ulpFilter
            ? supabaseBrowser.from("inspeksi_pohon").select("id", { count: "exact", head: true }).eq("ulp", ulpFilter)
            : supabaseBrowser.from("inspeksi_pohon").select("id", { count: "exact", head: true })
          ),
          // Belum selesai (gabungan)
          (async () => {
            const q1 = ulpFilter
              ? supabaseBrowser.from("inspeksi").select("id", { count: "exact", head: true }).neq("status", "Selesai").eq("ulp", ulpFilter)
              : supabaseBrowser.from("inspeksi").select("id", { count: "exact", head: true }).neq("status", "Selesai");
            const q2 = ulpFilter
              ? supabaseBrowser.from("inspeksi_pohon").select("id", { count: "exact", head: true }).neq("status", "Selesai").eq("ulp", ulpFilter)
              : supabaseBrowser.from("inspeksi_pohon").select("id", { count: "exact", head: true }).neq("status", "Selesai");
            const [r1, r2] = await Promise.all([q1, q2]);
            return (r1.count ?? 0) + (r2.count ?? 0);
          })(),
          // Selesai bulan ini
          (async () => {
            const q1 = ulpFilter
              ? supabaseBrowser.from("inspeksi").select("id", { count: "exact", head: true }).eq("status", "Selesai").gte("tgl_eksekusi", firstOfMonth).eq("ulp", ulpFilter)
              : supabaseBrowser.from("inspeksi").select("id", { count: "exact", head: true }).eq("status", "Selesai").gte("tgl_eksekusi", firstOfMonth);
            const q2 = ulpFilter
              ? supabaseBrowser.from("inspeksi_pohon").select("id", { count: "exact", head: true }).eq("status", "Selesai").gte("tgl_eksekusi", firstOfMonth).eq("ulp", ulpFilter)
              : supabaseBrowser.from("inspeksi_pohon").select("id", { count: "exact", head: true }).eq("status", "Selesai").gte("tgl_eksekusi", firstOfMonth);
            const [r1, r2] = await Promise.all([q1, q2]);
            return (r1.count ?? 0) + (r2.count ?? 0);
          })(),
        ]);

      // Pohon risiko sangat tinggi yang belum selesai
      const urgentQuery = ulpFilter
        ? supabaseBrowser.from("inspeksi_pohon").select("id", { count: "exact", head: true }).eq("tingkat_risiko", "Sangat Tinggi").neq("status", "Selesai").eq("ulp", ulpFilter)
        : supabaseBrowser.from("inspeksi_pohon").select("id", { count: "exact", head: true }).eq("tingkat_risiko", "Sangat Tinggi").neq("status", "Selesai");
      const { count: sanggatUrgent } = await urgentQuery;

      setKpi({
        totalJaringan: jaringan.count ?? 0,
        totalPohon: pohon.count ?? 0,
        belumSelesai: typeof belumSelesai === "number" ? belumSelesai : 0,
        selesaiBulanIni: typeof selesaiBulanIni === "number" ? selesaiBulanIni : 0,
        sanggatUrgentPohon: sanggatUrgent ?? 0,
      });
      setLoading(false);
    }

    fetchKpi();
  }, [user.role, user.unit, filterUlp]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-[5.5rem] rounded-2xl bg-line animate-skeleton" />
        ))}
      </div>
    );
  }

  const pctSelesai = kpi && kpi.totalJaringan + kpi.totalPohon > 0
    ? Math.round(((kpi.totalJaringan + kpi.totalPohon - kpi.belumSelesai) / (kpi.totalJaringan + kpi.totalPohon)) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <StatTile
        label="Inspeksi Jaringan"
        value={kpi?.totalJaringan ?? 0}
        tone="navy"
        icon={ClipboardList}
        hint="total keseluruhan"
      />
      <StatTile
        label="Inspeksi Pohon"
        value={kpi?.totalPohon ?? 0}
        tone="accent"
        icon={TreePine}
        hint="total keseluruhan"
      />
      <StatTile
        label="Belum Selesai"
        value={kpi?.belumSelesai ?? 0}
        tone="attention"
        icon={Clock}
        hint="perlu tindak lanjut"
      />
      <StatTile
        label="Selesai Bulan Ini"
        value={kpi?.selesaiBulanIni ?? 0}
        tone="green"
        icon={CheckCircle}
        hint={`${pctSelesai}% temuan tertutup`}
      />
      <StatTile
        label="Pohon Risiko Tinggi"
        value={kpi?.sanggatUrgentPohon ?? 0}
        tone="attention"
        icon={AlertTriangle}
        hint="belum selesai"
      />
    </div>
  );
}
