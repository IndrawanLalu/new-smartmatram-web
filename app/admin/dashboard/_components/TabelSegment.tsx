"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Search, RefreshCw, MapPin, CheckCircle, Clock, AlertTriangle,
  TrendingUp, Target, Activity, Filter, Download,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbz_CriWnHRXCW48e5hQv_aIzOSgvX1tYSAVW-2-fVYhorSuPxGrlqiTzBr6Eao00HdT-Q/exec";

interface Segment {
  penyulang: string;
  panjangSegment: number;
  tglCek?: string;
  tglRabas?: string;
  [key: string]: unknown;
}

interface GroupedData {
  penyulang: string;
  segments: Segment[];
  totalPanjang: number;
  totalSegmen: number;
  sudahDicek: number;
  sudahDicekRabas: number;
  persentase: number;
  persentaseRabas: number;
  temuan: number;
  pending: number;
  selesai: number;
}

async function getSegmentData(): Promise<Segment[]> {
  const url = `${APPS_SCRIPT_URL}?action=getSegments&_=${Date.now()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Failed to fetch segments");
  return json.data as Segment[];
}

function groupSegmentsByPenyulang(segments: Segment[]): GroupedData[] {
  const grouped: Record<string, GroupedData> = {};
  const now = new Date();

  segments.forEach((seg) => {
    const p = seg.penyulang;
    if (!grouped[p]) {
      grouped[p] = { penyulang: p, segments: [], totalPanjang: 0, totalSegmen: 0, sudahDicek: 0, sudahDicekRabas: 0, persentase: 0, persentaseRabas: 0, temuan: 0, pending: 0, selesai: 0 };
    }
    grouped[p].segments.push(seg);
    grouped[p].totalPanjang += seg.panjangSegment;
    grouped[p].totalSegmen += 1;

    if (seg.tglCek) {
      const d = new Date(seg.tglCek);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) grouped[p].sudahDicek++;
    }
    if (seg.tglRabas) {
      const d = new Date(seg.tglRabas);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) grouped[p].sudahDicekRabas++;
    }
  });

  return Object.values(grouped).map((g) => ({
    ...g,
    persentase: g.totalSegmen > 0 ? (g.sudahDicek / g.totalSegmen) * 100 : 0,
    persentaseRabas: g.totalSegmen > 0 ? (g.sudahDicekRabas / g.totalSegmen) * 100 : 0,
  }));
}

function getGradient(pct: number) {
  if (pct >= 80) return "from-green-500 to-emerald-400";
  if (pct >= 60) return "from-yellow-500 to-yellow-400";
  if (pct >= 40) return "from-orange-500 to-orange-400";
  return "from-red-500 to-red-600";
}

function getTextColor(pct: number) {
  if (pct >= 80) return "text-green-400";
  if (pct >= 60) return "text-yellow-400";
  return "text-red-400";
}

function ProgressBar({ pct }: { pct: number }) {
  const label = pct >= 80 ? "Excellent" : pct >= 60 ? "Good" : pct >= 40 ? "Fair" : "Poor";
  return (
    <div className="w-full space-y-1">
      <div className="flex justify-between items-center">
        <span className={`text-xs font-semibold ${getTextColor(pct)}`}>{pct.toFixed(1)}%</span>
        <span className="text-xs text-[#94A3B8]">{label}</span>
      </div>
      <div className="w-full bg-[#1e3552] rounded-full h-2 overflow-hidden">
        <div
          className={`h-full bg-linear-to-r ${getGradient(pct)} transition-all duration-1000 rounded-full`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

export default function TabelSegment() {
  const [data, setData] = useState<GroupedData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: "asc" | "desc" }>({ key: null, direction: "asc" });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [segmentData, { data: inspeksiData, error: supaErr }] = await Promise.all([
        getSegmentData(),
        supabaseBrowser.from("inspeksi").select("penyulang, status"),
      ]);

      if (supaErr) throw new Error(supaErr.message);

      const byPenyulang: Record<string, { temuan: number; pending: number; selesai: number }> = {};
      (inspeksiData ?? []).forEach((row: { penyulang: string; status: string }) => {
        const p = row.penyulang;
        if (!byPenyulang[p]) byPenyulang[p] = { temuan: 0, pending: 0, selesai: 0 };
        if (row.status === "Temuan") byPenyulang[p].temuan++;
        else if (row.status === "Pending") byPenyulang[p].pending++;
        else if (row.status === "Selesai") byPenyulang[p].selesai++;
      });

      const grouped = groupSegmentsByPenyulang(segmentData).map((g) => ({
        ...g,
        temuan: byPenyulang[g.penyulang]?.temuan ?? 0,
        pending: byPenyulang[g.penyulang]?.pending ?? 0,
        selesai: byPenyulang[g.penyulang]?.selesai ?? 0,
      }));

      setData(grouped);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Gagal memuat data: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const filtered = useMemo(
    () => data.filter((i) => i.penyulang.toLowerCase().includes(searchTerm.toLowerCase())),
    [data, searchTerm]
  );

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const av = (a as unknown as Record<string, unknown>)[sortConfig.key] as number | string;
    const bv = (b as unknown as Record<string, unknown>)[sortConfig.key] as number | string;
    if (av < bv) return sortConfig.direction === "asc" ? -1 : 1;
    if (av > bv) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  }), [filtered, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({ key, direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc" }));
  };

  const summary = data.reduce((acc, i) => ({
    totalPenyulang: acc.totalPenyulang + 1,
    totalKM: acc.totalKM + i.totalPanjang,
    totalSegmen: acc.totalSegmen + i.totalSegmen,
    totalDicek: acc.totalDicek + i.sudahDicek,
    avgPersentase: acc.avgPersentase + i.persentase,
  }), { totalPenyulang: 0, totalKM: 0, totalSegmen: 0, totalDicek: 0, avgPersentase: 0 });
  if (data.length > 0) summary.avgPersentase /= data.length;

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-700/30 rounded-xl p-8 text-center">
        <MapPin className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-[#e2e8f0] font-semibold mb-2">Error Memuat Data</h3>
        <p className="text-red-600 text-sm mb-4">{error}</p>
        <button onClick={fetchData} className="inline-flex items-center gap-2 px-4 py-2 bg-[#00897B] hover:bg-[#00695C] text-white rounded-lg text-sm">
          <RefreshCw className="w-4 h-4" /> Coba Lagi
        </button>
      </div>
    );
  }

  const SortTh = ({ sortKey, children }: { sortKey: string; children: React.ReactNode }) => (
    <th
      className="text-left px-4 py-3 text-[#5eead4] font-semibold text-xs cursor-pointer hover:text-[#00897B] select-none"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortConfig.key === sortKey && (
          <span className="text-xs">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
        )}
      </div>
    </th>
  );

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: <MapPin className="w-5 h-5 text-blue-400" />, bg: "bg-blue-900/20", value: loading ? "..." : summary.totalPenyulang, label: "Total Penyulang", color: "text-blue-400" },
          { icon: <TrendingUp className="w-5 h-5 text-green-400" />, bg: "bg-green-900/20", value: loading ? "..." : summary.totalKM.toFixed(1), label: "Total KM", color: "text-green-400" },
          { icon: <Target className="w-5 h-5 text-[#00897B]" />, bg: "bg-[#0a2a26]", value: loading ? "..." : `${summary.avgPersentase.toFixed(1)}%`, label: "Avg Progress", color: "text-[#00897B]" },
          { icon: <Activity className="w-5 h-5 text-yellow-400" />, bg: "bg-yellow-900/20", value: loading ? "..." : `${summary.totalDicek} / ${summary.totalSegmen}`, label: "Segments Checked", color: "text-yellow-400" },
        ].map(({ icon, bg, value, label, color }) => (
          <div key={label} className="bg-[#162334] border border-[#1e3552] rounded-xl shadow-sm hover:shadow-md transition-shadow p-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${bg}`}>{icon}</div>
              <div>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-[#94a3b8]">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Table Card */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-full bg-[#0a2a26]">
                <MapPin className="w-6 h-6 text-[#00897B]" />
              </div>
              <div>
                <h3 className="text-[#e2e8f0] text-lg font-bold">Data Segment Penyulang</h3>
                <p className="text-[#94a3b8] text-sm">
                  Data dari Google Sheets — Bulan {new Date().toLocaleDateString("id-ID", { month: "long" })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {loading && <div className="w-5 h-5 border-2 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />}
              <button onClick={fetchData} disabled={loading} className="p-2 rounded-full bg-[#0d1b2a] hover:bg-[#0a2a26] text-[#94a3b8] disabled:opacity-50 transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#94A3B8]" />
              <input
                type="text"
                placeholder="Cari penyulang..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-[#0d1b2a] border border-[#1e3552] rounded-lg text-[#e2e8f0] text-sm focus:outline-none focus:ring-2 focus:ring-[#00897B]/20 focus:border-[#00897B]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 rounded-lg bg-[#0d1b2a] hover:bg-[#0a2a26] text-[#94a3b8] transition-colors">
                <Filter className="w-4 h-4" />
              </button>
              <button className="p-2 rounded-lg bg-[#0d1b2a] hover:bg-[#0a2a26] text-[#94a3b8] transition-colors">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#0a2a26]">
                <SortTh sortKey="penyulang">Penyulang</SortTh>
                <SortTh sortKey="totalPanjang">Total KM</SortTh>
                <SortTh sortKey="totalSegmen">Total Segmen</SortTh>
                <SortTh sortKey="sudahDicek">Inspeksi</SortTh>
                <SortTh sortKey="persentase">Progress</SortTh>
                <SortTh sortKey="sudahDicekRabas">Perabasan</SortTh>
                <SortTh sortKey="persentaseRabas">Progress</SortTh>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-t border-[#1e3552]">
                    {Array(7).fill(null).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-[#1e3552] rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-[#94A3B8]">
                    <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>Tidak ada data</p>
                  </td>
                </tr>
              ) : sorted.map((item, i) => (
                <tr key={i} className="border-t border-[#1e3552] hover:bg-[#0d1b2a] transition-colors">
                  <td className="px-4 py-3 font-medium text-[#e2e8f0]">{item.penyulang}</td>
                  <td className="px-4 py-3 text-[#94a3b8]">{item.totalPanjang.toFixed(2)} KM</td>
                  <td className="px-4 py-3 text-[#94a3b8]">{item.totalSegmen}</td>
                  <td className="px-4 py-3 text-[#94a3b8]">
                    <div className="flex items-center gap-1">
                      <span>{item.sudahDicek}</span>
                      <span className="text-[#94A3B8]">/ {item.totalSegmen}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[140px]"><ProgressBar pct={item.persentase} /></td>
                  <td className="px-4 py-3 text-[#94a3b8]">
                    <div className="flex items-center gap-1">
                      <span>{item.sudahDicekRabas}</span>
                      <span className="text-[#94A3B8]">/ {item.totalSegmen}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 min-w-[140px]"><ProgressBar pct={item.persentaseRabas} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && sorted.length > 0 && (
          <div className="px-5 py-3 border-t border-[#1e3552] flex items-center justify-between text-sm text-[#94a3b8]">
            <p>Menampilkan {sorted.length} dari {data.length} penyulang</p>
            <p>Total: {summary.totalDicek} / {summary.totalSegmen} segment dicek</p>
          </div>
        )}
      </div>
    </div>
  );
}
