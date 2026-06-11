"use client";

import { useState } from "react";
import {
  Search, ChevronLeft, ChevronRight,
  Gauge, AlertTriangle, Wrench, Zap, RefreshCw,
} from "lucide-react";
import { type CurrentUser } from "@/lib/roles";
import { useGarduStatus, type GarduLatestState } from "../_hooks/useGarduStatus";
import { type AnomalySettings } from "../_utils/detectAnomali";
import { OVERLOAD_PCT } from "../_hooks/usePengukuranGardu";
import GarduTimelineModal from "./GarduTimelineModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const INPUT_CLASS =
  "border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function BebanBar({ pct }: { pct: number }) {
  const barCls = pct >= OVERLOAD_PCT ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-green-500";
  const txtCls = pct >= OVERLOAD_PCT ? "text-red-400" : pct >= 60 ? "text-amber-400" : "text-green-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 bg-[#0a1628] rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${barCls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-bold ${txtCls}`}>{Math.round(pct)}%</span>
    </div>
  );
}

function SourceBadge({ type }: { type: GarduLatestState["event_type"] }) {
  return type === "pengukuran" ? (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#00897B]/15 text-[#5eead4] border border-[#00897B]/30 font-medium whitespace-nowrap">
      <Zap size={9} /> Ukur
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-900/30 text-blue-300 border border-blue-500/30 font-medium whitespace-nowrap">
      <Wrench size={9} /> Seimbang
    </span>
  );
}

