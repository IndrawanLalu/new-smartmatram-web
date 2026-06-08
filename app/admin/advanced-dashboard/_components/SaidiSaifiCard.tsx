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
  if (s === "none") return <span className="text-[#64748b] text-[10px]">—</span>;
  if (s === "ok")
    return (
      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">
        <CheckCircle2 className="w-3 h-3" /> Sesuai
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">
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
    <div className={`rounded-xl border p-4 bg-[#0d1b2a] ${borderCls}`}>
      <p className={`text-xs font-medium mb-0.5 ${color}`}>{label}</p>
      <p className="text-[10px] text-[#64748b] mb-3">{full}</p>
      <p className={`text-3xl font-black ${color} leading-none`}>{value}</p>
      <p className="text-[#94a3b8] text-[10px] mt-1 mb-3">{unit}</p>

      {target > 0 ? (
        <div className="border-t border-[#1e3552] pt-2 flex items-center justify-between">
          <span className="text-[10px] text-[#64748b]">
            Target: <span className="text-[#94a3b8] font-medium">{targetLabel}</span>
          </span>
          <StatusBadge actual={parseFloat(value)} target={target} />
        </div>
      ) : (
        <div className="border-t border-[#1e3552] pt-2">
          <span className="flex items-center gap-1 text-[10px] text-[#64748b]">
            <Minus className="w-3 h-3" /> Target tidak tersedia untuk periode ini
          </span>
        </div>
      )}

      {/* Bar */}
      {target > 0 && (
        <div className="mt-2 h-1 bg-[#1e3552] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min((parseFloat(value) / target) * 100, 150)}%`,
              backgroundColor: s === "ok" ? "#34d399" : "#f87171",
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
    ? "border-t-2 border-[#1e3552] bg-[#0a2a26]/30"
    : "border-t border-[#1e3552]/50 hover:bg-[#0d1b2a]/50 transition-colors";

  const cellCls = "py-2.5 px-3 text-xs";

  function StCell({ actual, target, dec }: { actual: number; target: number; dec: number }) {
    const s = status(actual, target);
    return (
      <>
        <td className={`${cellCls} font-semibold ${isTotal ? "text-[#e2e8f0]" : "text-[#e2e8f0]"}`}>
          {fmt(actual, dec)}
        </td>
        <td className={`${cellCls} text-[#94a3b8]`}>
          {target > 0 ? fmt(target, dec) : "—"}
        </td>
        <td className={cellCls}>
          {s === "none" ? <span className="text-[#64748b]">—</span>
            : s === "ok"
              ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              : <XCircle className="w-3.5 h-3.5 text-red-400" />}
        </td>
      </>
    );
  }

  return (
    <tr className={rowCls}>
      <td className={`${cellCls} font-bold ${isTotal ? "text-[#00897B]" : "text-[#e2e8f0]"}`}>
        {row.ulp}
      </td>
      <td className={`${cellCls} text-[#94a3b8] text-right`}>
        {fmtPelanggan(row.pelanggan)}
      </td>
      <StCell actual={row.saidi} target={row.targetSaidi} dec={2} />
      <StCell actual={row.saifi} target={row.targetSaifi} dec={3} />
      <td className={`${cellCls} text-[#94a3b8]`}>
        {row.caidi > 0 ? fmt(row.caidi, 1) : "—"}
      </td>
    </tr>
  );
}

// ── No-data placeholder ───────────────────────────────────────────────────────

function NoData({ noKeypoint }: { noKeypoint: boolean }) {
  return (
    <div className="h-28 flex flex-col items-center justify-center gap-2">
      <Database className="w-7 h-7 text-[#1e3552]" />
      <p className="text-[#94a3b8] text-sm">
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
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-[#0a2a26] rounded-lg">
            <Database className="w-5 h-5 text-[#00897B]" />
          </div>
          <div>
            <h3 className="text-[#e2e8f0] font-bold text-lg">SAIDI / SAIFI / CAIDI</h3>
            <p className="text-[#94a3b8] text-xs mt-0.5">KPI Keandalan Standar IEEE 1366 / PLN — Target 2026</p>
          </div>
        </div>
        <p className="text-[#94a3b8] text-xs leading-relaxed border-l-2 border-[#00897B]/50 pl-3">
          SAIDI: total menit padam per pelanggan · SAIFI: frekuensi padam per pelanggan ·
          CAIDI: rata-rata durasi per kejadian. Target diakumulasikan sesuai bulan dalam periode filter.
        </p>
      </div>

      {/* Body */}
      <div className="px-5 pb-5">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="h-36 bg-[#0d1b2a] rounded-xl animate-pulse" />
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
                color="text-blue-400"
                borderCls="border-blue-500/30"
              />
              <KpiCard
                label="SAIFI UP3"
                full="System Average Interruption Frequency Index"
                value={fmt(data.total.saifi, 3)}
                unit="kali / pelanggan"
                target={data.total.targetSaifi}
                targetLabel={fmt(data.total.targetSaifi, 3)}
                color="text-purple-400"
                borderCls="border-purple-500/30"
              />
              <KpiCard
                label="CAIDI UP3"
                full="Customer Average Interruption Duration Index"
                value={data.total.caidi > 0 ? fmt(data.total.caidi, 1) : "—"}
                unit="menit / gangguan"
                target={0}
                targetLabel=""
                color="text-[#00897B]"
                borderCls="border-[#00897B]/30"
              />
            </div>

            {/* Per-ULP table */}
            <div className="overflow-x-auto rounded-xl border border-[#1e3552]">
              <table className="w-full min-w-max text-xs border-collapse">
                <thead>
                  <tr className="bg-[#0d1b2a]">
                    <th className="text-left py-2.5 px-3 text-[#94a3b8] font-semibold" rowSpan={2}>ULP</th>
                    <th className="text-right py-2.5 px-3 text-[#94a3b8] font-semibold" rowSpan={2}>Pelanggan</th>
                    <th className="text-center py-1.5 px-3 text-blue-400 font-semibold border-b border-[#1e3552]" colSpan={3}>
                      SAIDI (mnt/plg)
                    </th>
                    <th className="text-center py-1.5 px-3 text-purple-400 font-semibold border-b border-[#1e3552]" colSpan={3}>
                      SAIFI (kali/plg)
                    </th>
                    <th className="text-center py-2.5 px-3 text-[#00897B] font-semibold" rowSpan={2}>
                      CAIDI (mnt)
                    </th>
                  </tr>
                  <tr className="bg-[#0d1b2a]">
                    <th className="text-center py-1.5 px-3 text-[#94a3b8] font-medium">Aktual</th>
                    <th className="text-center py-1.5 px-3 text-[#94a3b8] font-medium">Target</th>
                    <th className="py-1.5 px-3" />
                    <th className="text-center py-1.5 px-3 text-[#94a3b8] font-medium">Aktual</th>
                    <th className="text-center py-1.5 px-3 text-[#94a3b8] font-medium">Target</th>
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
                  color="text-blue-400"
                  borderCls="border-blue-500/30"
                />
                <KpiCard
                  label="SAIFI"
                  full="System Average Interruption Frequency Index"
                  value={fmt(ulpRow.saifi, 3)}
                  unit="kali / pelanggan"
                  target={ulpRow.targetSaifi}
                  targetLabel={fmt(ulpRow.targetSaifi, 3)}
                  color="text-purple-400"
                  borderCls="border-purple-500/30"
                />
                <KpiCard
                  label="CAIDI"
                  full="Customer Average Interruption Duration Index"
                  value={ulpRow.caidi > 0 ? fmt(ulpRow.caidi, 1) : "—"}
                  unit="menit / gangguan"
                  target={0}
                  targetLabel=""
                  color="text-[#00897B]"
                  borderCls="border-[#00897B]/30"
                />
              </div>
            );
          })()
        )}

        {/* Footnote: pelanggan total info */}
        {!loading && data && (
          <p className="text-[10px] text-[#64748b] mt-3 text-right">
            Total pelanggan sistem: {fmtPelanggan(data.total.pelanggan)} · Target berlaku untuk bulan-bulan 2026 dalam periode filter
          </p>
        )}
      </div>
    </div>
  );
}
