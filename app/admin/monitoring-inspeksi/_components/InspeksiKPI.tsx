"use client";

import { useEffect, useState, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  type CurrentUser,
  canSeeAllUnits,
  URGENCY_CONFIG,
} from "@/lib/roles";
import { ClipboardList, TreePine, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface KpiData {
  totalJaringan: number;
  totalPohon: number;
  belumSelesai: number; // status != 'Selesai'
  selesaiBulanIni: number;
  sanggatUrgentPohon: number;
}

function KpiCard({
  label,
  value,
  sub,
  icon,
  iconBg,
  valueColor = "text-[#e2e8f0]",
  loading,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  iconBg: string;
  valueColor?: string;
  loading: boolean;
}) {
  return (
    <div className="bg-[#162334] rounded-xl shadow-sm border border-[#1e3552] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#94a3b8]">{label}</p>
          {loading ? (
            <div className="h-8 w-16 bg-gray-100 animate-pulse rounded mt-1" />
          ) : (
            <p className={`text-3xl font-bold mt-1 ${valueColor}`}>{value}</p>
          )}
          {sub && <p className="text-xs text-[#94a3b8] mt-1">{sub}</p>}
        </div>
        <div
          className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center shrink-0`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
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

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <KpiCard
        label="Inspeksi Jaringan"
        value={kpi?.totalJaringan ?? 0}
        sub="total keseluruhan"
        icon={<ClipboardList size={18} className="text-[#00897B]" />}
        iconBg="bg-[#0a2a26]"
        loading={loading}
      />
      <KpiCard
        label="Inspeksi Pohon"
        value={kpi?.totalPohon ?? 0}
        sub="total keseluruhan"
        icon={<TreePine size={18} className="text-green-600" />}
        iconBg="bg-green-50"
        loading={loading}
      />
      <KpiCard
        label="Belum Selesai"
        value={kpi?.belumSelesai ?? 0}
        sub="perlu tindak lanjut"
        icon={<Clock size={18} className="text-orange-600" />}
        iconBg="bg-orange-50"
        valueColor="text-orange-600"
        loading={loading}
      />
      <KpiCard
        label="Selesai Bulan Ini"
        value={kpi?.selesaiBulanIni ?? 0}
        sub="jaringan + pohon"
        icon={<CheckCircle size={18} className="text-green-600" />}
        iconBg="bg-green-50"
        valueColor="text-green-600"
        loading={loading}
      />
      <KpiCard
        label="Pohon Risiko Sangat Tinggi"
        value={kpi?.sanggatUrgentPohon ?? 0}
        sub="belum selesai"
        icon={<AlertTriangle size={18} className="text-red-600" />}
        iconBg="bg-red-50"
        valueColor="text-red-600"
        loading={loading}
      />
    </div>
  );
}
