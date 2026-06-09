"use client";

import React from "react";
import { JENIS_PEMELIHARAAN_OPTIONS } from "../_utils/constants";
import type { MonthStat } from "../_hooks/useYearlyStats";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Per-jenis group: header color, sub-header color, WO cell accent
const JENIS_STYLE = [
  { headBg: "#0d2d2a", headText: "#5eead4", subBg: "#0a2422" },  // teal   — PEMERATAAN BEBAN
  { headBg: "#1a2a3d", headText: "#93c5fd", subBg: "#162438" },  // blue   — OPTIMASI TRAFO
  { headBg: "#2a1f35", headText: "#d8b4fe", subBg: "#231830" },  // purple — PEMELIHARAAN GARDU
  { headBg: "#2d2210", headText: "#fcd34d", subBg: "#261d0d" },  // amber  — MANUVER BEBAN
] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function PctBadge({ pct, wo }: { pct: number; wo: number }) {
  if (wo === 0) return <span className="text-[#475569] text-xs">—</span>;
  const cls =
    pct >= 80 ? "bg-green-900/40 text-green-400" :
    pct >= 50 ? "bg-amber-900/40 text-amber-400" :
                "bg-red-900/40 text-red-400";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{pct}%</span>;
}

function Num({ v, color }: { v: number; color?: string }) {
  if (v === 0) return <span className="text-[#475569]">—</span>;
  return <span className={`font-semibold ${color ?? "text-[#e2e8f0]"}`}>{v}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  stats: MonthStat[];
  loading: boolean;
  currentMonth: number;
}

