"use client";

import { useMemo, useState } from "react";
import {
  ComposedChart,
  Bar,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import { X, CheckCircle2, Clock, Zap, ShieldCheck, AlertTriangle, Minus, Maximize2, Plus } from "lucide-react";
import type { PenyulangEffectiveness, Trend } from "../_hooks/useInspeksiEffectiveness";
import type { CurrentUser } from "@/lib/roles";
import SwimlaneTimeline from "./SwimlaneTimeline";
import LigaInputModal from "./_LigaInputModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function fmtMonth(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTH_ID[parseInt(m) - 1]} '${y.slice(2)}`;
}

function fmtDate(s: string): string {
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

const GROUP_CONFIG = {
  A: { label: "Efektif", color: "text-emerald-400", bg: "bg-emerald-900/20", border: "border-emerald-500/30" },
  B: { label: "Parsial", color: "text-amber-400",   bg: "bg-amber-900/20",   border: "border-amber-500/30" },
  C: { label: "Belum Diinspeksi", color: "text-slate-400", bg: "bg-slate-800/40", border: "border-slate-500/30" },
};

const STATUS_COLOR: Record<string, string> = {
  Selesai:        "text-emerald-400 bg-emerald-900/20",
  "Dalam Proses": "text-blue-400 bg-blue-900/20",
  Ditugaskan:     "text-purple-400 bg-purple-900/20",
  "Perlu Tindakan": "text-amber-400 bg-amber-900/20",
  Temuan:         "text-orange-400 bg-orange-900/20",
};

const TREND_CFG: Record<Trend, { label: string; cls: string }> = {
  turun:  { label: "Turun",  cls: "text-emerald-400" },
  naik:   { label: "Naik",   cls: "text-red-400" },
  stabil: { label: "Stabil", cls: "text-blue-400" },
  none:   { label: "—",      cls: "text-[#64748b]" },
};

interface TooltipPayload {
  dataKey?: string;
  value?: number;
  color?: string;
  name?: string;
}

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipPayload[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-lg p-2.5 text-xs shadow-xl">
      <p className="text-[#94a3b8] font-semibold mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  penyulang: PenyulangEffectiveness;
  user: CurrentUser;
  periodLabel: string;
  onClose: () => void;
}

export default function PenyulangDetailModal({ penyulang: p, user, periodLabel, onClose }: Props) {
  const gcfg = GROUP_CONFIG[p.group];
  const [swimlaneFullscreen, setSwimlaneFullscreen] = useState(false);
  const [showLigaModal, setShowLigaModal] = useState(false);
  const canInputLiga = user.role === "admin" || user.role === "UP3";

  // ── Monthly chart data ────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const monthSet = new Set<string>();
    p.gangguanEvents.forEach((e) => monthSet.add(e.date.substring(0, 7)));
    p.inspeksiList.forEach((i) => {
      monthSet.add(i.tgl_inspeksi.substring(0, 7));
      if (i.tgl_eksekusi) monthSet.add(i.tgl_eksekusi.substring(0, 7));
    });

    const sortedMonths = [...monthSet].sort();
    return sortedMonths.map((ym) => ({
      ym,
      label: fmtMonth(ym),
      gangguan: p.gangguanEvents.filter((e) => e.date.startsWith(ym)).length,
      inspeksi: p.inspeksiList.filter((i) => i.tgl_inspeksi.startsWith(ym)).length,
      eksekusi: p.inspeksiList.filter((i) => i.tgl_eksekusi?.startsWith(ym)).length,
    }));
  }, [p]);

  // firstSelesai month label for reference line
  const selesaiMonth = p.firstSelesai ? p.firstSelesai.substring(0, 7) : null;
  const selesaiLabel = selesaiMonth ? fmtMonth(selesaiMonth) : null;

  // LIGA reference lines — deduplikasi per bulan
  const ligaMonthLabels = useMemo(() => {
    const months = [...new Set(p.ligaExekusiDates.map(d => d.substring(0, 7)))];
    return months.map(ym => fmtMonth(ym));
  }, [p.ligaExekusiDates]);

  // ── Gangguan list grouped by month ───────────────────────────────────────
  const gangguanByMonth = useMemo(() => {
    const groups: Record<string, typeof p.gangguanEvents> = {};
    for (const e of [...p.gangguanEvents].sort((a, b) => b.date.localeCompare(a.date))) {
      const mk = e.date.substring(0, 7);
      if (!groups[mk]) groups[mk] = [];
      groups[mk].push(e);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [p.gangguanEvents]);

  const trendCfg = TREND_CFG[p.trend];

  return (
    <>
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-5 pb-4 border-b border-[#1e3552] shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#0a2a26] rounded-lg">
              <ShieldCheck className="w-5 h-5 text-[#00897B]" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] font-bold text-base leading-tight">{p.penyulang}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[#64748b] text-xs">{p.ulp}</p>
                <span className="text-[#1e3552]">·</span>
                <p className="text-xs text-[#5eead4] font-medium">{periodLabel}</p>
              </div>
            </div>
            <span className={`ml-2 inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${gcfg.bg} ${gcfg.color}`}>
              Grup {p.group}: {gcfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {canInputLiga && (
              <button
                onClick={() => setShowLigaModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Input LIGA
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e3552] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">

          {/* KPI strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-3 text-center">
              <Zap className="w-4 h-4 text-red-400 mx-auto mb-1" />
              <p className="text-2xl font-black text-red-400">{p.gangguanCount}</p>
              <p className="text-[10px] text-[#64748b]">Total gangguan</p>
            </div>
            <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-3 text-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
              <p className="text-2xl font-black text-emerald-400">{p.eksekusiSelesai}</p>
              <p className="text-[10px] text-[#64748b]">{p.inspeksiTotal} inspeksi · {p.eksekusiRate.toFixed(0)}% selesai</p>
            </div>
            <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-3 text-center">
              <Clock className="w-4 h-4 text-[#94a3b8] mx-auto mb-1" />
              <p className="text-sm font-bold text-[#e2e8f0]">{p.firstSelesai ?? "—"}</p>
              <p className="text-[10px] text-[#64748b]">Pertama selesai</p>
            </div>
            <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-3 text-center">
              {p.trend === "turun" ? <AlertTriangle className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                : p.trend === "naik" ? <AlertTriangle className="w-4 h-4 text-red-400 mx-auto mb-1" />
                : <Minus className="w-4 h-4 text-[#64748b] mx-auto mb-1" />}
              <p className={`text-base font-bold ${trendCfg.cls}`}>{trendCfg.label}</p>
              {p.firstSelesai && (
                <p className="text-[10px] text-[#64748b]">
                  {p.gangguanBefore} sblm → {p.gangguanAfter} ssdh
                </p>
              )}
              {!p.firstSelesai && <p className="text-[10px] text-[#64748b]">Tren gangguan</p>}
            </div>
          </div>

          {/* Swimlane: proaktif / reaktif timeline */}
          {(p.gangguanEvents.length > 0 || p.inspeksiList.length > 0) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-[#94a3b8]">Timeline Inspeksi vs Gangguan</p>
                <div className="flex items-center gap-3 text-[10px]">
                  <span className="text-emerald-400 font-semibold">{p.proaktifCount} Proaktif</span>
                  <span className="text-amber-400 font-semibold">{p.reaktifCount} Reaktif</span>
                  <button
                    onClick={() => setSwimlaneFullscreen(true)}
                    title="Fullscreen"
                    className="p-1 rounded text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e3552] transition-colors"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="bg-[#0a1628] rounded-xl border border-[#1e3552] p-3">
                <SwimlaneTimeline data={p} />
              </div>
            </div>
          )}

          {/* Swimlane fullscreen overlay */}
          {swimlaneFullscreen && (
            <div
              className="fixed inset-0 z-[70] flex flex-col"
              style={{ backgroundColor: "rgba(5,10,20,0.97)", backdropFilter: "blur(4px)" }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-3 border-b border-[#1e3552] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-[#94a3b8]">Timeline Inspeksi vs Gangguan</span>
                  <span className="text-sm font-semibold text-[#5eead4]">— {p.penyulang}</span>
                  <span className="text-xs text-[#64748b]">{p.ulp}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-emerald-400 font-semibold">{p.proaktifCount} Proaktif</span>
                  <span className="text-amber-400 font-semibold">{p.reaktifCount} Reaktif</span>
                  <button
                    onClick={() => setSwimlaneFullscreen(false)}
                    className="p-1.5 rounded-lg text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e3552] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Body: fills remaining height */}
              <div className="flex-1 min-h-0 p-4 flex flex-col">
                <div className="flex-1 min-h-0 bg-[#0a1628] rounded-2xl border border-[#1e3552] p-4 flex flex-col">
                  <SwimlaneTimeline data={p} fullscreen />
                </div>
              </div>
            </div>
          )}

          {/* Timeline chart bulanan */}
          {chartData.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#94a3b8] mb-2">Gangguan & Inspeksi per Bulan</p>
              <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-4">
                <ResponsiveContainer width="100%" height={180}>
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e3552" />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} allowDecimals={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      formatter={(value) => <span style={{ color: "#94a3b8", fontSize: 10 }}>{value}</span>}
                    />
                    <Bar dataKey="gangguan" name="Gangguan" fill="#ef4444" fillOpacity={0.8} radius={[2, 2, 0, 0]}>
                      <LabelList dataKey="gangguan" position="center" style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }} formatter={(v: unknown) => Number(v) > 0 ? String(Number(v)) : ""} />
                    </Bar>
                    <Bar dataKey="inspeksi" name="Inspeksi" fill="#34d399" fillOpacity={0.7} radius={[2, 2, 0, 0]}>
                      <LabelList dataKey="inspeksi" position="center" style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }} formatter={(v: unknown) => Number(v) > 0 ? String(Number(v)) : ""} />
                    </Bar>
                    <Bar dataKey="eksekusi" name="Eksekusi" fill="#6366f1" fillOpacity={0.8} radius={[2, 2, 0, 0]}>
                      <LabelList dataKey="eksekusi" position="center" style={{ fill: "#fff", fontSize: 10, fontWeight: 700 }} formatter={(v: unknown) => Number(v) > 0 ? String(Number(v)) : ""} />
                    </Bar>
                    {selesaiLabel && (
                      <ReferenceLine
                        x={selesaiLabel}
                        stroke="#fbbf24"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        label={{ value: "✓ Selesai", position: "insideTopLeft", fill: "#fbbf24", fontSize: 9 }}
                      />
                    )}
                    {ligaMonthLabels.map((label, i) => (
                      <ReferenceLine
                        key={`liga-${i}`}
                        x={label}
                        stroke="#6366f1"
                        strokeWidth={2}
                        strokeDasharray="4 4"
                        label={(props: { viewBox?: { x: number; y: number } }) => {
                          const { x = 0, y = 0 } = props.viewBox ?? {};
                          return (
                            <g>
                              <rect x={x - 18} y={y + 4} width={36} height={16} rx={4} fill="#4f46e5" />
                              <text x={x} y={y + 16} textAnchor="middle" fontSize={11} fill="#e0e7ff" fontWeight="bold">
                                LIGA
                              </text>
                            </g>
                          );
                        }}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-4 mt-1 flex-wrap">
                  {selesaiLabel && (
                    <p className="text-[10px] text-amber-400">
                      — Kuning: eksekusi pertama selesai
                    </p>
                  )}
                  {ligaMonthLabels.length > 0 && (
                    <p className="text-[10px] text-indigo-400">
                      — Indigo: eksekusi LIGA
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Two-column: inspeksi list + gangguan list */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Inspeksi list */}
            <div>
              <p className="text-xs font-semibold text-[#94a3b8] mb-2">
                Daftar Inspeksi ({p.inspeksiList.length})
              </p>
              <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
                {p.inspeksiList.length === 0 ? (
                  <p className="p-4 text-xs text-[#64748b] text-center">Tidak ada inspeksi dalam periode ini</p>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead className="sticky top-0 bg-[#0d1b2a]">
                        <tr>
                          <th className="text-left py-2 px-3 text-[#64748b] font-semibold">Tgl Inspeksi</th>
                          <th className="text-left py-2 px-3 text-[#64748b] font-semibold">Tipe</th>
                          <th className="text-left py-2 px-3 text-[#64748b] font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...p.inspeksiList].reverse().map((ins, i) => (
                          <tr key={i} className="border-t border-[#1e3552]/50 hover:bg-[#0d1b2a]/40 transition-colors">
                            <td className="py-2 px-3 text-[#e2e8f0]">{ins.tgl_inspeksi}</td>
                            <td className="py-2 px-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${ins.type === "jaringan" ? "bg-blue-900/30 text-blue-400" : "bg-green-900/30 text-green-400"}`}>
                                {ins.type}
                              </span>
                            </td>
                            <td className="py-2 px-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${STATUS_COLOR[ins.status] ?? "text-[#64748b]"}`}>
                                {ins.status || "—"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Gangguan dates list */}
            <div>
              <p className="text-xs font-semibold text-[#94a3b8] mb-2">
                Tanggal Gangguan ({p.gangguanCount})
              </p>
              <div className="bg-[#162334] rounded-xl border border-[#1e3552] max-h-64 overflow-y-auto">
                {gangguanByMonth.length === 0 ? (
                  <p className="p-4 text-xs text-[#64748b] text-center">Tidak ada gangguan</p>
                ) : (
                  <div className="divide-y divide-[#1e3552]/50">
                    {gangguanByMonth.map(([ym, events]) => {
                      const isBeforeSelesai = selesaiMonth && ym < selesaiMonth;
                      const isSelesaiMonth  = ym === selesaiMonth;
                      return (
                        <div key={ym} className="px-3 py-2">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-bold text-[#94a3b8]">{fmtMonth(ym)}</span>
                            <span className="text-[10px] text-[#64748b]">({events.length}x)</span>
                            {isBeforeSelesai && (
                              <span className="text-[9px] px-1 bg-amber-900/30 text-amber-400 rounded">sebelum</span>
                            )}
                            {isSelesaiMonth && (
                              <span className="text-[9px] px-1 bg-emerald-900/30 text-emerald-400 rounded">✓ selesai</span>
                            )}
                          </div>
                          <div className="flex flex-col gap-1">
                            {events.map((e, ei) => (
                              <div key={`${e.date}-${ei}`}
                                className={`flex items-start gap-2 text-[10px] px-2 py-1 rounded ${
                                  selesaiMonth && e.date < (p.firstSelesai ?? "")
                                    ? "bg-red-900/20"
                                    : "bg-[#0d1b2a]"
                                }`}
                              >
                                <span className={`font-mono shrink-0 ${
                                  selesaiMonth && e.date < (p.firstSelesai ?? "")
                                    ? "text-red-400"
                                    : "text-[#94a3b8]"
                                }`}>
                                  {e.date.split("-").slice(1).join("-")}
                                </span>
                                {e.keypoint && (
                                  <span className="text-amber-300/80 truncate">{e.keypoint}</span>
                                )}
                                {e.penyebab && (
                                  <span className="text-[#64748b] shrink-0">{e.penyebab}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── GH Breakdown ───────────────────────────────────────────────── */}
          {p.ghChildren.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#94a3b8] mb-2">
                Breakdown per GH / Keypoint ({p.ghChildren.length})
              </p>
              <div className="space-y-2">
                {p.ghChildren.map((gh) => (
                  <div key={gh.name} className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
                    {/* GH Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-[#1e3552]/50">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#5eead4]">{gh.name}</span>
                        <span className="text-[10px] text-[#64748b]">{gh.total} inspeksi</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 bg-[#1e3552] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#00897B] rounded-full"
                            style={{ width: `${gh.eksekusiRate}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-semibold text-[#94a3b8]">
                          {gh.selesai}/{gh.total} ({gh.eksekusiRate.toFixed(0)}%)
                        </span>
                      </div>
                    </div>
                    {/* GH Inspeksi rows */}
                    <div className="divide-y divide-[#1e3552]/30">
                      {gh.inspeksiList.map((ins, ii) => (
                        <div key={ii} className="flex items-center gap-2 px-3 py-1.5 text-[10px]">
                          <span className="font-mono text-[#94a3b8] w-16 shrink-0">
                            {ins.tgl_inspeksi.split("-").slice(1).join("-")}
                          </span>
                          <span className={`px-1 rounded text-[9px] font-semibold shrink-0 ${
                            ins.type === "jaringan"
                              ? "bg-sky-900/40 text-sky-400"
                              : "bg-green-900/40 text-green-400"
                          }`}>
                            {ins.type === "jaringan" ? "JRG" : "PHN"}
                          </span>
                          <span className={`px-1 rounded text-[9px] shrink-0 ${
                            ins.status === "Selesai"
                              ? "bg-emerald-900/30 text-emerald-400"
                              : ins.status === "Dalam Proses"
                              ? "bg-blue-900/30 text-blue-400"
                              : "bg-amber-900/30 text-amber-400"
                          }`}>
                            {ins.status}
                          </span>
                          {ins.daysSinceLastGangguan && (
                            <span className="text-amber-400/70">
                              ← {ins.daysSinceLastGangguan}h dari gangguan
                            </span>
                          )}
                          {ins.daysToNextGangguan && (
                            <span className="text-green-400/70">
                              → {ins.daysToNextGangguan}h ke gangguan berikutnya
                            </span>
                          )}
                          {ins.tgl_eksekusi && (
                            <span className="text-[#64748b] ml-auto shrink-0">
                              eksekusi {ins.tgl_eksekusi.split("-").slice(1).join("-")}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#1e3552] shrink-0 flex items-center justify-between text-[10px] text-[#64748b]">
          <span>
            Klik di luar modal untuk tutup · Data gangguan dari Google Sheets, inspeksi dari Supabase
          </span>
          <button onClick={onClose}
            className="px-3 py-1.5 bg-[#1e3552] hover:bg-[#00897B]/30 text-[#94a3b8] hover:text-[#e2e8f0] rounded-lg text-xs transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>

    {/* LIGA Input Modal */}
    {showLigaModal && (
      <LigaInputModal
        defaultPenyulang={p.penyulang}
        user={user}
        onClose={() => setShowLigaModal(false)}
        onSaved={() => setShowLigaModal(false)}
      />
    )}
    </>
  );
}
