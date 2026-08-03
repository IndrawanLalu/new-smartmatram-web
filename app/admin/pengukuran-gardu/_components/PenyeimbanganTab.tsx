"use client";

import { useState, useMemo } from "react";
import {
  Search, Trash2, Pencil, ChevronLeft, ChevronRight,
  Scale, FileCheck, AlertTriangle, TrendingUp, Download,
  Check, X as XIcon, ClipboardX, Info, Radio, Eye,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  usePenyeimbangan,
  type PenyeimbanganGardu,
  type SavePenyeimbanganInput,
  type UpdatePenyeimbanganInput,
} from "../_hooks/usePenyeimbangan";
import type { PengukuranGardu } from "../_hooks/usePengukuranGardu";
import { detectAnomali, type AnomalySettings } from "../_utils/detectAnomali";
import PenyeimbanganModal from "./PenyeimbanganModal";
import DetailPemerataanModal from "./DetailPemerataanModal";
import { downloadPenyeimbanganXlsx, downloadWoGarduXlsx } from "../_utils/downloadXlsx";
import { JENIS_PEMELIHARAAN_OPTIONS } from "../_utils/constants";

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const PAGE_SIZE = 20;

const INPUT_CLASS =
  "border border-line rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 bg-white";

const JENIS_COLOR: Record<string, string> = {
  "PEMERATAAN BEBAN":   "bg-navy-50 border-navy-200 text-navy-600",
  "OPTIMASI TRAFO":     "bg-blue-50 border-blue-200 text-blue-700",
  "PEMELIHARAAN GARDU": "bg-amber-50 border-amber-200 text-amber-700",
  "MANUVER BEBAN":      "bg-purple-50 border-purple-200 text-purple-700",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pctCls(pct: number) {
  if (pct >= 80) return "text-red-600 font-bold";
  if (pct >= 60) return "text-amber-600 font-semibold";
  return "text-green-700 font-semibold";
}

function fmtTanggal(s: string): string {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function ArusCell({ r, s, t, n }: { r: number; s: number; t: number; n: number }) {
  return (
    <span className="text-xs font-mono text-ink-soft">
      {Math.round(r)}/{Math.round(s)}/{Math.round(t)}/{Math.round(n)}
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  latestData: PengukuranGardu[];
  anomaliData: PengukuranGardu[];       // pre-filtered: match criteria
  settings: AnomalySettings;
  hasActiveCriteria: boolean;
  ulp: string;
  onPatchRow: (id: string, patch: Partial<PengukuranGardu>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PenyeimbanganTab({
  latestData, anomaliData, settings, hasActiveCriteria, ulp, onPatchRow,
}: Props) {
  const now = new Date();

  const {
    data: allRekapData,
    filteredData: rekapData,
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
    kirimKeAmg,
    deleteItem,
  } = usePenyeimbangan(ulp);

  const [searchQuery, setSearchQuery]     = useState("");
  const [selectedGardu, setSelectedGardu] = useState<PengukuranGardu | null>(null);
  const [editRecord, setEditRecord]       = useState<PenyeimbanganGardu | null>(null);
  const [detailRecord, setDetailRecord]   = useState<PenyeimbanganGardu | null>(null);
  const [amgBusy, setAmgBusy]             = useState<string | null>(null);

  async function handleKirimAmg(row: PenyeimbanganGardu) {
    setAmgBusy(row.id);
    const err = await kirimKeAmg(row);
    setAmgBusy(null);
    if (err) alert(err);
  }
  const [editingJenisId, setEditingJenisId]     = useState<string | null>(null);
  const [editingJenisValue, setEditingJenisValue] = useState("");
  const [savingJenis, setSavingJenis]     = useState(false);
  const [page, setPage]                   = useState(1);
  const [filterWoJenis, setFilterWoJenis] = useState("");

  const years = useMemo(
    () => Array.from({ length: 4 }, (_, i) => now.getFullYear() - 1 + i),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Anomali belum di-WO (jenis_pemeliharaan kosong)
  const anomaliBelumWo = useMemo(
    () => anomaliData.filter((d) => !d.jenis_pemeliharaan),
    [anomaliData]
  );

  // Sudah di-WO: semua latestData dengan jenis_pemeliharaan terisi, bebas dari kriteria anomali
  const anomaliSudahWo = useMemo(
    () => latestData.filter(
      (d) => !!d.jenis_pemeliharaan &&
             (!filterWoJenis || d.jenis_pemeliharaan === filterWoJenis)
    ),
    [latestData, filterWoJenis]
  );

  // Memoize detectAnomali results — hindari hitung ulang tiap render
  const anomaliBelumWoMap = useMemo(
    () => new Map(anomaliBelumWo.map((row) => [row.id, detectAnomali(row, settings)])),
    [anomaliBelumWo, settings]
  );

  const anomaliSudahWoMap = useMemo(
    () => hasActiveCriteria
      ? new Map(anomaliSudahWo.map((row) => [row.id, detectAnomali(row, settings)]))
      : new Map<string, ReturnType<typeof detectAnomali>>(),
    [anomaliSudahWo, settings, hasActiveCriteria]
  );

  // Search gardu untuk catat penyeimbangan manual
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
    const woSentAt = new Date().toISOString();
    const { error } = await supabaseBrowser
      .from("pengukuran_gardu")
      .update({ jenis_pemeliharaan: editingJenisValue, wo_sent_at: woSentAt })
      .eq("id", id);
    if (!error) {
      onPatchRow(id, { jenis_pemeliharaan: editingJenisValue, wo_sent_at: woSentAt });
      setEditingJenisId(null);
    }
    setSavingJenis(false);
  }

  async function handleSave(input: SavePenyeimbanganInput) {
    const err = await savePenyeimbangan(input);
    if (!err) { setSelectedGardu(null); setSearchQuery(""); }
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

  // Inline jenis cell (dipakai di kedua tabel anomali)
  /** Status pengiriman AMG untuk hasil pemerataan.
   *
   *  Yang dikirim adalah baris pengukuran "setelah" yang dibuat aplikasi mobile,
   *  bukan rekap ini — AMG hanya menerima bentuk satu baris pengukuran. Rekap
   *  yang diinput manual lewat web tidak punya baris itu, jadi tombolnya absen
   *  ketimbang tampil mati tanpa penjelasan. */
  function AmgCell({ row }: { row: PenyeimbanganGardu }) {
    const after = row.pengukuran_after?.[0];
    if (!after) return null;

    if (after.amg_sent_at) {
      return (
        <span className="text-[10px] font-semibold text-emerald-600" title={`Terkirim ${fmtTanggal(after.amg_sent_at.split("T")[0])}`}>
          AMG ✓
        </span>
      );
    }
    if (after.amg_queued_at) {
      return (
        <span className="text-[10px] font-semibold text-navy-500" title="Menunggu dikirim agen lokal">
          ANTRE
        </span>
      );
    }
    if (after.amg_error) {
      return (
        <button
          onClick={() => handleKirimAmg(row)}
          className="text-[10px] font-semibold text-red-600 hover:underline"
          title={`Gagal: ${after.amg_error}${after.amg_attempts >= 3 ? " (berhenti setelah 3 percobaan)" : ""}`}
        >
          AMG GAGAL{after.amg_attempts >= 3 ? " 3x" : ""}
        </button>
      );
    }
    return (
      <button
        onClick={() => handleKirimAmg(row)}
        disabled={amgBusy === row.id}
        className="text-navy-600 hover:text-accent-deep transition-colors disabled:opacity-40"
        title="Kirim hasil pemerataan ke AMG"
      >
        <Radio size={13} />
      </button>
    );
  }

  function JenisCell({ row }: { row: PengukuranGardu }) {
    const isEditing = editingJenisId === row.id;
    if (isEditing) {
      return (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <select
            value={editingJenisValue}
            onChange={(e) => setEditingJenisValue(e.target.value)}
            autoFocus
            className="text-xs bg-white border border-navy-500 rounded px-2 py-1 text-ink focus:outline-none"
          >
            {JENIS_PEMELIHARAAN_OPTIONS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <button
            onClick={() => handleSaveJenis(row.id)}
            disabled={savingJenis}
            className="w-6 h-6 flex items-center justify-center rounded bg-navy-600 text-white hover:bg-navy-500 disabled:opacity-50"
          >
            {savingJenis ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check size={11} />}
          </button>
          <button
            onClick={() => setEditingJenisId(null)}
            className="w-6 h-6 flex items-center justify-center rounded border border-line text-ink-soft hover:bg-surface"
          >
            <XIcon size={11} />
          </button>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1 group" onClick={(e) => e.stopPropagation()}>
        <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
          row.jenis_pemeliharaan
            ? (JENIS_COLOR[row.jenis_pemeliharaan] ?? "bg-line border-line text-ink-soft")
            : "border-dashed border-line text-ink-muted"
        }`}>
          {row.jenis_pemeliharaan ?? "— set jenis —"}
        </span>
        <button
          onClick={() => {
            setEditingJenisId(row.id);
            setEditingJenisValue(row.jenis_pemeliharaan ?? JENIS_PEMELIHARAAN_OPTIONS[0]);
          }}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-ink-soft hover:text-accent-deep hover:bg-surface transition-all"
          title="Set jenis WO"
        >
          <Pencil size={10} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Kriteria belum diset ─────────────────────────────────────────────── */}
      {!hasActiveCriteria && (
        <div className="bg-white rounded-xl border border-amber-200 p-5 flex items-start gap-3">
          <Info size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-700">Kriteria anomali belum diset</p>
            <p className="text-xs text-ink-soft mt-1">
              Expand panel <span className="font-medium text-ink">&ldquo;Kriteria Anomali&rdquo;</span> di atas
              dan aktifkan minimal satu threshold untuk melihat daftar gardu anomali.
            </p>
          </div>
        </div>
      )}

      {/* ── Section: Anomali Belum di-WO ────────────────────────────────────── */}
      {hasActiveCriteria && (
        <div className="bg-white rounded-xl border border-red-200 overflow-hidden">
          <div className="px-5 py-3 bg-red-50/60 border-b border-red-200 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600 shrink-0" />
            <h3 className="text-sm font-semibold text-red-600">
              Anomali — Belum di-WO
            </h3>
            <span className="text-xs text-red-500/70">({anomaliBelumWo.length} gardu)</span>
            <p className="ml-auto text-[11px] text-ink-muted hidden sm:block">
              Klik ikon pensil untuk set jenis WO
            </p>
          </div>

          {anomaliBelumWo.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-ink-muted">
              <ClipboardX size={28} className="text-green-500/50" />
              <p className="text-sm text-green-700">Semua gardu anomali sudah di-WO 🎉</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-surface">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">No</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">No. Gardu</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Penyulang</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Alamat</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-accent-deep">KVA</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-accent-deep">Beban %</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-accent-deep">Arus R/S/T/N</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-accent-deep">Suhu °C</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-accent-deep">Alasan Anomali</th>
                    <th className="px-3 py-2.5 text-xs font-semibold text-accent-deep">Jenis WO</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {anomaliBelumWo.map((row, idx) => {
                    const { reasons } = anomaliBelumWoMap.get(row.id) ?? { reasons: [] };
                    return (
                      <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-white"}>
                        <td className="px-3 py-2.5 text-xs text-ink-soft">{idx + 1}</td>
                        <td className="px-3 py-2.5 font-semibold text-ink">{row.no_gardu}</td>
                        <td className="px-3 py-2.5 text-xs text-ink-soft">{row.penyulang ?? "—"}</td>
                        <td className="px-3 py-2.5 text-xs text-ink-soft max-w-[160px] truncate">{row.alamat ?? "—"}</td>
                        <td className="px-3 py-2.5 text-center text-xs text-ink-soft">{row.kva_trafo}</td>
                        <td className="px-3 py-2.5 text-center">
                          <span className={`text-xs font-bold ${pctCls(row.persen_beban)}`}>
                            {Math.round(row.persen_beban)}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <ArusCell r={row.total_arus_r} s={row.total_arus_s} t={row.total_arus_t} n={row.total_arus_n} />
                        </td>
                        <td className="px-3 py-2.5 text-center text-xs">
                          <span className={row.suhu_trafo > 60 ? "text-amber-600 font-semibold" : "text-ink-soft"}>
                            {row.suhu_trafo ?? "—"}
                          </span>
                        </td>
                        {/* Alasan anomali */}
                        <td className="px-3 py-2.5 max-w-[220px]">
                          <div className="flex flex-wrap gap-1">
                            {reasons.map((r, i) => (
                              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 border border-red-200 text-red-700 whitespace-nowrap">
                                {r}
                              </span>
                            ))}
                          </div>
                        </td>
                        {/* Jenis WO inline */}
                        <td className="px-3 py-2.5">
                          <JenisCell row={row} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Section: Anomali Sudah di-WO ────────────────────────────────────── */}
      {anomaliSudahWo.length > 0 || filterWoJenis ? (
        <div className="bg-white rounded-xl border border-navy-200 overflow-hidden">
          <div className="px-5 py-3 bg-navy-50 border-b border-navy-200 flex flex-wrap items-center gap-2">
            <FileCheck size={16} className="text-emerald-600 shrink-0" />
            <h3 className="text-sm font-semibold text-emerald-600">Gardu Sudah di-WO</h3>
            <span className="text-xs text-ink-muted">({anomaliSudahWo.length} gardu)</span>
            <select
              value={filterWoJenis}
              onChange={(e) => setFilterWoJenis(e.target.value)}
              className="ml-2 border border-line rounded-lg px-2 py-1 text-xs text-ink bg-white focus:outline-none focus:border-navy-500"
            >
              <option value="">Semua Jenis</option>
              {JENIS_PEMELIHARAAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <button
              onClick={() => downloadWoGarduXlsx(anomaliSudahWo, `Gardu_WO_${new Date().toISOString().split("T")[0]}.xlsx`)}
              disabled={anomaliSudahWo.length === 0}
              className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg bg-navy-600 text-white text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
            >
              <Download size={13} />
              Download XLSX
            </button>
          </div>
          {anomaliSudahWo.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-ink-muted">
              <ClipboardX size={24} className="text-ink-muted/50" />
              <p className="text-sm">Tidak ada gardu dengan jenis {filterWoJenis}</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-navy-50">
                  <th className="text-left px-4 py-2.5 text-xs text-emerald-600 font-semibold">No. Gardu</th>
                  <th className="text-left px-4 py-2.5 text-xs text-emerald-600 font-semibold">Penyulang</th>
                  <th className="text-left px-4 py-2.5 text-xs text-emerald-600 font-semibold">Alamat</th>
                  <th className="text-center px-4 py-2.5 text-xs text-emerald-600 font-semibold">KVA</th>
                  <th className="text-center px-4 py-2.5 text-xs text-emerald-600 font-semibold">% Beban</th>
                  <th className="text-left px-4 py-2.5 text-xs text-emerald-600 font-semibold">Tgl Ukur</th>
                  <th className="text-left px-4 py-2.5 text-xs text-emerald-600 font-semibold">Jenis WO</th>
                  {hasActiveCriteria && (
                    <th className="text-center px-4 py-2.5 text-xs text-emerald-600 font-semibold">Kriteria</th>
                  )}
                  <th className="text-center px-4 py-2.5 text-xs text-emerald-600 font-semibold">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {anomaliSudahWo.map((row, i) => {
                  const sudahSeimbang = allRekapData.some((r) => r.pengukuran_id === row.id);
                  const anomResult = anomaliSudahWoMap.get(row.id) ?? null;
                  return (
                    <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-white"}>
                      <td className="px-4 py-2.5 font-semibold text-ink">{row.no_gardu}</td>
                      <td className="px-4 py-2.5 text-ink-soft text-xs">{row.penyulang ?? "—"}</td>
                      <td className="px-4 py-2.5 text-ink-soft text-xs max-w-40 truncate">{row.alamat ?? "—"}</td>
                      <td className="px-4 py-2.5 text-center text-xs text-ink-soft">{row.kva_trafo}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-bold ${pctCls(row.persen_beban)}`}>
                          {Math.round(row.persen_beban)}%
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-ink-soft text-xs">{fmtTanggal(row.tanggal_pengukuran)}</td>
                      <td className="px-4 py-2">
                        <JenisCell row={row} />
                      </td>
                      {hasActiveCriteria && (
                        <td className="px-4 py-2.5 text-center">
                          {anomResult?.isAnomali ? (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 font-semibold cursor-default"
                              title={anomResult.reasons.join(" · ")}
                            >
                              Masih Anomali
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-semibold">
                              Normal
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-2.5 text-center">
                        {sudahSeimbang ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 font-semibold">
                            Selesai
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200 font-semibold flex items-center gap-1 w-fit mx-auto">
                            <TrendingUp size={10} /> Proses
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {!sudahSeimbang && (
                          <button
                            onClick={() => setSelectedGardu(row)}
                            className="text-xs px-2 py-1 rounded-lg bg-navy-50 border border-navy-300 text-accent-deep hover:bg-navy-50 transition-colors whitespace-nowrap"
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
          )}
        </div>
      ) : null}

      {/* ── Pencarian Gardu (catat manual) ──────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-line p-5">
        <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
          <Scale size={16} className="text-navy-600" />
          Catat Penyeimbangan Manual
        </h3>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari gardu berdasarkan no. gardu, penyulang, atau alamat..."
            className="w-full pl-9 pr-4 py-2.5 border border-line rounded-lg text-sm text-ink bg-white placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
          />
        </div>
        {searchQuery.trim() && searchResults.length === 0 && (
          <p className="mt-3 text-sm text-ink-soft text-center py-4">Gardu tidak ditemukan</p>
        )}
        {searchResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {searchResults.map((row) => (
              <button
                key={row.id}
                onClick={() => setSelectedGardu(row)}
                className="w-full text-left bg-white border border-line hover:border-navy-500/50 rounded-lg px-4 py-3 transition-colors group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-semibold text-ink group-hover:text-accent-deep transition-colors">
                      {row.no_gardu}
                    </span>
                    <span className="ml-2 text-xs text-ink-soft">{row.penyulang}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-soft">{row.kva_trafo} kVA</span>
                    <span className={`text-sm font-bold ${pctCls(row.persen_beban)}`}>
                      {Math.round(row.persen_beban)}%
                    </span>
                  </div>
                </div>
                {row.alamat && <p className="mt-0.5 text-xs text-ink-soft truncate">{row.alamat}</p>}
                <p className="mt-0.5 text-xs text-ink-muted">
                  Pengukuran terakhir: {fmtTanggal(row.tanggal_pengukuran)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Rekap Penyeimbangan ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-line overflow-hidden">
        <div className="px-5 py-4 border-b border-line flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-semibold text-ink mr-auto">Rekap Penyeimbangan Beban</h3>
          <button
            onClick={() => downloadPenyeimbanganXlsx(rekapData, `Penyeimbangan_Beban_${MONTHS[month - 1]}_${year}.xlsx`)}
            disabled={rekapData.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-600 text-white text-sm hover:opacity-90 transition-opacity disabled:opacity-40"
          >
            <Download size={14} />
            Download XLSX
          </button>
          <select value={filterJenis} onChange={(e) => { setFilterJenis(e.target.value); setPage(1); }} className={INPUT_CLASS}>
            <option value="">Semua Jenis</option>
            {JENIS_PEMELIHARAAN_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPage(1); }} className={INPUT_CLASS}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPage(1); }} className={INPUT_CLASS}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        {rekapError && (
          <div className="m-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{rekapError}</div>
        )}
        {rekapLoading && (
          <div className="flex items-center justify-center py-12 gap-2 text-ink-soft text-sm">
            <div className="w-5 h-5 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
            Memuat data...
          </div>
        )}
        {!rekapLoading && rekapData.length === 0 && (
          <div className="text-center py-12 text-ink-soft text-sm">
            Belum ada rekap penyeimbangan pada {MONTHS[month - 1]} {year}
          </div>
        )}

        {!rekapLoading && rekapData.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-surface">
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">No</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Tgl Seimbang</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Gardu</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Alamat</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Penyulang</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-accent-deep">KVA</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-red-600" colSpan={2}>Sebelum</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-green-700" colSpan={2}>Sesudah</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Jenis</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Petugas</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-accent-deep">Catatan</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                  <tr className="bg-surface border-t border-line/50">
                    {["", "", "", "", "", ""].map((_, i) => <th key={i} className="px-3 py-1" />)}
                    <th className="px-3 py-1 text-center text-[10px] text-ink-soft">R/S/T/N (A)</th>
                    <th className="px-3 py-1 text-center text-[10px] text-ink-soft">Beban %</th>
                    <th className="px-3 py-1 text-center text-[10px] text-ink-soft">R/S/T/N (A)</th>
                    <th className="px-3 py-1 text-center text-[10px] text-ink-soft">Beban %</th>
                    <th className="px-3 py-1" /><th className="px-3 py-1" /><th className="px-3 py-1" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {paginatedRekap.map((row, idx) => (
                    <tr key={row.id} className={idx % 2 === 0 ? "bg-white" : "bg-white"}>
                      <td className="px-3 py-2.5 text-xs text-ink-soft">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                      <td className="px-3 py-2.5 text-xs text-ink">{fmtTanggal(row.tgl_penyeimbangan)}</td>
                      <td className="px-3 py-2.5 text-xs font-semibold text-ink">{row.no_gardu}</td>
                      <td className="px-3 py-2.5 text-xs text-ink-soft max-w-[180px] truncate">{row.alamat ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-ink-soft">{row.penyulang ?? "—"}</td>
                      <td className="px-3 py-2.5 text-center text-xs text-ink-soft">{row.kva_trafo}</td>
                      <td className="px-3 py-2.5 text-center">
                        <ArusCell r={row.arus_r_before} s={row.arus_s_before} t={row.arus_t_before} n={row.arus_n_before} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-bold ${pctCls(row.beban_pct_before)}`}>{Math.round(row.beban_pct_before)}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <ArusCell r={row.arus_r_after} s={row.arus_s_after} t={row.arus_t_after} n={row.arus_n_after} />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={`text-xs font-bold ${pctCls(row.beban_pct_after)}`}>{Math.round(row.beban_pct_after)}%</span>
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        {row.jenis_pemeliharaan ? (
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-medium ${JENIS_COLOR[row.jenis_pemeliharaan] ?? "bg-line border-line text-ink-soft"}`}>
                            {row.jenis_pemeliharaan}
                          </span>
                        ) : <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-ink-soft">{row.petugas_penyeimbang ?? "—"}</td>
                      <td className="px-3 py-2.5 text-xs text-ink-soft max-w-[200px]">
                        {row.catatan ? <span className="truncate block" title={row.catatan}>{row.catatan}</span> : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {/* Satu pintu: detail, bukti foto, dan kirim AMG semuanya
                              di dalam modal — keputusan kirim diambil setelah
                              melihat angkanya, bukan dari baris tabel. */}
                          <button
                            onClick={() => setDetailRecord(row)}
                            className="text-navy-600 hover:text-accent-deep transition-colors"
                            title="Lihat detail, foto, & kirim AMG"
                          >
                            <Eye size={14} />
                          </button>
                          <AmgCell row={row} />
                          <button onClick={() => setEditRecord(row)} className="text-navy-600 hover:text-accent-deep transition-colors" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => handleDelete(row.id)} className="text-red-600 hover:text-red-500 transition-colors" title="Hapus">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-line flex items-center justify-between">
                <span className="text-xs text-ink-soft">{rekapData.length} rekap · Hal {page}/{totalPages}</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-line text-ink-soft hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded border border-line text-ink-soft hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {selectedGardu && (
        <PenyeimbanganModal mode="new" row={selectedGardu} onClose={() => setSelectedGardu(null)} onSave={handleSave} />
      )}
      {editRecord && (
        <PenyeimbanganModal mode="edit" record={editRecord} onClose={() => setEditRecord(null)} onUpdate={handleUpdate} />
      )}
      {detailRecord && (
        <DetailPemerataanModal
          record={detailRecord}
          amgBusy={amgBusy === detailRecord.id}
          onKirimAmg={handleKirimAmg}
          onClose={() => setDetailRecord(null)}
        />
      )}
    </div>
  );
}
