"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Upload, Trash2, AlertCircle, CheckCircle2,
  ChevronLeft, ChevronRight, Search, RotateCcw, FileDown,
} from "lucide-react";
import AnalisisModal from "./_components/AnalisisModal";
import type { RefGangguan } from "./_components/AnalisisModal";
import { downloadPadamApktTemplate } from "./_utils/downloadTemplate";
import { fetchJurnalMap, normNoLaporan, type JurnalApkt } from "./_utils/jurnal";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PadamApktRecord {
  id: string;
  no_laporan: string;
  ulp: string | null;
  penyulang: string | null;
  lokasi_titik_gangguan: string | null;
  tgl_padam: string | null;
  jam_padam: string | null;
  tgl_nyala_sementara: string | null;
  jam_nyala_sementara: string | null;
  tgl_nyala: string | null;
  jam_nyala: string | null;
  fasilitas: string | null;
  sub_fasilitas: string | null;
  equipment: string | null;
  event_damage: string | null;
  cause: string | null;
  group_cause: string | null;
  weather: string | null;
  jml_pelanggan_padam: number | null;
  lama_padam_jam: number | null;
  jam_x_pelanggan_padam: number | null;
  penyebab_padam: string | null;
  ens: number | null;
  ampere: string | null;
  keterangan: string | null;
  lokasi_gangguan: string | null;
  status_gangguan: string | null;
  analisis_keterangan: string | null;
  ref_gangguan: RefGangguan | null;
  [key: string]: unknown;
}

interface DbRow extends Omit<PadamApktRecord, "id"> {}

