"use client";

import { useState } from "react";
import {
  Lightbulb, AlertTriangle, AlertCircle, Info,
  Wrench, Activity, Zap, Users, ChevronDown, ChevronUp,
  CheckCircle2,
} from "lucide-react";
import type { Recommendation, Priority, Category } from "../_hooks/useRecommendations";

interface Props {
  recommendations: Recommendation[];
  loading?: boolean;
}

// ── Config ────────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<Priority, {
  label: string;
  icon: React.ElementType;
  headerCls: string;
  badgeCls: string;
  borderCls: string;
  actionBg: string;
}> = {
  KRITIS: {
    label: "KRITIS",
    icon: AlertTriangle,
    headerCls: "bg-red-900/20 border-red-500/30",
    badgeCls: "bg-red-500 text-white",
    borderCls: "border-red-500/30",
    actionBg: "bg-red-900/20 border-red-500/20",
  },
  PENTING: {
    label: "PENTING",
    icon: AlertCircle,
    headerCls: "bg-amber-900/20 border-amber-500/30",
    badgeCls: "bg-amber-500 text-white",
    borderCls: "border-amber-500/30",
    actionBg: "bg-amber-900/20 border-amber-500/20",
  },
  PERHATIAN: {
    label: "PERHATIAN",
    icon: Info,
    headerCls: "bg-blue-900/20 border-blue-500/30",
    badgeCls: "bg-blue-500 text-white",
    borderCls: "border-blue-500/30",
    actionBg: "bg-blue-900/20 border-blue-500/20",
  },
};

const CATEGORY_CONFIG: Record<Category, { icon: React.ElementType; cls: string }> = {
  Pemeliharaan: { icon: Wrench,    cls: "text-orange-400 bg-orange-900/20 border-orange-700/30" },
  Operasional:  { icon: Activity,  cls: "text-sky-400 bg-sky-900/20 border-sky-700/30" },
  Infrastruktur:{ icon: Zap,       cls: "text-violet-400 bg-violet-900/20 border-violet-700/30" },
  SDM:          { icon: Users,     cls: "text-teal-400 bg-teal-900/20 border-teal-700/30" },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function RecItem({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(rec.priority === "KRITIS");
  const pc = PRIORITY_CONFIG[rec.priority];
  const cc = CATEGORY_CONFIG[rec.category];
  const PIcon = pc.icon;
  const CIcon = cc.icon;

  return (
    <div className={`rounded-xl border overflow-hidden ${pc.headerCls}`}>
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3"
      >
        <div className="mt-0.5 shrink-0">
          <PIcon className={`w-4 h-4 ${rec.priority === "KRITIS" ? "text-red-400" : rec.priority === "PENTING" ? "text-amber-400" : "text-blue-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[10px] font-black px-2 py-0.5 rounded ${pc.badgeCls}`}>
              {pc.label}
            </span>
            <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded border ${cc.cls}`}>
              <CIcon className="w-3 h-3" />
              {rec.category}
            </span>
          </div>
          <p className="text-[#e2e8f0] text-sm font-semibold leading-snug">{rec.title}</p>
        </div>
        <div className="shrink-0 mt-0.5 text-[#94a3b8]">
          {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Expandable body */}
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          {/* Detail */}
          <p className="text-[#94a3b8] text-xs leading-relaxed">{rec.detail}</p>

          {/* Action */}
          <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 ${pc.actionBg}`}>
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#e2e8f0]" />
            <div>
              <p className="text-[10px] text-[#94a3b8] font-medium uppercase tracking-wide mb-0.5">Tindak Lanjut</p>
              <p className="text-[#e2e8f0] text-xs leading-relaxed">{rec.action}</p>
            </div>
          </div>

          {/* Affected assets */}
          {rec.assets && rec.assets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {rec.assets.slice(0, 8).map((a) => (
                <span key={a} className="text-[10px] px-2 py-0.5 bg-[#0d1b2a] border border-[#1e3552] rounded text-[#94a3b8]">
                  {a}
                </span>
              ))}
              {rec.assets.length > 8 && (
                <span className="text-[10px] px-2 py-0.5 text-[#64748b]">+{rec.assets.length - 8} lainnya</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RecommendationsCard({ recommendations, loading = false }: Props) {
  const kritis   = recommendations.filter((r) => r.priority === "KRITIS").length;
  const penting  = recommendations.filter((r) => r.priority === "PENTING").length;
  const perhatian = recommendations.filter((r) => r.priority === "PERHATIAN").length;

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#0a2a26] rounded-lg">
              <Lightbulb className="w-5 h-5 text-[#00897B]" />
            </div>
            <div>
              <h3 className="text-[#e2e8f0] font-bold text-lg">Analisis & Rekomendasi</h3>
              <p className="text-[#94a3b8] text-xs mt-0.5">
                Dihasilkan otomatis dari data periode yang dipilih
              </p>
            </div>
          </div>
          {/* Summary badges */}
          {!loading && recommendations.length > 0 && (
            <div className="flex items-center gap-2">
              {kritis > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-red-500 text-white rounded-lg">
                  <AlertTriangle className="w-3.5 h-3.5" /> {kritis} Kritis
                </span>
              )}
              {penting > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-amber-500 text-white rounded-lg">
                  <AlertCircle className="w-3.5 h-3.5" /> {penting} Penting
                </span>
              )}
              {perhatian > 0 && (
                <span className="flex items-center gap-1 text-xs font-bold px-3 py-1 bg-blue-500 text-white rounded-lg">
                  <Info className="w-3.5 h-3.5" /> {perhatian} Perhatian
                </span>
              )}
            </div>
          )}
        </div>
        <p className="text-[#94a3b8] text-xs leading-relaxed border-l-2 border-[#00897B]/50 pl-3">
          Rekomendasi berbasis aturan dari analisis Pareto, Priority Matrix, MTBF, Repeat Offender,
          Tren Musiman, dan Radar ULP. Klik tiap item untuk melihat detail dan tindak lanjut.
        </p>
      </div>

      {/* Body */}
      <div className="px-5 pb-5">
        {loading ? (
          <div className="space-y-3">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-14 bg-[#0d1b2a] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : recommendations.length === 0 ? (
          <div className="h-32 flex flex-col items-center justify-center gap-2">
            <CheckCircle2 className="w-8 h-8 text-green-400/50" />
            <p className="text-green-400 text-sm font-medium">Tidak ada rekomendasi kritis</p>
            <p className="text-[#94a3b8] text-xs">Semua indikator dalam kondisi baik pada periode ini</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {recommendations.map((rec) => (
              <RecItem key={rec.id} rec={rec} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
