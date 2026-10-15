"use client";

import { Database, CheckCircle2, XCircle, Minus } from "lucide-react";
import type { SaidiSaifiData, UlpSaidiSaifi } from "../_hooks/useSaidiSaifi";

interface Props {
  data: SaidiSaifiData | null;
  loading: boolean;
  selectedULP: string;
  noKeypoint: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function status(actual: number, target: number): "ok" | "over" | "none" {
  if (target === 0) return "none";
  return actual <= target ? "ok" : "over";
}

function StatusBadge({ actual, target }: { actual: number; target: number }) {
  const s = status(actual, target);
  if (s === "none") return <span className="text-ink-muted text-[10px]">—</span>;
  if (s === "ok")
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
        <CheckCircle2 className="w-3 h-3" /> Sesuai
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-red-600">
      <XCircle className="w-3 h-3" /> Lewat
    </span>
  );
}

function fmt(n: number, dec = 2) {
  return n.toFixed(dec);
}

function fmtPelanggan(n: number) {
  return n.toLocaleString("id-ID");
}

// ── KPI card (used in single-ULP view) ───────────────────────────────────────

function KpiCard({
  label, full, value, unit, target, targetLabel, color, borderCls,
}: {
  label: string;
  full: string;
  value: string;
  unit: string;
  target: number;
  targetLabel: string;
  color: string;
  borderCls: string;
}) {
  const s = status(parseFloat(value), target);
  return (
    <div className={`rounded-xl border p-4 bg-white ${borderCls}`}>
      <p className={`text-xs font-medium mb-0.5 ${color}`}>{label}</p>
      <p className="text-[10px] text-ink-muted mb-3">{full}</p>
      <p className={`text-3xl font-black ${color} leading-none`}>{value}</p>
      <p className="text-ink-soft text-[10px] mt-1 mb-3">{unit}</p>

      {target > 0 ? (
        <div className="border-t border-line pt-2 flex items-center justify-between">
          <span className="text-[10px] text-ink-muted">
            Target: <span className="text-ink-soft font-medium">{targetLabel}</span>
          </span>
          <StatusBadge actual={parseFloat(value)} target={target} />
        </div>
      ) : (
        <div className="border-t border-line pt-2">
          <span className="flex items-center gap-1 text-[10px] text-ink-muted">
            <Minus className="w-3 h-3" /> Target tidak tersedia untuk periode ini
          </span>
        </div>
      )}

      {/* Bar */}
      {target > 0 && (
        <div className="mt-2 h-1 bg-line rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min((parseFloat(value) / target) * 100, 150)}%`,
              backgroundColor: s === "ok" ? "#10b981" : "#ef4444",
            }}
          />
        </div>
      )}
    </div>
  );
}

// ── Table row (used in ALL-ULP view) ─────────────────────────────────────────

function TableRow({ row, isTotal }: { row: UlpSaidiSaifi; isTotal?: boolean }) {
  const saidiSt = status(row.saidi, row.targetSaidi);
  const saifiSt = status(row.saifi, row.targetSaifi);

  const rowCls = isTotal
    ? "border-t-2 border-line bg-brand-50/60"
    : "border-t border-line hover:bg-white transition-colors";

  const cellCls = "py-2.5 px-3 text-xs";

  function StCell({ actual, target, dec }: { actual: number; target: number; dec: number }) {
    const s = status(actual, target);
    return (
      <>
        <td className={`${cellCls} font-semibold ${isTotal ? "text-ink" : "text-ink"}`}>
          {fmt(actual, dec)}
        </td>
        <td className={`${cellCls} text-ink-soft`}>
          {target > 0 ? fmt(target, dec) : "—"}
        </td>
        <td className={cellCls}>
          {s === "none" ? <span className="text-ink-muted">—</span>
            : s === "ok"
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              : <XCircle className="w-3.5 h-3.5 text-red-600" />}
        </td>
      </>
    );
  }

  return (
    <tr className={rowCls}>
      <td className={`${cellCls} font-bold ${isTotal ? "text-brand-600" : "text-ink"}`}>
        {row.ulp}
      </td>
      <td className={`${cellCls} text-ink-soft text-right`}>
        {fmtPelanggan(row.pelanggan)}
      </td>
      <StCell actual={row.saidi} target={row.targetSaidi} dec={2} />
      <StCell actual={row.saifi} target={row.targetSaifi} dec={3} />
      <td className={`${cellCls} text-ink-soft`}>
        {row.caidi > 0 ? fmt(row.caidi, 1) : "—"}
      </td>
    </tr>
  );
}

// ── No-data placeholder ───────────────────────────────────────────────────────