function KPICard({
  label, value, sub, icon: Icon, variant = "default",
}: {
  label: string; value: number | string; sub: string;
  icon: React.ElementType; variant?: "default" | "danger" | "warning" | "info";
}) {
  const s = {
    default: { card: "border-[#1e3552]",       icon: "bg-[#0a2a26] text-[#5eead4]",      val: "text-[#e2e8f0]" },
    danger:  { card: "border-red-500/40",       icon: "bg-red-900/30 text-red-400",        val: "text-red-400" },
    warning: { card: "border-amber-500/40",     icon: "bg-amber-900/30 text-amber-400",    val: "text-amber-400" },
    info:    { card: "border-blue-500/40",      icon: "bg-blue-900/30 text-blue-400",      val: "text-blue-400" },
  }[variant];
  return (
    <div className={`bg-[#162334] rounded-xl border p-4 flex items-center gap-3 ${s.card}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.icon}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-[#94a3b8] truncate">{label}</p>
        <p className={`text-2xl font-bold leading-tight ${s.val}`}>{value}</p>
        <p className="text-xs text-[#94a3b8]">{sub}</p>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  user: CurrentUser;
  ulp: string;
  settings: AnomalySettings;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataGarduTab({ user, ulp, settings }: Props) {
  const {
    data, allData, rawData,
    loading, error,
    filter, setFilter,
    page, setPage, totalPages, totalFiltered,
    penyulangOptions,
    anomaliMap, anomaliCount, penyeimbanganCount, avgBeban,
    refresh,
  } = useGarduStatus(user, ulp, settings);

  const [selectedGardu, setSelectedGardu] = useState<GarduLatestState | null>(null);

  return (
    <div className="space-y-5">

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard label="Total Gardu Terpantau" value={rawData.length} sub="semua gardu" icon={Gauge} />
        <KPICard label="Anomali Saat Ini" value={anomaliCount} sub="sesuai kriteria aktif" icon={AlertTriangle} variant="danger" />
        <KPICard label="Kondisi dari Pemeliharaan" value={penyeimbanganCount} sub="tanpa ukur ulang" icon={Wrench} variant="info" />
        <KPICard label="Rata-rata Beban" value={`${avgBeban}%`} sub="semua gardu terpantau" icon={Gauge} variant={avgBeban >= OVERLOAD_PCT ? "danger" : "default"} />
      </div>

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <input
            type="text"
            value={filter.search}
            onChange={(e) => { setFilter({ ...filter, search: e.target.value }); setPage(1); }}
            placeholder="Cari no. gardu, penyulang, alamat..."
            className={`w-full pl-8 pr-3 py-1.5 text-sm border border-[#1e3552] rounded-lg bg-[#0d1b2a] text-[#e2e8f0] placeholder:text-[#4a5568] focus:outline-none focus:border-[#00897B]`}
          />
        </div>

        <select
          value={filter.penyulang}
          onChange={(e) => { setFilter({ ...filter, penyulang: e.target.value }); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value="">Semua Penyulang</option>
          {penyulangOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filter.anomaliOnly}
            onChange={(e) => { setFilter({ ...filter, anomaliOnly: e.target.checked }); setPage(1); }}
            className="w-3.5 h-3.5 accent-[#00897B]"
          />
          <span className="text-xs text-[#e2e8f0]">Anomali saja</span>
        </label>

        <button
          onClick={refresh}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[#1e3552] text-[#94a3b8] hover:text-[#5eead4] hover:border-[#00897B]/40 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>

        <span className="text-xs text-[#475569] ml-auto">{totalFiltered} gardu</span>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
        {error && (
          <div className="m-4 bg-red-900/30 border border-red-500/40 rounded-lg p-3 text-red-300 text-sm">{error}</div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-14 gap-2 text-[#94a3b8] text-sm">
            <div className="w-5 h-5 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
            Memuat data gardu...
          </div>
        )}

        {!loading && allData.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-14 text-[#475569]">
            <Gauge size={28} />
            <p className="text-sm">Belum ada data gardu terpantau.</p>
            <p className="text-xs">Jalankan SQL view di Supabase untuk mengaktifkan fitur ini.</p>
          </div>
        )}

        {!loading && allData.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-[#0a1628]">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5eead4]">No. Gardu</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Penyulang</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Alamat</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-[#5eead4]">KVA</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-[#5eead4]">Beban</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-[#5eead4]">Arus R/S/T</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-[#5eead4]">Suhu°C</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-[#5eead4]">Sumber</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Tgl Update</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-[#5eead4]">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e3552]">
                  {data.map((row, i) => {
                    const anomali = anomaliMap.get(row.no_gardu);
                    return (
                      <tr
                        key={row.no_gardu}
                        onClick={() => setSelectedGardu(row)}
                        className={`cursor-pointer transition-colors hover:bg-[#1e3552]/50 ${
                          i % 2 === 0 ? "bg-[#162334]" : "bg-[#0d1b2a]"
                        }`}
                      >
                        <td className="px-4 py-2.5 font-semibold text-[#e2e8f0]">{row.no_gardu}</td>
                        <td className="px-4 py-2.5 text-xs text-[#94a3b8]">{row.penyulang ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-[#94a3b8] max-w-40 truncate">{row.alamat ?? "—"}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-[#94a3b8]">{row.kva_trafo}</td>
                        <td className="px-4 py-2.5">
                          <BebanBar pct={row.persen_beban} />
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-mono text-[#94a3b8]">
                          {Math.round(row.total_arus_r)}/{Math.round(row.total_arus_s)}/{Math.round(row.total_arus_t)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs">
                          {row.suhu_trafo != null ? (
                            <span className={row.suhu_trafo > 60 ? "text-amber-400 font-semibold" : "text-[#94a3b8]"}>
                              {row.suhu_trafo}
                            </span>
                          ) : (
                            <span className="text-[#475569]">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <SourceBadge type={row.event_type} />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-[#94a3b8]">{fmtDate(row.event_date)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {anomali?.isAnomali ? (
                            <span
                              title={anomali.reasons.join(" · ")}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-400 border border-red-500/30 font-semibold cursor-help"
                            >
                              Anomali
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-500/30 font-semibold">
                              Normal
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-[#1e3552] flex items-center justify-between">
                <span className="text-xs text-[#94a3b8]">
                  {totalFiltered} gardu · Hal {page}/{totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-[#1e3552] text-[#94a3b8] hover:bg-[#0d1b2a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded border border-[#1e3552] text-[#94a3b8] hover:bg-[#0d1b2a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Timeline Modal */}
      {selectedGardu && (
        <GarduTimelineModal
          gardu={selectedGardu}
          onClose={() => setSelectedGardu(null)}
          settings={settings}
        />
      )}
    </div>
  );
}
