"use client";

import React from "react";
import { CHART_SERIES } from "@/lib/chartColors";
import { JENIS_PEMELIHARAAN_OPTIONS } from "../_utils/constants";
import type { MonthStat } from "../_hooks/useYearlyStats";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

// Warna kelompok jenis pemeliharaan = pemakaian KATEGORIKAL, jadi diambil dari
// CHART_SERIES (sudah lolos validator palet di permukaan terang). Latar sel pakai
// tint tipis dari warna yang sama supaya kolom tetap terkelompok tanpa berteriak.
const JENIS_STYLE = [
  { color: CHART_SERIES[1], headBg: "#0D948814", subBg: "#0D94880A" }, // teal   — PEMERATAAN BEBAN
  { color: CHART_SERIES[0], headBg: "#2563EB14", subBg: "#2563EB0A" }, // biru   — OPTIMASI TRAFO
  { color: CHART_SERIES[4], headBg: "#7C3AED14", subBg: "#7C3AED0A" }, // violet — PEMELIHARAAN GARDU
  { color: CHART_SERIES[2], headBg: "#EA580C14", subBg: "#EA580C0A" }, // oranye — MANUVER BEBAN
] as const;

// ── Sub-components ────────────────────────────────────────────────────────────

function PctBadge({ pct, wo }: { pct: number; wo: number }) {
  if (wo === 0) return <span className="text-ink-muted text-xs">—</span>;
  const cls =
    pct >= 80 ? "bg-emerald-50 text-emerald-700" :
    pct >= 50 ? "bg-amber-50 text-amber-700" :
                "bg-red-50 text-red-700";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{pct}%</span>;
}

