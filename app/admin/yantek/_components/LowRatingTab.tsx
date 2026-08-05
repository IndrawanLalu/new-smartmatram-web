"use client";

import { useState, useMemo } from "react";
import { TriangleAlert, Search, X } from "lucide-react";
import { extractNama, calcDurasiNyalaSmt, type YantekRow } from "../_lib/yantek";

// Dipisah dari page.tsx (2026-08-05) — isinya sama, warnanya dipindah ke token navy.

// Kolom tetap (urutan sesuai permintaan user)
const LOW_COLS = [
  "no_laporan",
  "pembuat_laporan",
  "personil_yantek",
  "nama_regu",
  "waktu_lapor",
  "waktu_perjalanan",
  "waktu_nyala_sementara",
  "waktu_selesai",
  "durasi_menit_response",
  "durasi_menit_recovery",
  "durasi_nyala_sementara", // kalkulasi
  "tindakan",
] as const;

type LowCol = typeof LOW_COLS[number];

const LOW_COL_LABEL: Record<LowCol, string> = {
  no_laporan:             "No Laporan",
  pembuat_laporan:        "Pembuat",
  personil_yantek:        "Personil Yantek",
  nama_regu:              "Nama Regu",
  waktu_lapor:            "Waktu Lapor",
  waktu_perjalanan:       "Waktu Perjalanan",
  waktu_nyala_sementara:  "Waktu Nyala Smt",
  waktu_selesai:          "Waktu Selesai",
  durasi_menit_response:  "Response (mnt)",
  durasi_menit_recovery:  "Recovery (mnt)",
  durasi_nyala_sementara: "Durasi Nyala Smt (mnt)",
  tindakan:               "Tindakan",
};
interface PerPetugasLow { nama: string; r1: number; r2: number; total: number }

