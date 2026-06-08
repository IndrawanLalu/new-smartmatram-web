"use client";

import { Shield, AlertTriangle, Eye, Repeat2, Grid2x2, Clock, BarChart2, TrendingUp } from "lucide-react";
import type { PenyulangRisk, RiskLevel, RiskReason } from "../_hooks/usePenyulangWatchlist";

interface Props {
  items: PenyulangRisk[];
  loading?: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────

const LEVEL_CONFIG: Record<RiskLevel, {
  label: string;
  icon: React.ElementType;
  badgeCls: string;
  borderCls: string;
  rankCls: string;
  glowCls: string;
}> = {
  DARURAT: {
    label: "DARURAT",
    icon: AlertTriangle,
    badgeCls: "bg-red-500 text-white",
    borderCls: "border-red-500/40",
    rankCls: "bg-red-900/30 text-red-400 border-red-500/40",
    glowCls: "shadow-red-900/20",
  },
  KRITIS: {
    label: "KRITIS",
    icon: Shield,
    badgeCls: "bg-amber-500 text-white",
    borderCls: "border-amber-500/40",
    rankCls: "bg-amber-900/30 text-amber-400 border-amber-500/40",
    glowCls: "shadow-amber-900/20",
  },
  WASPADA: {
    label: "WASPADA",
    icon: Eye,
    badgeCls: "bg-blue-500 text-white",
    borderCls: "border-blue-500/30",
    rankCls: "bg-blue-900/30 text-blue-400 border-blue-500/30",
    glowCls: "",
  },
};

const REASON_CONFIG: Record<RiskReason["type"], { cls: string; icon: React.ElementType }> = {
  repeat:   { cls: "bg-red-900/30 text-red-300 border-red-500/30",    icon: Repeat2 },
  critical: { cls: "bg-orange-900/30 text-orange-300 border-orange-500/30", icon: Grid2x2 },
  mtbf:     { cls: "bg-purple-900/30 text-purple-300 border-purple-500/30", icon: Clock },
  pareto:   { cls: "bg-teal-900/30 text-teal-300 border-teal-500/30",  icon: BarChart2 },
};

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score, level }: { score: number; level: RiskLevel }) {
  const max = 16;
  const pct = Math.min((score / max) * 100, 100);
  const color = level === "DARURAT" ? "#ef4444" : level === "KRITIS" ? "#f59e0b" : "#3b82f6";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[#0d1b2a] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-[10px] font-black" style={{ color }}>{score} pts</span>
    </div>
  );
}

// ── Risk card ─────────────────────────────────────────────────────────────────