interface PenyulangStat {
  ulp: string;
  penyulang: string;
  jml_j: number;
  jml_p: number;
  pelanggan: number;
  jam_x_plgn: number;
  ens: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS = [
  { value: "01", label: "Januari" },
  { value: "02", label: "Februari" },
  { value: "03", label: "Maret" },
  { value: "04", label: "April" },
  { value: "05", label: "Mei" },
  { value: "06", label: "Juni" },
  { value: "07", label: "Juli" },
  { value: "08", label: "Agustus" },
  { value: "09", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

const now = new Date();
const CURRENT_YEAR  = now.getFullYear();
const CURRENT_MONTH = String(now.getMonth() + 1).padStart(2, "0");
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2].map(String);
const PAGE_SIZE = 20;

// Maps header names (Excel/JSON) → DB column names
const HEADER_MAP: Record<string, string> = {
  "NO LAPORAN":              "no_laporan",
  "ULP":                     "ulp",
  "PENYULANG":               "penyulang",
  "LOKASI TITIK GANGGUAN":   "lokasi_titik_gangguan",
  "Tanggal Padam":           "tgl_padam",
  "Jam Padam":               "jam_padam",
  "Tanggal Nyala Sementara": "tgl_nyala_sementara",
  "Jam Nyala Sementara":     "jam_nyala_sementara",
  "Tanggal Nyala":           "tgl_nyala",
  "Jam Nyala":               "jam_nyala",
  "Fasilitas":               "fasilitas",
  "Sub Fasilitas":           "sub_fasilitas",
  "Equipment":               "equipment",
  "EVENT DAMAGE":            "event_damage",
  "CAUSE":                   "cause",
  "GROUP CAUSE":             "group_cause",
  "WEATHER":                 "weather",
  "JUMLAH PELANGGAN PADAM":  "jml_pelanggan_padam",
  "LAMA PADAM (JAM)":        "lama_padam_jam",
  "JAM X PELANGGAN PADAM":   "jam_x_pelanggan_padam",
  "PENYEBAB PADAM":          "penyebab_padam",
  "ENS":                     "ens",
  "AMPERE":                  "ampere",
  "KETERANGAN":              "keterangan",
  "LOKASI GANGGUAN":         "lokasi_gangguan",
  "SECTION GANGGUAN":        "section_gangguan",
  "PEMBATAS SECTION":        "pembatas_section",
  "NO TIANG GANGGUAN":       "no_tiang_gangguan",
  "RELE PROTEKSI":           "rele_proteksi",
  "BESAR ARUS (AMPERE)":     "besar_arus_ampere",
};

const NUMERIC_FIELDS = new Set([
  "jml_pelanggan_padam", "lama_padam_jam", "jam_x_pelanggan_padam", "ens",
]);

// Kolom DB bertipe `time` — nilai non-waktu (cth: "Pemeliharaan") dibuang jadi null
const TIME_FIELDS = new Set([
  "jam_padam", "jam_nyala_sementara", "jam_nyala",
]);

// Kolom DB bertipe `date` — nilai non-tanggal dibuang jadi null
const DATE_FIELDS = new Set([
  "tgl_padam", "tgl_nyala_sementara", "tgl_nyala",
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function s(v: string | undefined): string | null {
  return v?.trim() || null;
}

function parseNum(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? null : n;
}

function parseInt_id(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = parseInt(v.replace(/\./g, ""), 10);
  return isNaN(n) ? null : n;
}

function stripUlp(v: string | undefined): string | null {
  return s(v?.replace(/^ULP\s+/i, ""));
}

// Validasi HH:mm atau HH:mm:ss — nilai teks bebas (cth: "Pemeliharaan") → null
function parseTime(v: string | undefined): string | null {
  const t = v?.trim();
  if (!t) return null;
  return /^\d{1,2}:\d{2}(:\d{2})?$/.test(t) ? t : null;
}

// Validasi YYYY-MM-DD atau DD/MM/YYYY — nilai tidak valid → null
function parseDate(v: string | undefined): string | null {
  const t = v?.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  // DD/MM/YYYY → YYYY-MM-DD
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return null;
}

function mapToDbRow(raw: Record<string, string>): DbRow {
  const out: Record<string, unknown> = {};
  for (const [header, field] of Object.entries(HEADER_MAP)) {
    const val = raw[header];
    if (field === "ulp") {
      out[field] = stripUlp(val);
    } else if (field === "jml_pelanggan_padam") {
      out[field] = parseInt_id(val);
    } else if (NUMERIC_FIELDS.has(field)) {
      out[field] = parseNum(val);
    } else if (TIME_FIELDS.has(field)) {
      out[field] = parseTime(val);
    } else if (DATE_FIELDS.has(field)) {
      out[field] = parseDate(val);
    } else {
      out[field] = s(val);
    }
  }
  return out as DbRow;
}

// Parser TSV/CSV yang menghormati sel ber-kutip (Excel membungkus sel yang
// mengandung tab/newline dengan "..."; kutip internal di-escape jadi "").
// Tanpa ini, sel multi-baris memecah baris → kolom bergeser → banyak null.
function parseDelimited(raw: string, delim: string): string[][] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }  // "" → "
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      row.push(field); field = "";
    } else if (ch === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

function parseTsv(raw: string): Record<string, string>[] {
  const matrix = parseDelimited(raw, "\t");
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => h.trim());
  return matrix
    .slice(1)
    .filter((vals) => vals.some((v) => v.trim()))
    .map((vals) =>
      Object.fromEntries(headers.map((h, i) => [h, vals[i]?.trim() ?? ""])),
    );
}

function parseInput(raw: string): { rows: DbRow[]; error: string | null } {
  if (!raw.trim()) return { rows: [], error: null };
  try {
    const trimmed = raw.trim();
    let rawRows: Record<string, string>[];

    if (trimmed.startsWith("[")) {
      const arr = JSON.parse(trimmed) as Record<string, string>[];
      if (!Array.isArray(arr)) return { rows: [], error: "Input harus berupa array JSON" };
      rawRows = arr;
    } else if (trimmed.includes("\t")) {
      rawRows = parseTsv(trimmed);
    } else {
      return { rows: [], error: "Format tidak dikenali — paste dari Excel atau JSON array" };
    }

    const rows = rawRows
      .filter((r) => r["NO LAPORAN"]?.trim())
      .map(mapToDbRow);

    if (rows.length === 0) return { rows: [], error: "Tidak ada baris data valid (periksa header kolom)" };
    return { rows, error: null };
  } catch (e) {
    return { rows: [], error: e instanceof Error ? e.message : "Format tidak valid" };
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function fmtNum(n: number | null, dec = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("id-ID", { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function buildRekap(rows: PadamApktRecord[]): PenyulangStat[] {
  const map = new Map<string, PenyulangStat>();
  for (const r of rows) {
    const key = `${r.ulp ?? ""}||${r.penyulang ?? ""}`;
    const s = map.get(key) ?? {
      ulp: r.ulp ?? "—",
      penyulang: r.penyulang ?? "—",
      jml_j: 0, jml_p: 0, pelanggan: 0, jam_x_plgn: 0, ens: 0,
    };
    const kode = (r.no_laporan[0] ?? "").toUpperCase();
    if (kode === "J") s.jml_j++;
    else if (kode === "P") s.jml_p++;
    s.pelanggan  += r.jml_pelanggan_padam   ?? 0;
    s.jam_x_plgn += r.jam_x_pelanggan_padam ?? 0;
    s.ens        += r.ens                   ?? 0;
    map.set(key, s);
  }
  return [...map.values()].sort((a, b) => (b.jml_j + b.jml_p) - (a.jml_j + a.jml_p));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PadamApktPage() {
  const [input,       setInput]       = useState("");
  const [saving,      setSaving]      = useState(false);
  const [saveMsg,     setSaveMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [filterYear,  setFilterYear]  = useState(CURRENT_YEAR.toString());
  const [filterMonth, setFilterMonth] = useState(CURRENT_MONTH);
  const [filterUlp,   setFilterUlp]   = useState<string | null>(null);
  const [tab,         setTab]         = useState<"rekap" | "detail" | "jdobel">("rekap");
  const [rows,        setRows]        = useState<PadamApktRecord[]>([]);
  const [ulpList,     setUlpList]     = useState<string[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [page,        setPage]        = useState(1);
  const [search,      setSearch]      = useState("");
  const [modalRow,    setModalRow]    = useState<PadamApktRecord | null>(null);
  const [jurnalMap,   setJurnalMap]   = useState<Map<string, JurnalApkt>>(new Map());

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(async (year: string, month: string) => {
    if (!year) return;
    setLoading(true);
    const params = new URLSearchParams({ year });
    if (month) params.set("month", month);
    try {
      const data = await fetch(`/api/padam-apkt?${params}`).then((r) => r.json()) as PadamApktRecord[];
      setRows(data);
      setPage(1);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadUlpList = useCallback(async () => {
    const data = await fetch("/api/padam-apkt?ulp-list=true").then((r) => r.json()) as string[];
    setUlpList(data);
  }, []);

  useEffect(() => { void loadUlpList(); }, [loadUlpList]);
  useEffect(() => { void loadData(filterYear, filterMonth); }, [filterYear, filterMonth, loadData]);

  // Lazy-load Jurnal APKT (sheet LOMBOK) saat tab Detail dibuka — cache 5 menit
  useEffect(() => {
    if (tab !== "detail" || jurnalMap.size > 0) return;
    fetchJurnalMap().then(setJurnalMap).catch(() => {});
  }, [tab, jurnalMap.size]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const parsed = useMemo(() => parseInput(input), [input]);

  const parsedDates = useMemo(() => {
    const s = new Set(parsed.rows.map((r) => r.tgl_padam as string | null).filter(Boolean));
    return [...s].sort() as string[];
  }, [parsed.rows]);

  const filteredRows = useMemo(
    () => (filterUlp ? rows.filter((r) => r.ulp === filterUlp) : rows),
    [rows, filterUlp],
  );

  const rekapStats = useMemo(() => buildRekap(filteredRows), [filteredRows]);

  // Kode J Dobel: group by no_laporan lintas ULP
  // - filterUlp aktif → hanya J-code yang ada di filterUlp DAN di ULP lain
  // - filterUlp null  → semua J-code yang muncul > 1 kali lintas ULP
  const jDobelGroups = useMemo(() => {
    const map = new Map<string, PadamApktRecord[]>();
    for (const r of rows) {
      if (r.no_laporan[0]?.toUpperCase() !== "J") continue;
      const group = map.get(r.no_laporan) ?? [];
      group.push(r);
      map.set(r.no_laporan, group);
    }
    return [...map.entries()]
      .filter(([, g]) => {
        if (g.length <= 1) return false;
        if (!filterUlp) return true;
        return g.some((r) => r.ulp === filterUlp) && g.some((r) => r.ulp !== filterUlp);
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [rows, filterUlp]);

  const searchedRows = useMemo(() => {
    if (!search.trim()) return filteredRows;
    const q = search.toLowerCase();
    return filteredRows.filter((r) =>
      [r.no_laporan, r.penyulang, r.ulp, r.penyebab_padam, r.keterangan, r.lokasi_gangguan]
        .some((v) => (v as string | null)?.toLowerCase().includes(q)),
    );
  }, [filteredRows, search]);

  const totalPages = Math.max(1, Math.ceil(searchedRows.length / PAGE_SIZE));
  const pagedRows  = searchedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!parsed.rows.length || parsed.error) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res  = await fetch("/api/padam-apkt", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rows: parsed.rows }),
      });
      const data = await res.json() as { ok: boolean; count: number; dedupCount: number; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Gagal menyimpan");
      const dedupNote = data.dedupCount > 0 ? ` (${data.dedupCount} duplikat dalam batch diabaikan)` : "";
      setSaveMsg({ ok: true, text: `✓ ${data.count} baris berhasil disimpan${dedupNote}` });
      setInput("");
      await Promise.all([loadData(filterYear, filterMonth), loadUlpList()]);
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : "Error tidak diketahui" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteMonth() {
    if (!filterYear || !filterMonth) return;
    const label = MONTHS.find((m) => m.value === filterMonth)?.label ?? filterMonth;
    if (!window.confirm(`Hapus semua data ${label} ${filterYear}?\nTindakan ini tidak bisa dibatalkan.`)) return;
    setDeleting(true);
    try {
      const res  = await fetch(`/api/padam-apkt?year=${filterYear}&month=${filterMonth}`, { method: "DELETE" });
      const data = await res.json() as { ok: boolean; error?: string };
      if (!data.ok) throw new Error(data.error ?? "Gagal menghapus");
      setRows([]);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Gagal menghapus");
    } finally {
      setDeleting(false);
    }
  }

  function handleAnalisisSaved(id: string, patch: {
    status_gangguan: string | null;
    analisis_keterangan: string | null;
    ref_gangguan: RefGangguan | null;
  }) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
    setModalRow((prev) => prev?.id === id ? { ...prev, ...patch } : prev);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeMonthLabel = MONTHS.find((m) => m.value === filterMonth)?.label ?? "";
  const rekapTotal = rekapStats.reduce(
    (acc, s) => ({
      jml_j:    acc.jml_j    + s.jml_j,
      jml_p:    acc.jml_p    + s.jml_p,
      pelanggan: acc.pelanggan + s.pelanggan,
      jam_x_plgn: acc.jam_x_plgn + s.jam_x_plgn,
      ens:      acc.ens      + s.ens,
    }),
    { jml_j: 0, jml_p: 0, pelanggan: 0, jam_x_plgn: 0, ens: 0 },
  );

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 space-y-5 text-[#1B2631]">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rekap Padam APKT</h1>
          <p className="text-white/70 text-sm mt-0.5">
            Import & analisis data gangguan penyulang dari APKT
          </p>
        </div>
        {rows.length > 0 && (
          <div className="bg-white/10 rounded-lg px-4 py-2 text-center">
            <p className="text-2xl font-bold">{filteredRows.length}</p>
            <p className="text-xs text-white/70">baris data</p>
          </div>
        )}
      </div>

      {/* Input Card */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-[#1B2631]">Import Data</p>
          <button
            onClick={() => downloadPadamApktTemplate()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#E0F2F1] text-[#00695C] hover:bg-[#B2DFDB] transition-colors"
          >
            <FileDown size={13} />
            Download Template Excel
          </button>
        </div>
        <p className="text-xs text-[#5D6D7E]">
          Paste dari Excel (copy termasuk baris header) atau JSON array dari APKT.
          Header Excel harus sesuai dengan nama kolom standar (NO LAPORAN, ULP, PENYULANG, dll).
          Gunakan tombol <span className="font-medium text-[#00695C]">Download Template</span> untuk format yang benar.
        </p>
        <textarea
          value={input}
          onChange={(e) => { setInput(e.target.value); setSaveMsg(null); }}
          placeholder={`Paste data Excel atau JSON di sini...\n\nContoh TSV (Excel):\nNO LAPORAN\tULP\tPENYULANG\t...\nP4426061100004\tULP AMPENAN\tGUNUNG SARI\t...`}
          className="w-full h-36 rounded-lg p-3 text-xs font-mono bg-[#0d1b2a] text-[#e2e8f0] border border-[#1e3552] focus:outline-none focus:border-[#00897B] resize-none placeholder:text-[#475569]"
        />

        {/* Validation feedback */}
        {input.trim() && (
          parsed.error ? (
            <div className="flex items-start gap-2 text-red-600 bg-red-50 rounded-lg p-3 text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" />
              <span>{parsed.error}</span>
            </div>
          ) : parsed.rows.length > 0 ? (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3 text-xs">
              <CheckCircle2 size={14} className="shrink-0" />
              <span>
                {parsed.rows.length} baris valid &mdash;&nbsp;
                {parsedDates.map(fmtDate).join(", ")}
              </span>
            </div>
          ) : null
        )}

        {saveMsg && (
          <div className={`flex items-center gap-2 rounded-lg p-3 text-xs ${saveMsg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
            {saveMsg.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            <span>{saveMsg.text}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || !parsed.rows.length || !!parsed.error}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-linear-to-r from-[#004D40] to-[#00897B] text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Upload size={14} />
            {saving ? "Menyimpan…" : "Simpan ke Database"}
          </button>
          {input.trim() && (
            <button
              onClick={() => { setInput(""); setSaveMsg(null); }}
              className="px-4 py-2 rounded-lg text-sm text-[#5D6D7E] border border-[#E2E8F0] hover:bg-gray-50"
            >
              Bersihkan
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 flex flex-wrap items-center gap-3">
        <select
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B]"
        >
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B]"
        >
          {MONTHS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>

        {/* ULP filter — dinamis dari DB */}
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterUlp(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !filterUlp
                ? "bg-[#00897B] text-white"
                : "bg-[#E0F2F1] text-[#00695C] hover:bg-[#B2DFDB]"
            }`}
          >
            Semua ULP
          </button>
          {ulpList.map((ulp) => (
            <button
              key={ulp}
              onClick={() => setFilterUlp(ulp === filterUlp ? null : ulp)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterUlp === ulp
                  ? "bg-[#00897B] text-white"
                  : "bg-[#E0F2F1] text-[#00695C] hover:bg-[#B2DFDB]"
              }`}
            >
              {ulp}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => loadData(filterYear, filterMonth)}
            title="Refresh"
            className="p-2 rounded-lg border border-[#E2E8F0] hover:bg-gray-50 text-[#5D6D7E]"
          >
            <RotateCcw size={14} />
          </button>
          {filterMonth && (
            <button
              onClick={handleDeleteMonth}
              disabled={deleting || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={13} />
              Hapus {activeMonthLabel} {filterYear}
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1">
        {(["rekap", "detail", "jdobel"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t
                ? "bg-[#00897B] text-white"
                : "bg-white text-[#5D6D7E] border border-[#E2E8F0] hover:bg-gray-50"
            }`}
          >
            {t === "rekap" ? "Rekap" : t === "detail" ? "Detail" : "Kode J Dobel"}
            {t === "jdobel" && jDobelGroups.length > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
                tab === "jdobel" ? "bg-white/20 text-white" : "bg-orange-100 text-orange-700"
              }`}>
                {jDobelGroups.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      ) : tab === "jdobel" ? (
        <JDobelTab groups={jDobelGroups} />
      ) : filteredRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E2E8F0] py-20 text-center text-[#5D6D7E] text-sm">
          Tidak ada data untuk {activeMonthLabel} {filterYear}
          {filterUlp ? ` — ULP ${filterUlp}` : ""}
        </div>
      ) : tab === "rekap" ? (
        <RekapTab stats={rekapStats} total={rekapTotal} />
      ) : (
        <DetailTab
          rows={pagedRows}
          jurnalMap={jurnalMap}
          search={search}
          onSearch={(v) => { setSearch(v); setPage(1); }}
          page={page}
          totalPages={totalPages}
          totalRows={searchedRows.length}
          onPageChange={setPage}
          onRowClick={setModalRow}
        />
      )}

      {modalRow && (
        <AnalisisModal
          record={modalRow}
          onClose={() => setModalRow(null)}
          onSaved={handleAnalisisSaved}
        />
      )}
    </div>
  );
}

// ── Rekap Tab ─────────────────────────────────────────────────────────────────

interface RekapTabProps {
  stats: PenyulangStat[];
  total: { jml_j: number; jml_p: number; pelanggan: number; jam_x_plgn: number; ens: number };
}

function RekapTab({ stats, total }: RekapTabProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[#E2E8F0]">
        {[
          { label: "Gangguan J",        value: total.jml_j.toString(),         note: "unplanned" },
          { label: "Gangguan P",        value: total.jml_p.toString(),         note: "planned" },
          { label: "Pelanggan Padam",   value: total.pelanggan.toLocaleString("id-ID"), note: "total" },
          { label: "Jam × Pelanggan",   value: fmtNum(total.jam_x_plgn, 0),    note: "total" },
          { label: "ENS (kWh)",         value: fmtNum(total.ens, 2),           note: "total" },
        ].map((c) => (
          <div key={c.label} className="bg-white px-4 py-3">
            <p className="text-xs text-[#5D6D7E]">{c.label}</p>
            <p className="text-xl font-bold text-[#1B2631] mt-0.5">{c.value}</p>
            <p className="text-xs text-[#94a3b8]">{c.note}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#E0F2F1] text-[#00695C] font-semibold text-xs">
              <th className="px-4 py-3 text-left">ULP</th>
              <th className="px-4 py-3 text-left">Penyulang</th>
              <th className="px-3 py-3 text-center">J</th>
              <th className="px-3 py-3 text-center">P</th>
              <th className="px-3 py-3 text-center">Total</th>
              <th className="px-4 py-3 text-right">Pelanggan Padam</th>
              <th className="px-4 py-3 text-right">Jam × Plgn</th>
              <th className="px-4 py-3 text-right">ENS (kWh)</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={`${s.ulp}-${s.penyulang}`} className={i % 2 === 0 ? "bg-white" : "bg-[#F4F6F8]"}>
                <td className="px-4 py-2.5 text-xs text-[#5D6D7E]">{s.ulp}</td>
                <td className="px-4 py-2.5 font-medium text-[#1B2631]">{s.penyulang}</td>
                <td className="px-3 py-2.5 text-center">
                  {s.jml_j > 0 ? (
                    <span className="inline-block bg-red-50 text-red-700 text-xs font-semibold px-2 py-0.5 rounded">
                      {s.jml_j}
                    </span>
                  ) : <span className="text-[#94a3b8]">—</span>}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {s.jml_p > 0 ? (
                    <span className="inline-block bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded">
                      {s.jml_p}
                    </span>
                  ) : <span className="text-[#94a3b8]">—</span>}
                </td>
                <td className="px-3 py-2.5 text-center font-semibold text-[#1B2631]">
                  {s.jml_j + s.jml_p}
                </td>
                <td className="px-4 py-2.5 text-right text-[#1B2631]">
                  {s.pelanggan.toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-2.5 text-right text-[#1B2631]">
                  {fmtNum(s.jam_x_plgn, 2)}
                </td>
                <td className="px-4 py-2.5 text-right text-[#1B2631]">
                  {fmtNum(s.ens, 2)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[#E0F2F1] text-[#00695C] font-semibold text-xs border-t border-[#B2DFDB]">
              <td className="px-4 py-2.5" colSpan={2}>Total</td>
              <td className="px-3 py-2.5 text-center">{total.jml_j}</td>
              <td className="px-3 py-2.5 text-center">{total.jml_p}</td>
              <td className="px-3 py-2.5 text-center font-bold">{total.jml_j + total.jml_p}</td>
              <td className="px-4 py-2.5 text-right">{total.pelanggan.toLocaleString("id-ID")}</td>
              <td className="px-4 py-2.5 text-right">{fmtNum(total.jam_x_plgn, 2)}</td>
              <td className="px-4 py-2.5 text-right">{fmtNum(total.ens, 2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Detail Tab ────────────────────────────────────────────────────────────────

interface DetailTabProps {
  rows: PadamApktRecord[];
  jurnalMap: Map<string, JurnalApkt>;
  search: string;
  onSearch: (v: string) => void;
  page: number;
  totalPages: number;
  totalRows: number;
  onPageChange: (p: number) => void;
  onRowClick: (row: PadamApktRecord) => void;
}

function DetailTab({ rows, jurnalMap, search, onSearch, page, totalPages, totalRows, onPageChange, onRowClick }: DetailTabProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-[#E2E8F0]">
        <div className="relative max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Cari penyulang, penyebab…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#E0F2F1] text-[#00695C] font-semibold text-xs">
              <th className="px-4 py-3 text-left whitespace-nowrap">No Laporan</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Tgl Padam</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Jam Padam</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Jam Nyala</th>
              <th className="px-4 py-3 text-left">ULP</th>
              <th className="px-4 py-3 text-left">Penyulang</th>
              <th className="px-3 py-3 text-right whitespace-nowrap">Lama (mnt)</th>
              <th className="px-4 py-3 text-left">Penyebab</th>
              <th className="px-3 py-3 text-center whitespace-nowrap">Status</th>
              <th className="px-4 py-3 text-left whitespace-nowrap">Section</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">ULP (Jurnal)</th>
              <th className="px-3 py-3 text-center whitespace-nowrap">Anomali Kode J</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const kode = r.no_laporan[0]?.toUpperCase();
              const jurnal = jurnalMap.get(normNoLaporan(r.no_laporan));
              const ulpApkt   = (r.ulp ?? "").replace(/^ULP\s+/i, "").trim().toUpperCase();
              const ulpJurnal = (jurnal?.ulp ?? "").replace(/^ULP\s+/i, "").trim().toUpperCase();
              const ulpMismatch = !!ulpApkt && !!ulpJurnal && ulpApkt !== ulpJurnal;
              return (
                <tr
                  key={r.id}
                  onClick={() => onRowClick(r)}
                  title={ulpMismatch ? `Beda ULP — APKT: ${r.ulp ?? "—"} · Jurnal: ${jurnal?.ulp ?? "—"}` : undefined}
                  className={`cursor-pointer transition-colors ${
                    ulpMismatch
                      ? "bg-amber-100 hover:bg-amber-200"
                      : `hover:bg-[#E0F2F1]/60 ${i % 2 === 0 ? "bg-white" : "bg-[#F4F6F8]"}`
                  }`}
                >
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`inline-block text-xs font-bold px-1.5 py-0.5 rounded mr-1.5 ${
                      kode === "J" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
                    }`}>
                      {kode}
                    </span>
                    <span className="text-xs font-mono text-[#5D6D7E]">{r.no_laporan}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[#1B2631] whitespace-nowrap">{fmtDate(r.tgl_padam)}</td>
                  <td className="px-3 py-2 text-xs text-[#5D6D7E]">{r.jam_padam?.slice(0, 5) ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-[#5D6D7E]">{r.jam_nyala?.slice(0, 5) ?? "—"}</td>
                  <td className="px-4 py-2 text-xs text-[#5D6D7E]">{r.ulp ?? "—"}</td>
                  <td className="px-4 py-2 font-medium text-[#1B2631]">{r.penyulang ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs text-[#1B2631]">
                    {r.lama_padam_jam != null ? Math.round(r.lama_padam_jam * 60).toLocaleString("id-ID") : "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#5D6D7E] max-w-[200px] truncate" title={r.penyebab_padam ?? ""}>
                    {r.penyebab_padam ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {r.status_gangguan === "murni" ? (
                      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-700">Murni</span>
                    ) : r.status_gangguan === "tidak_murni" ? (
                      <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Tdk Murni</span>
                    ) : (
                      <span className="inline-block text-xs text-[#94a3b8]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-[#5D6D7E] whitespace-nowrap">{jurnal?.section || "—"}</td>
                  <td className={`px-3 py-2 text-xs whitespace-nowrap ${
                    ulpMismatch ? "text-amber-800 font-semibold" : "text-[#5D6D7E]"
                  }`}>
                    {jurnal?.ulp || "—"}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-[#1B2631] whitespace-nowrap">{jurnal?.anomali_kode_j || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-[#E2E8F0] flex items-center justify-between text-xs text-[#5D6D7E]">
        <span>
          {totalRows} baris &nbsp;·&nbsp; halaman {page} / {totalPages}
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded border border-[#E2E8F0] hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded border border-[#E2E8F0] hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Kode J Dobel Tab ──────────────────────────────────────────────────────────

interface JDobelTabProps {
  groups: [string, PadamApktRecord[]][];
}

function JDobelTab({ groups }: JDobelTabProps) {
  if (groups.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] py-20 text-center text-[#5D6D7E] text-sm">
        {groups.length === 0
          ? "Tidak ada kode J yang dobel lintas ULP pada bulan ini"
          : null}
      </div>
    );
  }

  const totalRows = groups.reduce((sum, [, g]) => sum + g.length, 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
      <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center gap-4 text-sm">
        <span className="text-[#5D6D7E]">
          Ditemukan <span className="font-semibold text-orange-600">{groups.length}</span> No Laporan dobel
          &nbsp;·&nbsp;
          <span className="font-semibold text-[#1B2631]">{totalRows}</span> baris total
        </span>
        <span className="text-xs text-[#94a3b8]">
          {groups.length > 0
            ? "Kode J di atas muncul di lebih dari satu ULP"
            : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#E0F2F1] text-[#00695C] font-semibold text-xs">
              <th className="px-4 py-3 text-left whitespace-nowrap">No Laporan</th>
              <th className="px-4 py-3 text-left">ULP</th>
              <th className="px-4 py-3 text-left">Penyulang</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Tgl Padam</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Jam Padam</th>
              <th className="px-3 py-3 text-left whitespace-nowrap">Jam Nyala</th>
              <th className="px-3 py-3 text-right whitespace-nowrap">Pelanggan</th>
              <th className="px-3 py-3 text-right whitespace-nowrap">Lama (mnt)</th>
              <th className="px-3 py-3 text-right whitespace-nowrap">Jam×Plgn</th>
              <th className="px-3 py-3 text-right">ENS</th>
              <th className="px-4 py-3 text-left">Penyebab</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(([noLaporan, groupRows]) => (
              <>
                <tr key={`hdr-${noLaporan}`} className="bg-orange-50 border-t-2 border-orange-200">
                  <td colSpan={11} className="px-4 py-2">
                    <span className="inline-block bg-red-100 text-red-800 text-xs font-bold px-2 py-0.5 rounded mr-2">J</span>
                    <span className="font-mono text-xs font-semibold text-[#1B2631]">{noLaporan}</span>
                    <span className="ml-3 text-xs text-orange-600 font-medium">{groupRows.length} entri dobel</span>
                  </td>
                </tr>
                {groupRows.map((r, i) => (
                  <tr key={r.id} className={i % 2 === 0 ? "bg-white" : "bg-[#F4F6F8]"}>
                    <td className="px-4 py-2 text-xs text-[#94a3b8]">└</td>
                    <td className="px-4 py-2 text-xs text-[#5D6D7E]">{r.ulp ?? "—"}</td>
                    <td className="px-4 py-2 font-medium text-[#1B2631] text-sm">{r.penyulang ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-[#1B2631] whitespace-nowrap">{fmtDate(r.tgl_padam)}</td>
                    <td className="px-3 py-2 text-xs text-[#5D6D7E]">{r.jam_padam?.slice(0, 5) ?? "—"}</td>
                    <td className="px-3 py-2 text-xs text-[#5D6D7E]">{r.jam_nyala?.slice(0, 5) ?? "—"}</td>
                    <td className="px-3 py-2 text-right text-xs text-[#1B2631]">
                      {r.jml_pelanggan_padam?.toLocaleString("id-ID") ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-[#1B2631]">
                      {r.lama_padam_jam != null ? Math.round(r.lama_padam_jam * 60).toLocaleString("id-ID") : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-[#1B2631]">{fmtNum(r.jam_x_pelanggan_padam, 2)}</td>
                    <td className="px-3 py-2 text-right text-xs text-[#1B2631]">{fmtNum(r.ens, 4)}</td>
                    <td className="px-4 py-2 text-xs text-[#5D6D7E] max-w-[200px] truncate" title={r.penyebab_padam ?? ""}>
                      {r.penyebab_padam ?? "—"}
                    </td>
                  </tr>
                ))}
                <tr key={`sub-${noLaporan}`} className="bg-orange-50/60 text-xs text-orange-700 font-semibold border-b border-orange-200">
                  <td className="px-4 py-1.5" colSpan={6}>Subtotal</td>
                  <td className="px-3 py-1.5 text-right">
                    {groupRows.reduce((s, r) => s + (r.jml_pelanggan_padam ?? 0), 0).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {Math.round(groupRows.reduce((s, r) => s + (r.lama_padam_jam ?? 0), 0) * 60).toLocaleString("id-ID")}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {fmtNum(groupRows.reduce((s, r) => s + (r.jam_x_pelanggan_padam ?? 0), 0), 2)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {fmtNum(groupRows.reduce((s, r) => s + (r.ens ?? 0), 0), 4)}
                  </td>
                  <td className="px-4 py-1.5" />
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