function Num({ v, color }: { v: number; color?: string }) {
  if (v === 0) return <span className="text-ink-muted">—</span>;
  return <span className={`font-semibold ${color ?? "text-ink"}`}>{v}</span>;
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
      acc.amg      += s.amgTerkirim;
      acc.ratakan  += s.jumlahPemerataan;
      acc.amgRatakan += s.amgPemerataan;
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
      ukur: 0, amg: 0, ratakan: 0, amgRatakan: 0, anomali: 0, bebanWsum: 0, bebanCount: 0,
      byJenis: Object.fromEntries(JENIS_PEMELIHARAAN_OPTIONS.map(j => [j, { wo: 0, selesai: 0 }])),
      totalWo: 0, totalSelesai: 0,
    }
  );
  const totalRata = totals.bebanCount > 0 ? Math.round(totals.bebanWsum / totals.bebanCount) : 0;
  const totalPct  = totals.totalWo > 0 ? Math.round((totals.totalSelesai / totals.totalWo) * 100) : 0;

  // Shared cell classes
  const TH = "px-3 py-2 text-center text-[11px] font-semibold border-b border-r border-line whitespace-nowrap";
  const TD = "px-3 py-2.5 text-center text-xs border-b border-r border-line";

  return (
    <div className="bg-white rounded-xl border border-line overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-3.5 border-b border-line flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Rekap Tahunan</h3>
          <p className="text-xs text-ink-soft mt-0.5">Pengukuran & Tindak Lanjut Anomali per Bulan</p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <div className="w-3.5 h-3.5 border-2 border-line border-t-navy-600 rounded-full animate-spin" />
            Memuat...
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-ink" style={{ minWidth: 1120 }}>
          <thead>
            {/* ── Row 1: Group headers ── */}
            <tr>
              {/* Bulan — rowSpan 2 */}
              <th
                rowSpan={2}
                className={`${TH} sticky left-0 z-10 text-navy-600 min-w-[110px] border-r-2`}
                style={{ background: "#EEF2FB" }}
              >
                BULAN
              </th>
              {/* Fixed info cols — rowSpan 2 */}
              <th rowSpan={2} className={`${TH} text-ink-soft min-w-[56px]`} style={{ background: "#EEF2FB" }} title="Pengukuran rutin — tidak termasuk hasil pemerataan">Ukur</th>
              <th rowSpan={2} className={`${TH} text-navy-600 min-w-[64px]`} style={{ background: "#EEF2FB" }} title="Pengukuran rutin yang sudah terkirim ke AMG">AMG</th>
              <th rowSpan={2} className={`${TH} text-accent-deep min-w-[64px]`} style={{ background: "#E0F2F1" }} title="Pengukuran hasil pemerataan beban (dicatat lewat aplikasi mobile). Angka kecil = sudah terkirim ke AMG.">Ratakan</th>
              <th rowSpan={2} className={`${TH} text-ink-soft min-w-[68px]`} style={{ background: "#EEF2FB" }}>Anomali</th>
              <th rowSpan={2} className={`${TH} text-ink-soft min-w-[68px]`} style={{ background: "#EEF2FB" }}>Rata %</th>

              {/* Jenis group headers — colSpan 2 each */}
              {JENIS_PEMELIHARAAN_OPTIONS.map((j, i) => (
                <th
                  key={j}
                  colSpan={2}
                  className={`${TH}`}
                  style={{ background: JENIS_STYLE[i].headBg, color: JENIS_STYLE[i].color }}
                >
                  {j}
                </th>
              ))}

              {/* Total — colSpan 2 */}
              <th colSpan={2} className={`${TH} text-ink-soft min-w-[110px]`} style={{ background: "#EEF2FB" }}>
                TOTAL
              </th>
            </tr>

            {/* ── Row 2: WO / Selesai sub-headers ── */}
            <tr>
              {JENIS_PEMELIHARAAN_OPTIONS.map((j, i) => (
                <React.Fragment key={j}>
                  <th className={`${TH} font-normal text-ink-soft min-w-[52px]`} style={{ background: JENIS_STYLE[i].subBg }}>WO</th>
                  <th className={`${TH} font-normal text-ink-soft min-w-[64px]`} style={{ background: JENIS_STYLE[i].subBg }}>Selesai</th>
                </React.Fragment>
              ))}
              <th className={`${TH} font-normal text-ink-soft min-w-[52px]`} style={{ background: "#EEF2FB" }}>WO</th>
              <th className={`${TH} font-normal text-ink-soft min-w-[64px]`} style={{ background: "#EEF2FB" }}>% Selesai</th>
            </tr>
          </thead>

          <tbody>
            {stats.map((s, idx) => {
              const isActive = s.month === currentMonth;
              const rowBg    = isActive ? "#EEF2FB" : idx % 2 === 0 ? "#FFFFFF" : "#F8FAFB";
              const stickyBg = isActive ? "#EEF2FB" : idx % 2 === 0 ? "#FFFFFF" : "#F8FAFB";

              return (
                <tr key={s.month} style={{ background: rowBg }}
                  className="hover:brightness-110 transition-all">

                  {/* Bulan — sticky */}
                  <td
                    className={`${TD} sticky left-0 z-10 font-semibold text-left pl-4 border-r-2`}
                    style={{ background: stickyBg, color: isActive ? "#1D3573" : "#0F1A2E" }}
                  >
                    <span className="flex items-center gap-1.5">
                      {MONTHS[s.month - 1]}
                      {isActive && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse shrink-0" />
                      )}
                    </span>
                  </td>

                  {/* Ukur */}
                  <td className={TD}>
                    {s.jumlahUkur > 0
                      ? <span className="text-ink-soft">{s.jumlahUkur}</span>
                      : <span className="text-ink-muted">—</span>}
                  </td>

                  {/* Terkirim AMG */}
                  <td className={TD}>
                    <Num v={s.amgTerkirim} color="text-navy-600" />
                  </td>

                  {/* Pemerataan — realisasi dipisah dari pengukuran rutin */}
                  <td className={TD} style={{ background: "#F4FBFA" }}>
                    {s.jumlahPemerataan > 0 ? (
                      <span className="text-accent-deep font-semibold">
                        {s.jumlahPemerataan}
                        {s.amgPemerataan > 0 && (
                          <span className="ml-1 text-[10px] font-normal text-ink-muted">
                            ({s.amgPemerataan} AMG)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>

                  {/* Anomali */}
                  <td className={TD}>
                    <Num v={s.jumlahAnomal} color="text-red-600" />
                  </td>

                  {/* Rata % beban */}
                  <td className={TD}>
                    {s.jumlahUkur > 0 ? (
                      <span className={
                        s.rataBeban >= 80 ? "text-red-600 font-semibold" :
                        s.rataBeban >= 60 ? "text-amber-600 font-semibold" :
                        "text-emerald-600"
                      }>
                        {s.rataBeban}%
                      </span>
                    ) : <span className="text-ink-muted">—</span>}
                  </td>

                  {/* Per jenis: WO & Selesai */}
                  {JENIS_PEMELIHARAAN_OPTIONS.map((j, i) => {
                    const jd = s.byJenis[j] ?? { wo: 0, selesai: 0 };
                    return (
                      <React.Fragment key={j}>
                        <td className={TD} style={{ background: `${JENIS_STYLE[i].subBg}66` }}>
                          <Num v={jd.wo} color={JENIS_STYLE[i].color} />
                        </td>
                        <td className={TD} style={{ background: `${JENIS_STYLE[i].subBg}66` }}>
                          <Num v={jd.selesai} color="text-emerald-600" />
                        </td>
                      </React.Fragment>
                    );
                  })}

                  {/* Total WO */}
                  <td className={TD}>
                    <Num v={s.totalWo} color="text-ink" />
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
            <tr className="bg-navy-50 border-t-2 border-navy-200">
              <td
                className={`${TD} sticky left-0 z-10 font-bold text-left pl-4 text-navy-600 border-r-2`}
                style={{ background: "#EEF2FB" }}
              >
                TOTAL
              </td>
              <td className={`${TD} text-ink-soft font-semibold`}>{totals.ukur}</td>
              <td className={TD}>
                {totals.amg > 0
                  ? <span className="text-navy-600 font-bold">{totals.amg}</span>
                  : <span className="text-ink-muted">—</span>}
              </td>
              <td className={TD} style={{ background: "#F4FBFA" }}>
                {totals.ratakan > 0 ? (
                  <span className="text-accent-deep font-bold">
                    {totals.ratakan}
                    {totals.amgRatakan > 0 && (
                      <span className="ml-1 text-[10px] font-normal text-ink-muted">
                        ({totals.amgRatakan} AMG)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-ink-muted">—</span>
                )}
              </td>
              <td className={TD}><span className="text-red-600 font-bold">{totals.anomali}</span></td>
              <td className={TD}>
                <span className={
                  totalRata >= 80 ? "text-red-600 font-bold" :
                  totalRata >= 60 ? "text-amber-600 font-bold" :
                  "text-emerald-600 font-bold"
                }>
                  {totalRata > 0 ? `${totalRata}%` : "—"}
                </span>
              </td>
              {JENIS_PEMELIHARAAN_OPTIONS.map((j, i) => {
                const jd = totals.byJenis[j];
                return (
                  <React.Fragment key={j}>
                    <td className={`${TD} font-bold`} style={{ color: JENIS_STYLE[i].color, background: `${JENIS_STYLE[i].subBg}aa` }}>
                      {jd.wo > 0 ? jd.wo : <span className="text-ink-muted">—</span>}
                    </td>
                    <td className={`${TD} font-bold text-emerald-600`} style={{ background: `${JENIS_STYLE[i].subBg}aa` }}>
                      {jd.selesai > 0 ? jd.selesai : <span className="text-ink-muted">—</span>}
                    </td>
                  </React.Fragment>
                );
              })}
              <td className={`${TD} font-bold text-ink`}>{totals.totalWo > 0 ? totals.totalWo : "—"}</td>
              <td className={TD}><PctBadge pct={totalPct} wo={totals.totalWo} /></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
