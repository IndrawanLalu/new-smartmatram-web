"use client";

import { useState } from "react";
import { BarChart2 } from "lucide-react";
import type { MonthKategoriRow } from "../_hooks/useAdvancedDashboard";

interface Props {
  rows: MonthKategoriRow[];
  monthKeys: string[];
  loading?: boolean;
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function mkLabel(key: string, multiYear: boolean): string {
  const [y, m] = key.split("-");
  return multiYear ? `${MONTH_SHORT[parseInt(m) - 1]}'${y.slice(2)}` : MONTH_SHORT[parseInt(m) - 1];
}

function cellCls(count: number, max: number): string {
  if (!count || !max) return "text-[#2a3a52]";
  const pct = count / max;
  if (pct < 0.15) return "bg-teal-950/50 text-teal-500/70";
  if (pct < 0.35) return "bg-teal-900/50 text-teal-300";
  if (pct < 0.60) return "bg-teal-800/60 text-teal-100";
  if (pct < 0.80) return "bg-teal-700/70 text-white";
  return "bg-[#00897B] text-white font-bold";
}

// ── Trend helpers ─────────────────────────────────────────────────────────────

type TrendDir = "up" | "flat" | "down";

function computeTrend(values: number[]): { dir: TrendDir; pct: number } {
  if (values.length < 2) return { dir: "flat", pct: 0 };
  const half = Math.ceil(values.length / 2);
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / Math.max(arr.length, 1);
  const a1 = avg(values.slice(0, half));
  const a2 = avg(values.slice(half));
  if (a1 === 0 && a2 === 0) return { dir: "flat", pct: 0 };
  if (a1 === 0) return { dir: "up", pct: 100 };
  const change = ((a2 - a1) / a1) * 100;
  const dir: TrendDir = change > 8 ? "up" : change < -8 ? "down" : "flat";
  return { dir, pct: Math.abs(Math.round(change)) };
}

const TREND_COLOR: Record<TrendDir, string> = {
  up:   "#f87171",
  down: "#34d399",
  flat: "#64748b",
};

function Sparkline({ values, dir }: { values: number[]; dir: TrendDir }) {
  const W = 56, H = 20;
  const max = Math.max(...values, 1);
  const n = values.length;
  if (n < 2) return null;

  const pts = values
    .map((v, i) => `${(i / (n - 1)) * W},${H - (v / max) * H * 0.9 + H * 0.05}`)
    .join(" ");

  const lastX = W;
  const lastY = H - (values[n - 1] / max) * H * 0.9 + H * 0.05;
  const color = TREND_COLOR[dir];

  return (
    <svg width={W} height={H} style={{ overflow: "visible" }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.8}
      />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

function TrendBadge({ dir, pct }: { dir: TrendDir; pct: number }) {
  if (dir === "flat") {
    return <span className="text-[#64748b] text-[10px] font-medium leading-none">→ stabil</span>;
  }
  const isUp = dir === "up";
  return (
    <span className={`text-[10px] font-bold leading-none ${isUp ? "text-red-400" : "text-emerald-400"}`}>
      {isUp ? "↑" : "↓"} {pct}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MonthKategoriHeatmap({ rows, monthKeys, loading = false }: Props) {
  const [hovered, setHovered] = useState<{ ri: number; ci: number } | null>(null);

  if (loading) {
    return <div className="bg-[#162334] rounded-xl border border-[#1e3552] h-60 animate-pulse" />;
  }
  if (!rows.length || !monthKeys.length) return null;

  const maxVal = Math.max(...rows.flatMap((r) => monthKeys.map((mk) => r.byMonth[mk] ?? 0)), 1);
  const multiYear = new Set(monthKeys.map((k) => k.split("-")[0])).size > 1;
  const colTotals = monthKeys.map((mk) => rows.reduce((s, r) => s + (r.byMonth[mk] ?? 0), 0));
  const grandTotal = rows.reduce((s, r) => s + r.total, 0);

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-blue-900/20 rounded-lg">
            <BarChart2 className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-[#e2e8f0] font-bold text-lg">Tren Musiman per Kategori Penyebab</h3>
            <p className="text-[#94a3b8] text-xs mt-0.5">Penyebab × Bulan — intensitas + arah tren tiap kategori</p>
          </div>
        </div>
        <p className="text-[#94a3b8] text-xs leading-relaxed border-l-2 border-blue-500/50 pl-3">
          Warna tiap sel menunjukkan intensitas kejadian. Kolom <span className="text-[#e2e8f0]">Tren</span> menampilkan
          grafik mini dan arah perubahan (rata-rata paruh awal vs paruh akhir periode).
          <span className="text-red-400 ml-1">↑ Naik = memburuk</span> ·
          <span className="text-emerald-400 ml-1">↓ Turun = membaik</span>.
        </p>
      </div>

      <div className="px-5 pb-5 overflow-x-auto">
        <table className="text-xs border-collapse w-full min-w-max">
          <thead>
            <tr>
              <th className="text-left text-[#94a3b8] font-medium py-1.5 pr-4 min-w-40">Kategori</th>
              {monthKeys.map((mk) => (
                <th key={mk} className="text-center text-[#94a3b8] font-medium py-1.5 px-1 min-w-10">
                  {mkLabel(mk, multiYear)}
                </th>
              ))}
              <th className="text-center text-[#94a3b8] font-medium py-1.5 px-2 min-w-12">Total</th>
              <th className="text-left text-[#94a3b8] font-medium py-1.5 pl-3 min-w-28">Tren</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => {
              const values = monthKeys.map((mk) => row.byMonth[mk] ?? 0);
              const { dir, pct } = computeTrend(values);
              const isHovRow = hovered?.ri === ri;

              return (
                <tr key={row.kategori} className="border-t border-[#1e3552]/50">
                  <td className="text-[#e2e8f0] py-1.5 pr-4 font-medium whitespace-nowrap">{row.kategori}</td>

                  {monthKeys.map((mk, ci) => {
                    const val = row.byMonth[mk] ?? 0;
                    const isHov = isHovRow && hovered?.ci === ci;
                    return (
                      <td
                        key={mk}
                        title={`${row.kategori} — ${mkLabel(mk, multiYear)}: ${val} gangguan`}
                        className={`text-center py-1.5 px-1 rounded cursor-default transition-all ${cellCls(val, maxVal)} ${isHov ? "ring-1 ring-white/30" : ""}`}
                        onMouseEnter={() => setHovered({ ri, ci })}
                        onMouseLeave={() => setHovered(null)}
                      >
                        {val || "·"}
                      </td>
                    );
                  })}

                  <td className="text-center py-1.5 px-2 text-[#e2e8f0] font-semibold">{row.total}</td>

                  {/* Tren: sparkline + badge */}
                  <td className="py-1 pl-3 pr-2">
                    <div className="flex flex-col gap-0.5">
                      <Sparkline values={values} dir={dir} />
                      <TrendBadge dir={dir} pct={pct} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-[#1e3552]">
              <td className="text-[#94a3b8] py-1.5 pr-4 font-medium">Total</td>
              {colTotals.map((t, ci) => (
                <td key={ci} className="text-center py-1.5 px-1 text-[#94a3b8] font-medium">{t || ""}</td>
              ))}
              <td className="text-center py-1.5 px-2 text-[#e2e8f0] font-bold">{grandTotal}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