function NoData({ noKeypoint }: { noKeypoint: boolean }) {
  return (
    <div className="h-28 flex flex-col items-center justify-center gap-2">
      <Database className="w-7 h-7 text-ink-muted/50" />
      <p className="text-ink-soft text-sm">
        {noKeypoint
          ? "Sheet KEYPOINT belum tersedia — tambahkan data pelanggan per penyulang"
          : "Tidak ada data gangguan untuk periode ini"}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SaidiSaifiCard({ data, loading, selectedULP, noKeypoint }: Props) {
  const isAll = selectedULP === "ALL";

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-brand-50 rounded-lg">
            <Database className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-lg">SAIDI / SAIFI / CAIDI</h3>
            <p className="text-ink-soft text-xs mt-0.5">KPI Keandalan Standar IEEE 1366 / PLN — Target 2026</p>
          </div>
        </div>
        <p className="text-ink-soft text-xs leading-relaxed border-l-2 border-brand-300 pl-3">
          SAIDI: total menit padam per pelanggan · SAIFI: frekuensi padam per pelanggan ·
          CAIDI: rata-rata durasi per kejadian. Target diakumulasikan sesuai bulan dalam periode filter.
        </p>
      </div>

      {/* Body */}
      <div className="px-5 pb-5">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-36 bg-white rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !data ? (
          <NoData noKeypoint={noKeypoint} />
        ) : isAll ? (
          /* ── ALL ULP: summary cards + table ── */
          <div className="space-y-4">
            {/* UP3 summary KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <KpiCard
                label="SAIDI UP3"
                full="System Average Interruption Duration Index"
                value={fmt(data.total.saidi)}
                unit="menit / pelanggan"
                target={data.total.targetSaidi}
                targetLabel={`${fmt(data.total.targetSaidi)} mnt`}
                color="text-blue-600"
                borderCls="border-blue-500/30"
              />
              <KpiCard
                label="SAIFI UP3"
                full="System Average Interruption Frequency Index"
                value={fmt(data.total.saifi, 3)}
                unit="kali / pelanggan"
                target={data.total.targetSaifi}
                targetLabel={fmt(data.total.targetSaifi, 3)}
                color="text-purple-600"
                borderCls="border-purple-500/30"
              />
              <KpiCard
                label="CAIDI UP3"
                full="Customer Average Interruption Duration Index"
                value={data.total.caidi > 0 ? fmt(data.total.caidi, 1) : "—"}
                unit="menit / gangguan"
                target={0}
                targetLabel=""
                color="text-brand-600"
                borderCls="border-brand-200"
              />
            </div>

            {/* Per-ULP table */}
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full min-w-max text-xs border-collapse">
                <thead>
                  <tr className="bg-white">
                    <th className="text-left py-2.5 px-3 text-ink-soft font-semibold" rowSpan={2}>ULP</th>
                    <th className="text-right py-2.5 px-3 text-ink-soft font-semibold" rowSpan={2}>Pelanggan</th>
                    <th className="text-center py-1.5 px-3 text-blue-600 font-semibold border-b border-line" colSpan={3}>
                      SAIDI (mnt/plg)
                    </th>
                    <th className="text-center py-1.5 px-3 text-purple-600 font-semibold border-b border-line" colSpan={3}>
                      SAIFI (kali/plg)
                    </th>
                    <th className="text-center py-2.5 px-3 text-brand-600 font-semibold" rowSpan={2}>
                      CAIDI (mnt)
                    </th>
                  </tr>
                  <tr className="bg-white">
                    <th className="text-center py-1.5 px-3 text-ink-soft font-medium">Aktual</th>
                    <th className="text-center py-1.5 px-3 text-ink-soft font-medium">Target</th>
                    <th className="py-1.5 px-3" />
                    <th className="text-center py-1.5 px-3 text-ink-soft font-medium">Aktual</th>
                    <th className="text-center py-1.5 px-3 text-ink-soft font-medium">Target</th>
                    <th className="py-1.5 px-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.byUlp.map((row) => (
                    <TableRow key={row.ulp} row={row} />
                  ))}
                  <TableRow row={data.total} isTotal />
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── Single ULP: 3 KPI cards ── */
          (() => {
            const ulpRow = data.byUlp.find((r) => r.ulp === selectedULP) ?? data.byUlp[0];
            if (!ulpRow) return <NoData noKeypoint={noKeypoint} />;
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <KpiCard
                  label="SAIDI"
                  full="System Average Interruption Duration Index"
                  value={fmt(ulpRow.saidi)}
                  unit="menit / pelanggan"
                  target={ulpRow.targetSaidi}
                  targetLabel={`${fmt(ulpRow.targetSaidi)} mnt`}
                  color="text-blue-600"
                  borderCls="border-blue-500/30"
                />
                <KpiCard
                  label="SAIFI"
                  full="System Average Interruption Frequency Index"
                  value={fmt(ulpRow.saifi, 3)}
                  unit="kali / pelanggan"
                  target={ulpRow.targetSaifi}
                  targetLabel={fmt(ulpRow.targetSaifi, 3)}
                  color="text-purple-600"
                  borderCls="border-purple-500/30"
                />
                <KpiCard
                  label="CAIDI"
                  full="Customer Average Interruption Duration Index"
                  value={ulpRow.caidi > 0 ? fmt(ulpRow.caidi, 1) : "—"}
                  unit="menit / gangguan"
                  target={0}
                  targetLabel=""
                  color="text-brand-600"
                  borderCls="border-brand-200"
                />
              </div>
            );
          })()
        )}

        {/* Footnote: pelanggan total info */}
        {!loading && data && (
          <p className="text-[10px] text-ink-muted mt-3 text-right">
            Total pelanggan sistem: {fmtPelanggan(data.total.pelanggan)} · Target berlaku untuk bulan-bulan 2026 dalam periode filter
          </p>
        )}
      </div>
    </div>
  );
}
