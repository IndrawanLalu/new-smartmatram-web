"use client";

import { useState, useEffect } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
  Search, RefreshCw, AlertTriangle, TrendingUp, BarChart3,
  Filter, Download, Calendar, Target, Award,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ChartDataLabels);

interface DiagramTemuanProps {
  startDate?: Date | null;
  endDate?: Date | null;
}

export default function DiagramTemuan({ startDate, endDate }: DiagramTemuanProps) {
  const [temuanTerbanyak, setTemuanTerbanyak] = useState<[string, number][]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const formatDate = (d: Date) => d.toISOString().split("T")[0];

  const fetchData = async () => {
    if (!startDate || !endDate) return;
    try {
      setLoading(true);
      setError(null);

      const { data, error: supaErr } = await supabaseBrowser
        .from("inspeksi")
        .select("temuan")
        .gte("tgl_inspeksi", formatDate(startDate))
        .lte("tgl_inspeksi", formatDate(endDate));

      if (supaErr) throw new Error(supaErr.message);

      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: { temuan: string }) => {
        const t = row.temuan || "Unknown";
        counts[t] = (counts[t] || 0) + 1;
      });

      const sorted = Object.entries(counts)
        .sort((a, b) => (sortOrder === "desc" ? b[1] - a[1] : a[1] - b[1]))
        .slice(0, 20) as [string, number][];

      setTemuanTerbanyak(sorted);
    } catch (err) {
      setError(`Gagal memuat data temuan: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, sortOrder]);

  const filtered = temuanTerbanyak.filter(([t]) => t.toLowerCase().includes(searchTerm.toLowerCase()));

  const analytics = temuanTerbanyak.reduce(
    (acc, [, c]) => ({ total: acc.total + c, max: Math.max(acc.max, c), cat: acc.cat + 1 }),
    { total: 0, max: 0, cat: 0 }
  );
  const avgCount = analytics.cat > 0 ? (analytics.total / analytics.cat).toFixed(1) : "0";
  const periodDays = startDate && endDate ? Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;

  const chartData = {
    labels: filtered.map(([t]) => t.length > 30 ? t.substring(0, 30) + "..." : t),
    datasets: [{
      label: "Jumlah Temuan",
      data: filtered.map(([, c]) => c),
      backgroundColor: filtered.map((_, i) => `rgba(239,68,68,${Math.max(0.8 - i * 0.03, 0.3)})`),
      borderColor: filtered.map((_, i) => `rgba(239,68,68,${Math.max(1 - i * 0.05, 0.5)})`),
      borderWidth: 2,
      borderRadius: 4,
      borderSkipped: false,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y" as const,
    barThickness: 16,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(0,0,0,0.9)",
        titleColor: "#fff",
        bodyColor: "#fff",
        borderColor: "rgba(239,68,68,0.5)",
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        callbacks: {
          title: (ctx: { dataIndex: number }[]) => temuanTerbanyak[ctx[0].dataIndex]?.[0] ?? "",
          label: (ctx: { parsed: { x: number | null } }) => {
            const count = ctx.parsed.x ?? 0;
            const pct = analytics.total > 0 ? ((count / analytics.total) * 100).toFixed(1) : 0;
            return [`Jumlah: ${count} temuan`, `Persentase: ${pct}%`];
          },
        },
      },
      datalabels: {
        anchor: "end" as const, align: "right" as const,
        formatter: (value: number) => {
          const pct = analytics.total > 0 ? ((value / analytics.total) * 100).toFixed(1) : 0;
          return `${value}x (${pct}%)`;
        },
        color: "#fff",
        backgroundColor: "rgba(0,0,0,0.7)",
        borderRadius: 4,
        padding: 4,
        font: { weight: "bold" as const, size: 10 },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: "rgba(0,0,0,0.06)" },
        ticks: { color: "rgba(0,0,0,0.6)", font: { size: 11 } },
      },
      y: {
        grid: { display: false },
        ticks: { color: "rgba(0,0,0,0.6)", font: { size: 10 }, padding: 8 },
      },
    },
  };

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-slate-700 font-semibold mb-2">Error Memuat Chart</h3>
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <button onClick={fetchData} className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm">
          <RefreshCw className="w-4 h-4" /> Coba Lagi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Analytics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <AlertTriangle className="w-5 h-5 text-red-600" />, bg: "bg-red-50", value: loading ? "..." : analytics.total, label: "Total Temuan", color: "text-red-600" },
          { icon: <Target className="w-5 h-5 text-amber-600" />, bg: "bg-amber-50", value: loading ? "..." : analytics.cat, label: "Jenis Temuan", color: "text-amber-600" },
          { icon: <TrendingUp className="w-5 h-5 text-blue-600" />, bg: "bg-blue-50", value: loading ? "..." : avgCount, label: "Rata-rata", color: "text-blue-600" },
          { icon: <Award className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-50", value: loading ? "..." : analytics.max, label: "Tertinggi", color: "text-emerald-600" },
        ].map(({ icon, bg, value, label, color }) => (
          <div key={label} className="bg-white border border-[#E2E8F0] rounded-xl shadow-sm hover:shadow-md transition-shadow p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${bg}`}>{icon}</div>
              <div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-slate-500">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart Card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-sm">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-red-50">
                <BarChart3 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h3 className="text-slate-800 text-lg font-semibold">TOP 20 Temuan Inspeksi</h3>
                <p className="text-slate-400 text-sm">
                  {startDate && endDate && `Periode: ${startDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })} — ${endDate.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loading && <div className="w-5 h-5 border-2 border-slate-200 border-t-[#00897B] rounded-full animate-spin" />}
              <button onClick={fetchData} disabled={loading} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 disabled:opacity-50 transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari jenis temuan..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-[#00897B]/30 focus:border-[#00897B]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSortOrder((p) => p === "desc" ? "asc" : "desc")}
                className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors flex items-center gap-1 text-xs"
              >
                <Filter className="w-4 h-4" />
                {sortOrder === "desc" ? "↓" : "↑"}
              </button>
              <button className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 pb-5">
          <div className="h-96 md:h-[500px] lg:h-[600px]">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="w-8 h-8 border-2 border-slate-200 border-t-[#00897B] rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-slate-400">Memuat data temuan...</p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-center">
                <div>
                  <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">Tidak ada data temuan</p>
                  <p className="text-sm">{searchTerm ? `Tidak ditemukan "${searchTerm}"` : "Belum ada data pada periode yang dipilih"}</p>
                </div>
              </div>
            ) : (
              <Bar data={chartData} options={options} />
            )}
          </div>

          {!loading && filtered.length > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
              <p>Menampilkan {filtered.length} dari {temuanTerbanyak.length} jenis temuan{searchTerm && ` (filter: "${searchTerm}")`}</p>
              {periodDays > 0 && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>Periode: {periodDays} hari</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
