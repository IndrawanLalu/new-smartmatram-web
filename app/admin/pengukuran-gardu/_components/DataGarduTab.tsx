"use client";

import { useState, useMemo } from "react";
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
  "border border-line rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 bg-white";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function BebanBar({ pct }: { pct: number }) {
  const barCls = pct >= OVERLOAD_PCT ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-green-500";
  const txtCls = pct >= OVERLOAD_PCT ? "text-red-600" : pct >= 60 ? "text-amber-600" : "text-green-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 bg-surface rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${barCls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs font-bold ${txtCls}`}>{Math.round(pct)}%</span>
    </div>
  );
}

function SourceBadge({ type }: { type: GarduLatestState["event_type"] }) {
  return type === "pengukuran" ? (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-navy-50 text-navy-600 border border-navy-200 font-medium whitespace-nowrap">
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
    default: { card: "border-line",       icon: "bg-navy-50 text-accent-deep",      val: "text-ink" },
    danger:  { card: "border-red-500/40",       icon: "bg-red-900/30 text-red-600",        val: "text-red-600" },
    warning: { card: "border-amber-500/40",     icon: "bg-amber-900/30 text-amber-600",    val: "text-amber-600" },
    info:    { card: "border-blue-500/40",      icon: "bg-blue-900/30 text-blue-400",      val: "text-blue-400" },
  }[variant];
  return (
    <div className={`bg-white rounded-xl border p-4 flex items-center gap-3 ${s.card}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${s.icon}`}>
        <Icon size={18} />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-ink-soft truncate">{label}</p>
        <p className={`text-2xl font-bold leading-tight ${s.val}`}>{value}</p>
        <p className="text-xs text-ink-soft">{sub}</p>
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
  const [showTable, setShowTable] = useState(false);

  const {
    data, allData, rawData,
    loading, error,
    filter, setFilter,
    page, setPage, totalPages, totalFiltered,
    penyulangOptions,
    anomaliMap, anomaliCount, penyeimbanganCount, avgBeban,
    refresh,
  } = useGarduStatus(user, ulp, settings, showTable);

  const [selectedGardu, setSelectedGardu] = useState<GarduLatestState | null>(null);

  const kvaOptions = useMemo(
    () => [...new Set(rawData.map((d) => d.kva_trafo))].sort((a, b) => a - b),
    [rawData]
  );

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
      <div className="bg-white rounded-xl border border-line px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            value={filter.search}
            onChange={(e) => { setFilter({ ...filter, search: e.target.value }); setPage(1); }}
            placeholder="Cari no. gardu, penyulang, alamat..."
            className={`w-full pl-8 pr-3 py-1.5 text-sm border border-line rounded-lg bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500`}
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

        <select
          value={filter.kvaTrafo}
          onChange={(e) => { setFilter({ ...filter, kvaTrafo: e.target.value }); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value="">Semua KVA</option>
          {kvaOptions.map((k) => <option key={k} value={k}>{k} kVA</option>)}
        </select>

        <select
          value={filter.minBeban}
          onChange={(e) => { setFilter({ ...filter, minBeban: Number(e.target.value) }); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value={0}>Semua Beban</option>
          <option value={60}>Beban ≥60%</option>
          <option value={80}>Beban ≥80%</option>
          <option value={100}>Beban ≥100%</option>
        </select>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filter.anomaliOnly}
            onChange={(e) => { setFilter({ ...filter, anomaliOnly: e.target.checked }); setPage(1); }}
            className="w-3.5 h-3.5 accent-navy-600"
          />
          <span className="text-xs text-ink">Anomali saja</span>
        </label>

        <div className="flex items-center gap-2 ml-auto">
          {showTable && (
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-line text-ink-soft hover:text-accent-deep hover:border-navy-300 transition-colors"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          )}
          {showTable
            ? <span className="text-xs text-ink-muted">{totalFiltered} gardu</span>
            : (
              <button
                onClick={() => setShowTable(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-navy-600 text-white font-semibold hover:opacity-90 transition-opacity"
              >
                <Gauge size={12} /> Tampilkan Data
              </button>
            )
          }
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-line overflow-hidden">
        {!showTable && (
          <div className="flex flex-col items-center gap-2 py-16 text-ink-muted">
            <Gauge size={32} className="opacity-40" />
            <p className="text-sm">Data gardu belum ditampilkan.</p>
            <p className="text-xs">Atur filter di atas, lalu klik <strong className="text-ink-soft">Tampilkan Data</strong>.</p>
          </div>
        )}

        {showTable && error && (
          <div className="m-4 bg-red-900/30 border border-red-500/40 rounded-lg p-3 text-red-300 text-sm">{error}</div>
        )}

        {showTable && loading && (
          <div className="flex items-center justify-center py-14 gap-2 text-ink-soft text-sm">
            <div className="w-5 h-5 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
            Memuat data gardu...
          </div>
        )}

        {showTable && !loading && allData.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-14 text-ink-muted">
            <Gauge size={28} />
            <p className="text-sm">Belum ada data gardu terpantau.</p>
            <p className="text-xs">Jalankan SQL view di Supabase untuk mengaktifkan fitur ini.</p>
          </div>
        )}

        {showTable && !loading && allData.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-surface">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-accent-deep">No. Gardu</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-accent-deep">Penyulang</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-accent-deep">Alamat</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-accent-deep">KVA</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-accent-deep">Beban</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-accent-deep">Arus R/S/T</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-accent-deep">Suhu°C</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-accent-deep">Sumber</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-accent-deep">Tgl Update</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-accent-deep">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.map((row, i) => {
                    const anomali = anomaliMap.get(row.no_gardu);
                    return (
                      <tr
                        key={row.no_gardu}
                        onClick={() => setSelectedGardu(row)}
                        className={`cursor-pointer transition-colors hover:bg-line/50 ${
                          i % 2 === 0 ? "bg-white" : "bg-white"
                        }`}
                      >
                        <td className="px-4 py-2.5 font-semibold text-ink">{row.no_gardu}</td>
                        <td className="px-4 py-2.5 text-xs text-ink-soft">{row.penyulang ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-ink-soft max-w-40 truncate">{row.alamat ?? "—"}</td>
                        <td className="px-4 py-2.5 text-center text-xs text-ink-soft">{row.kva_trafo}</td>
                        <td className="px-4 py-2.5">
                          <BebanBar pct={row.persen_beban} />
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-mono text-ink-soft">
                          {Math.round(row.total_arus_r)}/{Math.round(row.total_arus_s)}/{Math.round(row.total_arus_t)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs">
                          {row.suhu_trafo != null ? (
                            <span className={row.suhu_trafo > 60 ? "text-amber-600 font-semibold" : "text-ink-soft"}>
                              {row.suhu_trafo}
                            </span>
                          ) : (
                            <span className="text-ink-muted">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <SourceBadge type={row.event_type} />
                        </td>
                        <td className="px-4 py-2.5 text-xs text-ink-soft">{fmtDate(row.event_date)}</td>
                        <td className="px-4 py-2.5 text-center">
                          {anomali?.isAnomali ? (
                            <span
                              title={anomali.reasons.join(" · ")}
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/40 text-red-600 border border-red-500/30 font-semibold cursor-help"
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
              <div className="px-5 py-3 border-t border-line flex items-center justify-between">
                <span className="text-xs text-ink-soft">
                  {totalFiltered} gardu · Hal {page}/{totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-line text-ink-soft hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded border border-line text-ink-soft hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
