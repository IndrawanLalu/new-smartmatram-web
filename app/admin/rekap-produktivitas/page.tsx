"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canSeeAllUnits } from "@/lib/roles";
import {
  useRekapProduktivitas,
  EKSEKUTOR_OPTIONS,
  ULP_OPTIONS,
} from "./_hooks/useRekapProduktivitas";

const BULAN_LABELS = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

const SELECT_CLASS =
  "border border-line rounded-lg px-3 py-1.5 text-sm text-ink bg-white focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

function cellBg(count: number) {
  if (count === 0) return "";
  if (count === 1)  return "bg-brand-100 text-brand-800";
  if (count === 2)  return "bg-brand-300 text-brand-800 font-medium";
  return                   "bg-brand-600 text-white font-semibold";
}

export default function RekapProduktivitasPage() {
  const user = useCurrentUser();
  const { filter, setFilter, rows, loading, daysInMonth } = useRekapProduktivitas(user);
  const [pdfLoading, setPdfLoading] = useState(false);

  const now   = new Date();
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);
  const days  = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  async function handleDownloadPdf() {
    if (rows.length === 0) return;
    setPdfLoading(true);
    try {
      const [{ pdf }, { default: RekapPdfDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./_RekapPdf"),
      ]);
      const periodeLabel = `${BULAN_LABELS[filter.bulan - 1]} ${filter.tahun}`;
      const element = (
        <RekapPdfDoc
          rows={rows}
          daysInMonth={daysInMonth}
          periodeLabel={periodeLabel}
          eksekutor={filter.eksekutor}
          ulpLabel={filter.ulp || "Semua ULP"}
        />
      );
      const blob = await pdf(element).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `rekap-produktivitas-${filter.eksekutor}${filter.ulp ? `-${filter.ulp}` : ""}-${filter.tahun}-${String(filter.bulan).padStart(2, "0")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-5 text-ink">

      {/* Filter */}
      <div className="bg-white border border-line rounded-xl p-4 flex flex-wrap gap-3 items-center">
        {canSeeAllUnits(user.role) && (
          <select
            value={filter.ulp}
            onChange={(e) => setFilter((f) => ({ ...f, ulp: e.target.value }))}
            className={SELECT_CLASS}
          >
            <option value="">Semua ULP</option>
            {ULP_OPTIONS.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        )}

        <select
          value={filter.eksekutor}
          onChange={(e) => setFilter((f) => ({ ...f, eksekutor: e.target.value }))}
          className={SELECT_CLASS}
        >
          {EKSEKUTOR_OPTIONS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>

        <select
          value={filter.bulan}
          onChange={(e) => setFilter((f) => ({ ...f, bulan: Number(e.target.value) }))}
          className={SELECT_CLASS}
        >
          {BULAN_LABELS.map((b, i) => (
            <option key={i} value={i + 1}>{b}</option>
          ))}
        </select>

        <select
          value={filter.tahun}
          onChange={(e) => setFilter((f) => ({ ...f, tahun: Number(e.target.value) }))}
          className={SELECT_CLASS}
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <span className="text-ink-soft text-sm ml-auto">
          {loading ? "Memuat..." : `${rows.length} petugas`}
        </span>

        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading || loading || rows.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white transition-colors"
        >
          {pdfLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          {pdfLoading ? "Membuat PDF..." : "Download PDF"}
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-line border-t-brand-600 rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-ink-soft">
            Tidak ada data untuk filter yang dipilih
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surface text-ink-soft text-xs">
                  <th className="sticky left-0 z-10 bg-surface px-4 py-3 text-left font-semibold text-brand-700 min-w-[180px] border-r border-line">
                    Nama Petugas
                  </th>
                  {days.map((d) => (
                    <th key={d} className="px-2 py-3 text-center font-semibold w-9 min-w-[36px]">
                      {d}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold text-brand-700 min-w-[60px] border-l border-line">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr
                    key={row.team_name}
                    className={`border-t border-line ${ri % 2 === 0 ? "bg-white" : "bg-surface"}`}
                  >
                    <td className={`sticky left-0 z-10 px-4 py-2 font-medium text-ink border-r border-line ${ri % 2 === 0 ? "bg-white" : "bg-surface"}`}>
                      {row.team_name}
                    </td>
                    {days.map((d) => {
                      const count = row.days[d] ?? 0;
                      return (
                        <td
                          key={d}
                          className={`px-1 py-2 text-center text-xs ${count > 0 ? cellBg(count) : "text-ink-muted/50"}`}
                        >
                          {count > 0 ? count : "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-bold text-brand-700 border-l border-line">
                      {row.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
