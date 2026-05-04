"use client";

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
  "border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] bg-[#162334] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20";

function cellBg(count: number) {
  if (count === 0) return "";
  if (count === 1)  return "bg-teal-900/60 text-teal-300";
  if (count === 2)  return "bg-teal-800/70 text-teal-200";
  return                   "bg-teal-700/80 text-white font-semibold";
}

export default function RekapProduktivitasPage() {
  const user = useCurrentUser();
  const { filter, setFilter, rows, loading, daysInMonth } = useRekapProduktivitas(user);

  const now   = new Date();
  const years = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);
  const days  = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="p-6 space-y-5 min-h-screen bg-[#0a1628]">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <h1 className="text-2xl font-bold">Rekap Produktivitas Petugas</h1>
        <p className="text-white/80 text-sm mt-1">
          Jumlah pekerjaan yang diselesaikan per petugas per hari
        </p>
      </div>

      {/* Filter */}
      <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-xl p-4 flex flex-wrap gap-3 items-center">
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

        <span className="text-[#94a3b8] text-sm ml-auto">
          {loading ? "Memuat..." : `${rows.length} petugas`}
        </span>
      </div>

      {/* Table */}
      <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-[#94a3b8]">
            Tidak ada data untuk filter yang dipilih
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[#162334] text-[#94a3b8] text-xs">
                  <th className="sticky left-0 z-10 bg-[#162334] px-4 py-3 text-left font-semibold text-[#5eead4] min-w-[180px] border-r border-[#1e3552]">
                    Nama Petugas
                  </th>
                  {days.map((d) => (
                    <th key={d} className="px-2 py-3 text-center font-semibold w-9 min-w-[36px]">
                      {d}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold text-[#5eead4] min-w-[60px] border-l border-[#1e3552]">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr
                    key={row.team_name}
                    className={`border-t border-[#1e3552] ${ri % 2 === 0 ? "bg-[#0d1b2a]" : "bg-[#0a1628]"}`}
                  >
                    <td className={`sticky left-0 z-10 px-4 py-2 font-medium text-[#e2e8f0] border-r border-[#1e3552] ${ri % 2 === 0 ? "bg-[#0d1b2a]" : "bg-[#0a1628]"}`}>
                      {row.team_name}
                    </td>
                    {days.map((d) => {
                      const count = row.days[d] ?? 0;
                      return (
                        <td
                          key={d}
                          className={`px-1 py-2 text-center text-xs ${count > 0 ? cellBg(count) : "text-[#334155]"}`}
                        >
                          {count > 0 ? count : "—"}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-center font-bold text-[#5eead4] border-l border-[#1e3552]">
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