export default function LowRatingTab({ rows }: { rows: YantekRow[] }) {
  const [search, setSearch] = useState("");

  const r1Count = useMemo(() => rows.filter(r => Number(r.rating) === 1).length, [rows]);
  const r2Count = useMemo(() => rows.filter(r => Number(r.rating) === 2).length, [rows]);

  const perPetugas = useMemo<PerPetugasLow[]>(() => {
    const map = new Map<string, PerPetugasLow>();
    for (const row of rows) {
      const nama = extractNama(row.personil_yantek ?? "—");
      if (!map.has(nama)) map.set(nama, { nama, r1: 0, r2: 0, total: 0 });
      const s = map.get(nama)!;
      if (Number(row.rating) === 1) s.r1++;
      else s.r2++;
      s.total++;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      LOW_COLS.some(c => {
        if (c === "durasi_nyala_sementara") return false;
        if (c === "personil_yantek") return extractNama(r.personil_yantek ?? "").toLowerCase().includes(q);
        return String(r[c] ?? "").toLowerCase().includes(q);
      }),
    );
  }, [rows, search]);

  const sortedRows = useMemo(
    () => [...filteredRows].sort((a, b) => Number(a.rating) - Number(b.rating)),
    [filteredRows],
  );

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-line py-14 flex flex-col items-center gap-3 text-ink-muted">
        <TriangleAlert className="w-10 h-10 opacity-20" />
        <p className="text-sm font-medium">Tidak ada WO dengan rating ★1 atau ★2</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl shadow-sm border border-red-100 p-4">
          <p className="text-xs text-ink-muted mb-1">Rating ★1</p>
          <p className="text-2xl font-bold text-red-600">{r1Count}</p>
          <p className="text-[11px] text-ink-muted mt-0.5">WO</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-4">
          <p className="text-xs text-ink-muted mb-1">Rating ★2</p>
          <p className="text-2xl font-bold text-orange-500">{r2Count}</p>
          <p className="text-[11px] text-ink-muted mt-0.5">WO</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-line p-4">
          <p className="text-xs text-ink-muted mb-1">Petugas Terdampak</p>
          <p className="text-2xl font-bold text-ink">{perPetugas.length}</p>
          <p className="text-[11px] text-ink-muted mt-0.5">petugas</p>
        </div>
      </div>

      {/* Per-petugas summary */}
      <div className="bg-white rounded-xl shadow-sm border border-line overflow-hidden">
        <div className="px-4 py-3 border-b border-line">
          <p className="text-xs font-semibold text-ink">Rekap per Petugas</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="py-2 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line w-8">#</th>
                <th className="py-2 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line">Nama Petugas</th>
                <th className="py-2 px-3 text-center bg-red-50 text-red-600 font-semibold border-b border-line">★1</th>
                <th className="py-2 px-3 text-center bg-orange-50 text-orange-500 font-semibold border-b border-line">★2</th>
                <th className="py-2 px-3 text-center bg-navy-50 text-navy-600 font-semibold border-b border-line">Total</th>
              </tr>
            </thead>
            <tbody>
              {perPetugas.map((p, i) => (
                <tr key={p.nama} className="border-t border-line hover:bg-red-50/40 transition-colors">
                  <td className="py-2 px-3 text-ink-muted text-right tabular-nums">{i + 1}</td>
                  <td className="py-2 px-3 font-semibold text-red-700">{p.nama}</td>
                  <td className="py-2 px-3 text-center">
                    {p.r1 > 0
                      ? <span className="inline-block px-2 py-0.5 rounded bg-red-50 text-red-600 font-bold">{p.r1}</span>
                      : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {p.r2 > 0
                      ? <span className="inline-block px-2 py-0.5 rounded bg-orange-50 text-orange-500 font-bold">{p.r2}</span>
                      : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="py-2 px-3 text-center font-bold text-ink">{p.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail all rows */}
      <div className="bg-white rounded-xl shadow-sm border border-line overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <p className="text-xs font-semibold text-ink">Detail Semua WO Rating Rendah</p>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari..."
              className="pl-8 pr-3 py-1.5 text-xs border border-line rounded-lg focus:outline-none focus:border-navy-500 w-48 text-ink placeholder-ink-muted" />
          </div>
          {search && <button onClick={() => setSearch("")} className="p-1 rounded text-ink-muted hover:text-ink"><X className="w-3 h-3" /></button>}
          <span className="text-xs text-ink-muted">{sortedRows.length} WO</span>
        </div>
        <div className="overflow-auto max-h-[55vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="py-2 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line w-8">#</th>
                <th className="py-2 px-3 text-center bg-red-50 text-red-600 font-semibold border-b border-line">Rating</th>
                {LOW_COLS.map(c => (
                  <th key={c} className="py-2 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line whitespace-nowrap">
                    {LOW_COL_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => {
                const rv = Number(row.rating);
                const isR1 = rv === 1;
                const durasiNyala = calcDurasiNyalaSmt(row);
                return (
                  <tr key={i} className={`border-t transition-colors ${isR1 ? "bg-red-50/60 hover:bg-red-100/60 border-red-100" : "bg-orange-50/40 hover:bg-orange-100/40 border-orange-100"}`}>
                    <td className="py-2 px-3 text-ink-muted text-right tabular-nums">{i + 1}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${isR1 ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-500"}`}>★{rv}</span>
                    </td>
                    {LOW_COLS.map(c => {
                      if (c === "durasi_nyala_sementara") {
                        return (
                          <td key={c} className="py-2 px-3 text-center tabular-nums">
                            {durasiNyala
                              ? <span className="font-mono text-ink">{durasiNyala}</span>
                              : <span className="text-ink-muted italic text-[11px]">—</span>}
                          </td>
                        );
                      }
                      if (c === "personil_yantek") {
                        return (
                          <td key={c} className="py-2 px-3 whitespace-nowrap">
                            <span className={`font-semibold ${isR1 ? "text-red-700" : "text-orange-600"}`}>
                              {row.personil_yantek ? extractNama(row.personil_yantek) : "—"}
                            </span>
                          </td>
                        );
                      }
                      const val = row[c as keyof YantekRow];
                      return (
                        <td key={c} className="py-2 px-3 whitespace-nowrap">
                          {val === null || val === undefined
                            ? <span className="text-ink-muted italic text-[11px]">—</span>
                            : <span className="text-ink">{String(val)}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
