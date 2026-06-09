"use client";

import { useState, useMemo } from "react";
import { Search, Trash2, Pencil, ChevronLeft, ChevronRight, Scale, FileCheck, AlertTriangle, TrendingUp, Download, Check, X as XIcon } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  usePenyeimbangan,
  type PenyeimbanganGardu,
  type SavePenyeimbanganInput,
  type UpdatePenyeimbanganInput,
} from "../_hooks/usePenyeimbangan";
import type { PengukuranGardu } from "../_hooks/usePengukuranGardu";
import PenyeimbanganModal from "./PenyeimbanganModal";
import { downloadPenyeimbanganXlsx, downloadWoGarduXlsx } from "../_utils/downloadXlsx";
import { JENIS_PEMELIHARAAN_OPTIONS } from "../_utils/constants";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const PAGE_SIZE = 20;

const INPUT_CLASS =
  "border border-[#1e3552] rounded-lg px-3 py-1.5 text-sm text-[#e2e8f0] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 bg-[#162334]";

const JENIS_COLOR: Record<string, string> = {
  "PEMERATAAN BEBAN":   "bg-teal-900/40 border-teal-500/40 text-teal-300",
  "OPTIMASI TRAFO":     "bg-blue-900/40 border-blue-500/40 text-blue-300",
  "PEMELIHARAAN GARDU": "bg-amber-900/40 border-amber-500/40 text-amber-300",
  "MANUVER BEBAN":      "bg-purple-900/40 border-purple-500/40 text-purple-300",
};

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
  onPatchRow: (id: string, patch: Partial<PengukuranGardu>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PenyeimbanganTab({ latestData, ulp, onPatchRow }: Props) {
  const now = new Date();

  // Rekap hook
  const {
    data: allRekapData,      // semua rekap bulan ini (untuk cek WO table)
    filteredData: rekapData, // jenis-filtered (untuk tabel rekap)
    loading: rekapLoading,
    error: rekapError,
    month,
    setMonth,
    year,
    setYear,
    filterJenis,
    setFilterJenis,
    savePenyeimbangan,
    updatePenyeimbangan,
    deleteItem,
  } = usePenyeimbangan(ulp);

  // Pencarian gardu
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGardu, setSelectedGardu] = useState<PengukuranGardu | null>(null);
  const [editRecord, setEditRecord] = useState<PenyeimbanganGardu | null>(null);

  // Inline edit jenis di tabel WO
  const [editingJenisId, setEditingJenisId] = useState<string | null>(null);
  const [editingJenisValue, setEditingJenisValue] = useState("");
  const [savingJenis, setSavingJenis] = useState(false);

  // Rekap pagination
  const [page, setPage] = useState(1);

  const years = useMemo(
    () => Array.from({ length: 4 }, (_, i) => now.getFullYear() - 1 + i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Gardu yang sudah di-WO pada bulan/tahun yang dipilih, difilter by jenis
  const filteredWoedGardu = useMemo(() => {
    return latestData.filter((d) => {
      if (!d.wo_sent_at) return false;
      const dt = new Date(d.wo_sent_at);
      if (dt.getMonth() + 1 !== month || dt.getFullYear() !== year) return false;
      if (filterJenis && d.jenis_pemeliharaan !== filterJenis) return false;
      return true;
    });
  }, [latestData, month, year, filterJenis]);

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

  async function handleSaveJenis(id: string) {
    setSavingJenis(true);
    const { error } = await supabaseBrowser
      .from("pengukuran_gardu")
      .update({ jenis_pemeliharaan: editingJenisValue })
      .eq("id", id);
    if (!error) {
      onPatchRow(id, { jenis_pemeliharaan: editingJenisValue });
      setEditingJenisId(null);
    }
    setSavingJenis(false);
  }

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

          <button
            onClick={() =>
              downloadPenyeimbanganXlsx(
                rekapData,
                `Penyeimbangan_Beban_${MONTHS[month - 1]}_${year}.xlsx`
              )
            }
            disabled={rekapData.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-linear-to-r from-[#004D40] to-[#00897B] text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Download size={14} />
            Download XLSX
          </button>

          <select
            value={filterJenis}
            onChange={(e) => { setFilterJenis(e.target.value); setPage(1); }}
            className={INPUT_CLASS}
          >
            <option value="">Semua Jenis</option>
            {JENIS_PEMELIHARAAN_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>

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
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Jenis</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Petugas</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-[#5eead4]">Catatan</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                  <tr className="bg-[#0a1628] border-t border-[#1e3552]/50">
                    {/* spacer cols */}
                    {["", "", "", "", "", "", ""].map((_, i) => (
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
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {row.jenis_pemeliharaan ? (
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${
                            JENIS_COLOR[row.jenis_pemeliharaan] ?? "bg-[#1e3552] border-[#2d4a6b] text-[#94a3b8]"
                          }`}>
                            {row.jenis_pemeliharaan}
                          </span>
                        ) : <span className="text-[#475569]">—</span>}
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

      {/* ── Gardu yang sudah di-WO pada bulan ini ──────────────────────────── */}
      {filteredWoedGardu.length > 0 && (
        <div className="bg-[#162334] rounded-xl border border-teal-500/30 overflow-hidden">
          <div className="px-5 py-3 bg-teal-900/20 border-b border-teal-500/20 flex items-center gap-2">
            <FileCheck size={16} className="text-teal-400" />
            <h3 className="text-sm font-semibold text-teal-400">
              Gardu Sudah di-WO — {MONTHS[month - 1]} {year}
            </h3>
            <span className="ml-1 text-xs text-teal-500/70">({filteredWoedGardu.length} gardu)</span>
            <button
              onClick={() =>
                downloadWoGarduXlsx(
                  filteredWoedGardu,
                  `Gardu_WO_${MONTHS[month - 1]}_${year}.xlsx`
                )
              }
              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg bg-linear-to-r from-[#004D40] to-[#00897B] text-white text-xs font-medium hover:opacity-90 transition-opacity"
            >
              <Download size={13} />
              Download XLSX
            </button>
            <span className="text-xs text-[#475569]">Klik gardu untuk catat penyeimbangan</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-teal-900/10">
                  <th className="text-left px-4 py-2.5 text-xs text-teal-400 font-semibold whitespace-nowrap">No. Gardu</th>
                  <th className="text-left px-4 py-2.5 text-xs text-teal-400 font-semibold">Penyulang</th>
                  <th className="text-left px-4 py-2.5 text-xs text-teal-400 font-semibold">Alamat</th>
                  <th className="text-center px-4 py-2.5 text-xs text-teal-400 font-semibold">KVA</th>
                  <th className="text-center px-4 py-2.5 text-xs text-teal-400 font-semibold">% Beban</th>
                  <th className="text-left px-4 py-2.5 text-xs text-teal-400 font-semibold whitespace-nowrap">Tgl WO</th>
                  <th className="text-left px-4 py-2.5 text-xs text-teal-400 font-semibold whitespace-nowrap">Tgl Ukur</th>
                  <th className="text-left px-4 py-2.5 text-xs text-teal-400 font-semibold">Jenis</th>
                  <th className="text-center px-4 py-2.5 text-xs text-teal-400 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e3552]">
                {filteredWoedGardu.map((row, i) => {
                  const sudahSeimbang = allRekapData.some((r) => r.pengukuran_id === row.id);
                  const isEditingJenis = editingJenisId === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${i % 2 === 0 ? "bg-[#162334]" : "bg-[#0d1b2a]"}`}
                    >
                      <td className="px-4 py-2.5 font-semibold text-[#e2e8f0] whitespace-nowrap">
                        {row.no_gardu}
                        {row.persen_beban >= 80 && (
                          <AlertTriangle size={11} className="inline ml-1 text-red-400" />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-[#94a3b8]">{row.penyulang ?? "—"}</td>
                      <td className="px-4 py-2.5 text-[#94a3b8] max-w-40 truncate">{row.alamat ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center text-[#94a3b8]">{row.kva_trafo}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-bold ${pctCls(row.persen_beban)}`}>
                          {Math.round(row.persen_beban)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#94a3b8] text-xs whitespace-nowrap">
                        {row.wo_sent_at ? fmtTanggal(row.wo_sent_at.split("T")[0]) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[#94a3b8] text-xs whitespace-nowrap">
                        {fmtTanggal(row.tanggal_pengukuran)}
                      </td>

                      {/* Jenis — inline editable */}
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        {isEditingJenis ? (
                          <div className="flex items-center gap-1">
                            <select
                              value={editingJenisValue}
                              onChange={(e) => setEditingJenisValue(e.target.value)}
                              autoFocus
                              className="text-xs bg-[#0d1b2a] border border-[#00897B] rounded px-2 py-1 text-[#e2e8f0] focus:outline-none"
                            >
                              {JENIS_PEMELIHARAAN_OPTIONS.map((o) => (
                                <option key={o} value={o}>{o}</option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleSaveJenis(row.id)}
                              disabled={savingJenis}
                              className="w-6 h-6 flex items-center justify-center rounded bg-[#00897B] text-white hover:bg-[#00695C] disabled:opacity-50 transition-colors"
                            >
                              <Check size={11} />
                            </button>
                            <button
                              onClick={() => setEditingJenisId(null)}
                              className="w-6 h-6 flex items-center justify-center rounded border border-[#1e3552] text-[#94a3b8] hover:bg-white/5 transition-colors"
                            >
                              <XIcon size={11} />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 group">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                              row.jenis_pemeliharaan
                                ? (JENIS_COLOR[row.jenis_pemeliharaan] ?? "bg-[#1e3552] border-[#2d4a6b] text-[#94a3b8]")
                                : "border-transparent text-[#475569]"
                            }`}>
                              {row.jenis_pemeliharaan ?? "—"}
                            </span>
                            <button
                              onClick={() => {
                                setEditingJenisId(row.id);
                                setEditingJenisValue(row.jenis_pemeliharaan ?? JENIS_PEMELIHARAAN_OPTIONS[0]);
                              }}
                              className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-[#94a3b8] hover:text-[#5eead4] hover:bg-white/5 transition-all"
                              title="Ubah jenis"
                            >
                              <Pencil size={10} />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-2.5 text-center">
                        {sudahSeimbang ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 border border-green-500/30 font-semibold">
                            Selesai
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900/40 text-amber-400 border border-amber-500/30 font-semibold flex items-center gap-1 w-fit mx-auto">
                            <TrendingUp size={10} /> Proses
                          </span>
                        )}
                      </td>

                      {/* Aksi catat seimbang */}
                      <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {!sudahSeimbang && (
                          <button
                            onClick={() => setSelectedGardu(row)}
                            className="text-xs px-2 py-1 rounded-lg bg-[#00897B]/10 border border-[#00897B]/30 text-[#5eead4] hover:bg-[#00897B]/20 transition-colors whitespace-nowrap"
                          >
                            Catat Seimbang
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
