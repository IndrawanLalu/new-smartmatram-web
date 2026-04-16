"use client";

import { useState, useMemo } from "react";
import { Search, Trash2, Pencil, ChevronLeft, ChevronRight, Scale } from "lucide-react";
import {
  usePenyeimbangan,
  type PenyeimbanganGardu,
  type SavePenyeimbanganInput,
  type UpdatePenyeimbanganInput,
} from "../_hooks/usePenyeimbangan";
import type { PengukuranGardu } from "../_hooks/usePengukuranGardu";
import PenyeimbanganModal from "./PenyeimbanganModal";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const PAGE_SIZE = 20;

const INPUT_CLASS =
  "border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]";

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctCls(pct: number) {
  if (pct >= 80) return "text-red-400 font-bold";
  if (pct >= 60) return "text-amber-400 font-semibold";
  return "text-green-400 font-semibold";
}

function fmtTanggal(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function ArusCell({ r, s, t, n }: { r: number; s: number; t: number; n: number }) {
  return (
    <span className="text-xs font-mono text-[#94a3b8]">
      {Math.round(r)}/{Math.round(s)}/{Math.round(t)}/{Math.round(n)}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  latestData: PengukuranGardu[];
  ulp: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PenyeimbanganTab({ latestData, ulp }: Props) {
  const now = new Date();

  // Rekap hook
  const {
    data: rekapData,
    loading: rekapLoading,
    error: rekapError,
    month,
    setMonth,
    year,
    setYear,
    savePenyeimbangan,
    updatePenyeimbangan,
    deleteItem,
  } = usePenyeimbangan(ulp);

  // Pencarian gardu
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGardu, setSelectedGardu] = useState<PengukuranGardu | null>(null);
  const [editRecord, setEditRecord] = useState<PenyeimbanganGardu | null>(null);

  // Rekap pagination
  const [page, setPage] = useState(1);

  const years = useMemo(
    () => Array.from({ length: 4 }, (_, i) => now.getFullYear() - 1 + i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Filter latestData by search query
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();
    return latestData.filter(
      (d) =>
        d.no_gardu?.toLowerCase().includes(q) ||
        d.penyulang?.toLowerCase().includes(q) ||
        d.alamat?.toLowerCase().includes(q)
    ).slice(0, 10);
  }, [latestData, searchQuery]);

  const paginatedRekap = useMemo(
    () => rekapData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rekapData, page]
  );
  const totalPages = Math.ceil(rekapData.length / PAGE_SIZE);

  async function handleSave(input: SavePenyeimbanganInput) {
    const err = await savePenyeimbangan(input);
    if (!err) {
      setSelectedGardu(null);
      setSearchQuery("");
    }
    return err;
  }

  async function handleUpdate(input: UpdatePenyeimbanganInput) {
    const err = await updatePenyeimbangan(input);
    if (!err) setEditRecord(null);
    return err;
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus rekap penyeimbangan ini?")) return;
    await deleteItem(id);
  }

  return (
    <div className="space-y-6">

      {/* ── Pencarian Gardu ─────────────────────────────────────────────────── */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-5">
        <h3 className="text-sm font-semibold text-[#e2e8f0] mb-3 flex items-center gap-2">
          <Scale size={16} className="text-[#00897B]" />
          Catat Penyeimbangan Baru
        </h3>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari gardu berdasarkan no. gardu, penyulang, atau alamat..."
            className="w-full pl-9 pr-4 py-2.5 border border-[#1e3552] rounded-lg text-sm text-[#e2e8f0] bg-[#0d1b2a] placeholder:text-[#4a5568] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
          />
        </div>

        {/* Search Results */}
        {searchQuery.trim() && searchResults.length === 0 && (
          <p className="mt-3 text-sm text-[#94a3b8] text-center py-4">
            Gardu tidak ditemukan
          </p>
        )}

        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((row) => (
              <button
                key={row.id}
                onClick={() => setSelectedGardu(row)}
                className="w-full text-left bg-[#0d1b2a] border border-[#1e3552] hover:border-[#00897B]/50 rounded-lg px-4 py-3 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-[#e2e8f0] group-hover:text-[#5eead4] transition-colors">
                      {row.no_gardu}
                    </span>
                    <span className="ml-2 text-xs text-[#94a3b8]">{row.penyulang}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[#94a3b8]">{row.kva_trafo} kVA</span>
                    <span className={`text-sm font-bold ${pctCls(row.persen_beban)}`}>
                      {Math.round(row.persen_beban)}%
                    </span>
                  </div>
                </div>
                {row.alamat && (
                  <p className="mt-0.5 text-xs text-[#94a3b8] truncate">{row.alamat}</p>
                )}
                <p className="mt-0.5 text-xs text-[#4a5568]">
                  Pengukuran terakhir: {fmtTanggal(row.tanggal_pengukuran)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Rekap Penyeimbangan ─────────────────────────────────────────────── */}
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden">
        {/* Rekap Header + Filter */}
        <div className="px-5 py-4 border-b border-[#1e3552] flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-[#e2e8f0] mr-auto">
            Rekap Penyeimbangan Beban
          </h3>

          <select
            value={month}
            onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }}
            className={INPUT_CLASS}
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>

          <select
            value={year}
            onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }}
            className={INPUT_CLASS}
          >
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {/* Error */}
        {rekapError && (
          <div className="m-4 bg-red-900/30 border border-red-500/40 rounded-lg p-3 text-red-300 text-sm">
            {rekapError}
          </div>
        )}

        {/* Loading */}
        {rekapLoading && (
          <div className="flex items-center justify-center py-12 gap-2 text-[#94a3b8] text-sm">
            <div className="w-5 h-5 border-4 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
            Memuat data...
          </div>
        )}

        {/* Empty state */}
        {!rekapLoading && rekapData.length === 0 && (
          <div className="text-center py-12 text-[#94a3b8] text-sm">
            Belum ada rekap penyeimbangan pada {MONTHS[month - 1]} {year}
          </div>
        )}

        {/* Table */}
        {!rekapLoading && rekapData.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-[#0a1628]">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">No</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Tgl Seimbang</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Gardu</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Alamat</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Penyulang</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-[#5eead4]">KVA</th>
                    {/* Sebelum */}
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-red-400" colSpan={2}>
                      Sebelum
                    </th>
                    {/* Sesudah */}
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-green-400" colSpan={2}>
                      Sesudah
                    </th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Petugas</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Catatan</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                  <tr className="bg-[#0a1628] border-t border-[#1e3552]/50">
                    {/* spacer cols */}
                    {["", "", "", "", "", ""].map((_, i) => (
                      <th key={i} className="px-3 py-1" />
                    ))}
                    {/* Sebelum sub-headers */}
                    <th className="px-3 py-1 text-center text-[10px] text-[#94a3b8]">R/S/T/N (A)</th>
                    <th className="px-3 py-1 text-center text-[10px] text-[#94a3b8]">Beban %</th>
                    {/* Sesudah sub-headers */}
                    <th className="px-3 py-1 text-center text-[10px] text-[#94a3b8]">R/S/T/N (A)</th>
                    <th className="px-3 py-1 text-center text-[10px] text-[#94a3b8]">Beban %</th>
                    {/* spacer */}
                    <th className="px-3 py-1" />
                    <th className="px-3 py-1" />
                    <th className="px-3 py-1" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1e3552]">
                  {paginatedRekap.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={idx % 2 === 0 ? "bg-[#162334]" : "bg-[#0d1b2a]"}
                    >
                      <td className="px-3 py-2.5 text-xs text-[#94a3b8]">
                        {(page - 1) * PAGE_SIZE + idx + 1}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#e2e8f0]">
                        {fmtTanggal(row.tgl_penyeimbangan)}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-[#e2e8f0]">
                        {row.no_gardu}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94a3b8] max-w-[180px] truncate">
                        {row.alamat ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94a3b8]">
                        {row.penyulang ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center text-xs text-[#94a3b8]">
                        {row.kva_trafo}
                      </td>
                      {/* Sebelum */}
                      <td className="px-3 py-2.5 text-center">
                        <ArusCell
                          r={row.arus_r_before} s={row.arus_s_before}
                          t={row.arus_t_before} n={row.arus_n_before}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-bold ${pctCls(row.beban_pct_before)}`}>
                          {Math.round(row.beban_pct_before)}%
                        </span>
                      </td>
                      {/* Sesudah */}
                      <td className="px-3 py-2.5 text-center">
                        <ArusCell
                          r={row.arus_r_after} s={row.arus_s_after}
                          t={row.arus_t_after} n={row.arus_n_after}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-bold ${pctCls(row.beban_pct_after)}`}>
                          {Math.round(row.beban_pct_after)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94a3b8]">
                        {row.petugas_penyeimbang ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#94a3b8] max-w-[200px]">
                        {row.catatan ? (
                          <span className="truncate block" title={row.catatan}>{row.catatan}</span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setEditRecord(row)}
                            className="text-[#00897B] hover:text-[#5eead4] transition-colors"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(row.id)}
                            className="text-red-400 hover:text-red-500 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-[#1e3552] flex items-center justify-between">
                <span className="text-xs text-[#94a3b8]">
                  {rekapData.length} rekap · Hal {page}/{totalPages}
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

      {/* New entry modal */}
      {selectedGardu && (
        <PenyeimbanganModal
          mode="new"
          row={selectedGardu}
          onClose={() => setSelectedGardu(null)}
          onSave={handleSave}
        />
      )}

      {/* Edit modal */}
      {editRecord && (
        <PenyeimbanganModal
          mode="edit"
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