export default function YearlyStatsTable({ stats, loading, currentMonth }: Props) {
  // Compute column totals
  const totals = stats.reduce(
    (acc, s) => {
      acc.ukur     += s.jumlahUkur;
      acc.anomali  += s.jumlahAnomal;
      acc.bebanWsum += s.rataBeban * s.jumlahUkur;
      acc.bebanCount += s.jumlahUkur;
      acc.totalWo      += s.totalWo;
      acc.totalSelesai += s.totalSelesai;
      for (const j of JENIS_PEMELIHARAAN_OPTIONS) {
        acc.byJenis[j].wo      += s.byJenis[j]?.wo ?? 0;
        acc.byJenis[j].selesai += s.byJenis[j]?.selesai ?? 0;
      }
      return acc;
    },
    {
      ukur: 0, anomali: 0, bebanWsum: 0, bebanCount: 0,
      byJenis: Object.fromEntries(JENIS_PEMELIHARAAN_OPTIONS.map(j => [j, { wo: 0, selesai: 0 }])),
      totalWo: 0, totalSelesai: 0,
    }
  );
  const totalRata = totals.bebanCount > 0 ? Math.round(totals.bebanWsum / totals.bebanCount) : 0;
  const totalPct  = totals.totalWo > 0 ? Math.round((totals.totalSelesai / totals.totalWo) * 100) : 0;

  // Shared cell classes
  const TH = "px-3 py-2 text-center text-[11px] font-semibold border-b border-r border-[#1e3552] whitespace-nowrap";
  const TD = "px-3 py-2.5 text-center text-xs border-b border-r border-[#1e3552]";

  return (
    <div className="bg-[#0d1b2a] rounded-xl border border-[#1e3552] overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-3.5 border-b border-[#1e3552] flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-[#e2e8f0]">Rekap Tahunan</h3>
          <p className="text-xs text-[#94a3b8] mt-0.5">Pengukuran & Tindak Lanjut Anomali per Bulan</p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-[#94a3b8]">
            <div className="w-3.5 h-3.5 border-2 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
            Memuat...
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[#e2e8f0]" style={{ minWidth: 980 }}>
          <thead>
            {/* ── Row 1: Group headers ── */}
            <tr>
              {/* Bulan — rowSpan 2 */}
              <th
                rowSpan={2}
                className={`${TH} sticky left-0 z-10 text-teal-300 min-w-[110px] border-r-2`}
                style={{ background: "#0a2a26" }}
              >
                BULAN
              </th>
              {/* Fixed info cols — rowSpan 2 */}
              <th rowSpan={2} className={`${TH} text-[#94a3b8] min-w-[56px]`} style={{ background: "#0a1628" }}>Ukur</th>
              <th rowSpan={2} className={`${TH} text-[#94a3b8] min-w-[68px]`} style={{ background: "#0a1628" }}>Anomali</th>
              <th rowSpan={2} className={`${TH} text-[#94a3b8] min-w-[68px]`} style={{ background: "#0a1628" }}>Rata %</th>

              {/* Jenis group headers — colSpan 2 each */}
              {JENIS_PEMELIHARAAN_OPTIONS.map((j, i) => (
                <th
                  key={j}
                  colSpan={2}
                  className={`${TH}`}
                  style={{ background: JENIS_STYLE[i].headBg, color: JENIS_STYLE[i].headText }}
                >
                  {j}
                </th>
              ))}

              {/* Total — colSpan 2 */}
              <th colSpan={2} className={`${TH} text-[#94a3b8] min-w-[110px]`} style={{ background: "#0a1628" }}>
                TOTAL
              </th>
            </tr>

            {/* ── Row 2: WO / Selesai sub-headers ── */}
            <tr>
              {JENIS_PEMELIHARAAN_OPTIONS.map((j, i) => (
                <React.Fragment key={j}>
                  <th className={`${TH} font-normal text-[#94a3b8] min-w-[52px]`} style={{ background: JENIS_STYLE[i].subBg }}>WO</th>
                  <th className={`${TH} font-normal text-[#94a3b8] min-w-[64px]`} style={{ background: JENIS_STYLE[i].subBg }}>Selesai</th>
                </React.Fragment>
              ))}
              <th className={`${TH} font-normal text-[#94a3b8] min-w-[52px]`} style={{ background: "#0a1628" }}>WO</th>
              <th className={`${TH} font-normal text-[#94a3b8] min-w-[64px]`} style={{ background: "#0a1628" }}>% Selesai</th>
            </tr>
          </thead>

          <tbody>
            {stats.map((s, idx) => {
              const isActive = s.month === currentMonth;
              const rowBg    = isActive ? "#0d2d2a" : idx % 2 === 0 ? "#0a1628" : "#0d1b2a";
              const stickyBg = isActive ? "#0d2d2a" : idx % 2 === 0 ? "#0a1628" : "#0d1b2a";

              return (
                <tr key={s.month} style={{ background: rowBg }}
                  className="hover:brightness-110 transition-all">

                  {/* Bulan — sticky */}
                  <td
                    className={`${TD} sticky left-0 z-10 font-semibold text-left pl-4 border-r-2`}
                    style={{ background: stickyBg, color: isActive ? "#5eead4" : "#e2e8f0" }}
                  >
                    <span className="flex items-center gap-1.5">
                      {MONTHS[s.month - 1]}
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse shrink-0" />
                      )}
                    </span>
                  </td>

                  {/* Ukur */}
                  <td className={TD}>
                    {s.jumlahUkur > 0
                      ? <span className="text-[#94a3b8]">{s.jumlahUkur}</span>
                      : <span className="text-[#475569]">—</span>}
                  </td>

                  {/* Anomali */}
                  <td className={TD}>
                    <Num v={s.jumlahAnomal} color="text-red-400" />
                  </td>

                  {/* Rata % beban */}
                  <td className={TD}>
                    {s.jumlahUkur > 0 ? (
                      <span className={
                        s.rataBeban >= 80 ? "text-red-400 font-semibold" :
                        s.rataBeban >= 60 ? "text-amber-400 font-semibold" :
                        "text-green-400"
                      }>
                        {s.rataBeban}%
                      </span>
                    ) : <span className="text-[#475569]">—</span>}
                  </td>

                  {/* Per jenis: WO & Selesai */}
                  {JENIS_PEMELIHARAAN_OPTIONS.map((j, i) => {
                    const jd = s.byJenis[j] ?? { wo: 0, selesai: 0 };
                    return (
                      <React.Fragment key={j}>
                        <td className={TD} style={{ background: `${JENIS_STYLE[i].subBg}66` }}>
                          <Num v={jd.wo} color={JENIS_STYLE[i].headText} />
                        </td>
                        <td className={TD} style={{ background: `${JENIS_STYLE[i].subBg}66` }}>
                          <Num v={jd.selesai} color="text-green-400" />
                        </td>
                      </React.Fragment>
                    );
                  })}

                  {/* Total WO */}
                  <td className={TD}>
                    <Num v={s.totalWo} color="text-[#e2e8f0]" />
                  </td>

                  {/* % Selesai badge */}
                  <td className={TD}>
                    <PctBadge pct={s.pctSelesai} wo={s.totalWo} />
                  </td>
                </tr>
              );
            })}
          </tbody>

          {/* ── Footer TOTAL ── */}
          <tfoot>
            <tr style={{ background: "#0a2a26" }} className="border-t-2 border-teal-800">
              <td
                className={`${TD} sticky left-0 z-10 font-bold text-left pl-4 text-teal-300 border-r-2`}
                style={{ background: "#0a2a26" }}
              >
                TOTAL
              </td>
              <td className={`${TD} text-[#94a3b8] font-semibold`}>{totals.ukur}</td>
              <td className={TD}><span className="text-red-400 font-bold">{totals.anomali}</span></td>
              <td className={TD}>
                <span className={
                  totalRata >= 80 ? "text-red-400 font-bold" :
                  totalRata >= 60 ? "text-amber-400 font-bold" :
                  "text-green-400 font-bold"
                }>
                  {totalRata > 0 ? `${totalRata}%` : "—"}
                </span>
              </td>
              {JENIS_PEMELIHARAAN_OPTIONS.map((j, i) => {
                const jd = totals.byJenis[j];
                return (
                  <React.Fragment key={j}>
                    <td className={`${TD} font-bold`} style={{ color: JENIS_STYLE[i].headText, background: `${JENIS_STYLE[i].subBg}aa` }}>
                      {jd.wo > 0 ? jd.wo : <span className="text-[#475569]">—</span>}
                    </td>
                    <td className={`${TD} font-bold text-green-400`} style={{ background: `${JENIS_STYLE[i].subBg}aa` }}>
                      {jd.selesai > 0 ? jd.selesai : <span className="text-[#475569]">—</span>}
                    </td>
                  </React.Fragment>
                );
              })}
              <td className={`${TD} font-bold text-[#e2e8f0]`}>{totals.totalWo > 0 ? totals.totalWo : "—"}</td>
              <td className={TD}><PctBadge pct={totalPct} wo={totals.totalWo} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