function RiskCard({ item, rank }: { item: PenyulangRisk; rank: number }) {
  const lc = LEVEL_CONFIG[item.level];
  const LIcon = lc.icon;

  return (
    <div className={`rounded-xl border bg-[#0d1b2a] shadow-sm ${lc.borderCls} ${lc.glowCls}`}>
      {/* Top row */}
      <div className="px-4 pt-3 pb-2 flex items-start gap-3">
        {/* Rank */}
        <div className={`shrink-0 w-8 h-8 rounded-lg border flex items-center justify-center text-xs font-black ${lc.rankCls}`}>
          #{rank}
        </div>

        {/* Name + ULP + Level */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className={`flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded ${lc.badgeCls}`}>
              <LIcon className="w-3 h-3" />
              {lc.label}
            </span>
            <span className="text-[10px] px-2 py-0.5 bg-[#162334] border border-[#1e3552] rounded text-[#94a3b8] font-medium">
              ULP {item.ulp}
            </span>
          </div>
          <p className="text-[#e2e8f0] font-bold text-sm leading-tight truncate">{item.penyulang}</p>
        </div>

        {/* Count badge */}
        <div className="shrink-0 text-right">
          <p className="text-[10px] text-[#94a3b8]">Total</p>
          <p className="text-lg font-black text-[#e2e8f0] leading-none">{item.count}</p>
          <p className="text-[9px] text-[#64748b]">gangguan</p>
        </div>
      </div>

      {/* Score bar */}
      <div className="px-4 pb-2">
        <ScoreBar score={item.score} level={item.level} />
      </div>

      {/* Key stats */}
      {(item.mtbfDays !== undefined || item.maxIn7Days !== undefined || item.paretoRank !== undefined || item.avgDurMin !== undefined) && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {item.paretoRank !== undefined && (
            <Stat icon={<BarChart2 className="w-3 h-3" />} label={`Pareto #${item.paretoRank}`} />
          )}
          {item.maxIn7Days !== undefined && (
            <Stat icon={<Repeat2 className="w-3 h-3" />} label={`${item.maxIn7Days}× / 7 hari`} />
          )}
          {item.mtbfDays !== undefined && (
            <Stat icon={<Clock className="w-3 h-3" />} label={`MTBF ${item.mtbfDays} hari`} />
          )}
          {item.avgDurMin !== undefined && (
            <Stat icon={<TrendingUp className="w-3 h-3" />} label={`Avg ${item.avgDurMin} mnt`} />
          )}
        </div>
      )}

      {/* Reason badges */}
      <div className="px-4 pb-2 flex flex-wrap gap-1.5">
        {item.reasons.map((r, i) => {
          const rc = REASON_CONFIG[r.type];
          const RIcon = rc.icon;
          return (
            <span
              key={i}
              title={r.detail}
              className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border cursor-default ${rc.cls}`}
            >
              <RIcon className="w-3 h-3 shrink-0" />
              {r.label}
            </span>
          );
        })}
      </div>

      {/* Reason details */}
      <div className="px-4 pb-2 space-y-0.5">
        {item.reasons.map((r, i) => (
          <p key={i} className="text-[10px] text-[#64748b] leading-relaxed">
            <span className="text-[#94a3b8] font-medium">{r.label}:</span> {r.detail}
          </p>
        ))}
      </div>

      {/* Recommendation */}
      <div className="mx-4 mb-4 rounded-lg bg-[#162334] border border-[#1e3552] px-3 py-2.5">
        <p className="text-[9px] text-[#00897B] font-black uppercase tracking-wide mb-1">Rekomendasi</p>
        <p className="text-[#e2e8f0] text-xs leading-relaxed">{item.recommendation}</p>
      </div>
    </div>
  );
}

function Stat({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-[#94a3b8] bg-[#162334] border border-[#1e3552] px-2 py-0.5 rounded">
      {icon}
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PenyulangWatchlist({ items, loading = false }: Props) {
  const darurat = items.filter((i) => i.level === "DARURAT").length;
  const kritis  = items.filter((i) => i.level === "KRITIS").length;
  const waspada = items.filter((i) => i.level === "WASPADA").length;

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-900/20 rounded-lg">
              <Shield className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] font-bold text-lg">Penyulang Watchlist</h3>
              <p className="text-[#94a3b8] text-xs mt-0.5">
                Penyulang dengan risiko tertinggi berdasarkan multi-kriteria
              </p>
            </div>
          </div>

          {/* Summary badges */}
          {!loading && items.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {darurat > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-red-500 text-white rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5" /> {darurat} Darurat
                </span>
              )}
              {kritis > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-amber-500 text-white rounded-lg">
                  <Shield className="w-3.5 h-3.5" /> {kritis} Kritis
                </span>
              )}
              {waspada > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-blue-500 text-white rounded-lg">
                  <Eye className="w-3.5 h-3.5" /> {waspada} Waspada
                </span>
              )}
            </div>
          )}
        </div>

        <p className="text-[#94a3b8] text-xs leading-relaxed border-l-2 border-red-500/50 pl-3">
          Skor dihitung dari kombinasi: <span className="text-red-300">Repeat Offender</span>,{" "}
          <span className="text-orange-300">Kuadran Kritis</span>,{" "}
          <span className="text-purple-300">MTBF Rendah</span>, dan{" "}
          <span className="text-teal-300">Pareto Top</span>.
          Hover badge alasan untuk melihat detail. Penyulang DARURAT membutuhkan tindakan segera.
        </p>
      </div>

      {/* Body */}
      <div className="px-5 pb-5">
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array(6).fill(0).map((_, i) => (
              <div key={i} className="h-52 bg-[#0d1b2a] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center gap-2">
            <Shield className="w-8 h-8 text-green-400/50" />
            <p className="text-green-400 text-sm font-medium">Tidak ada penyulang berisiko tinggi</p>
            <p className="text-[#94a3b8] text-xs">Semua penyulang dalam kondisi terkendali pada periode ini</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item, i) => (
              <RiskCard key={item.penyulang} item={item} rank={i + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
