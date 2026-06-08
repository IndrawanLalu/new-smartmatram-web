"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Wrench, FileJson, X, Search, Save,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Users, List, AlertCircle, CalendarDays, Loader2, Download, TriangleAlert,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface YantekRow {
  personil_yantek?: string;
  pembuat_laporan?: string;
  rating?: number | null;
  no_laporan?: string;
  nama_posko?: string;
  nama_regu?: string;
  waktu_lapor?: string;
  waktu_perjalanan?: string | null;
  waktu_nyala_sementara?: string | null;
  waktu_selesai?: string | null;
  durasi_menit_response?: number | null;
  durasi_menit_recovery?: number | null;
  status_akhir?: string;
  fasilitas?: string | null;
  penyebab?: string | null;
  tindakan?: string;
  jml_pelanggan_padam?: number;
  waktu_nyala?: string | null;
  [key: string]: unknown;
}

interface DateSummary {
  date: string;
  label: string;
  count: number;
  savedAt: number | null;
}

interface PetugasStat {
  petugas: string;
  totalWO: number;
  adaRating: number;
  r: [number, number, number, number, number, number];
  avgRating: number | null;
}

type SortDir = "asc" | "desc";
type Tab     = "rekap" | "warning" | "detail" | "database";

// ── Constants ─────────────────────────────────────────────────────────────────

const STAR_BG: string[] = [
  "#fef2f2","#fff7ed","#fffbeb","#fefce8","#f7fee7","#f0fdf4",
];
const STAR_TEXT: string[] = [
  "text-red-600","text-orange-500","text-amber-600",
  "text-yellow-600","text-lime-700","text-emerald-700",
];

const DETAIL_COLS: (keyof YantekRow)[] = [
  "no_laporan","personil_yantek","nama_regu","waktu_lapor",
  "waktu_nyala","durasi_menit_response","durasi_menit_recovery",
  "rating","status_akhir","fasilitas","penyebab","tindakan",
  "nama_posko","jml_pelanggan_padam",
];

const MONTHS_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

const POSKO_MAP: { kode: string; label: string }[] = [
  { kode: "44150", label: "AMPENAN" },
  { kode: "44110", label: "CAKRA" },
  { kode: "44130", label: "TANJUNG" },
  { kode: "44170", label: "GERUNG" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractNama(raw: string): string {
  const idx = raw.indexOf("_");
  return idx >= 0 ? raw.slice(idx + 1).trim() : raw.trim();
}

function extractPrefix(raw: string): string {
  const idx = raw.indexOf("_");
  return idx >= 0 ? raw.slice(0, idx).trim() : "";
}

function toDateStr(waktu: string): string {
  const parts = waktu.split(" ")[0].split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return waktu;
}

function fmtDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d)} ${MONTHS_ID[parseInt(m) - 1]} ${y}`;
}

function parseInput(raw: string): { rows: YantekRow[]; error: string | null } {
  if (!raw.trim()) return { rows: [], error: null };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed))
      return { rows: [], error: "Data harus berupa array JSON ([ { ... }, ... ])" };
    return { rows: parsed as YantekRow[], error: null };
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  }
}

function buildStats(rows: YantekRow[]): PetugasStat[] {
  const map = new Map<string, PetugasStat>();
  for (const row of rows) {
    const nama = extractNama(row.personil_yantek ?? "—");
    if (!map.has(nama)) {
      map.set(nama, { petugas: nama, totalWO: 0, adaRating: 0, r: [0,0,0,0,0,0], avgRating: null });
    }
    const s = map.get(nama)!;
    s.totalWO++;
    const rv = row.rating;
    if (rv !== null && rv !== undefined) {
      s.adaRating++;
      s.r[Math.min(Math.max(Math.round(Number(rv)), 0), 5)]++;
    }
  }
  for (const s of map.values()) {
    if (s.adaRating > 0)
      s.avgRating = s.r.reduce((acc, cnt, star) => acc + cnt * star, 0) / s.adaRating;
  }
  return [...map.values()].sort((a, b) => b.totalWO - a.totalWO);
}

// ── Th helper ─────────────────────────────────────────────────────────────────

function Th({ label, k, sortKey, sortDir, onSort, center }: {
  label: string; k: string; sortKey: string; sortDir: SortDir;
  onSort: (k: string) => void; center?: boolean;
}) {
  return (
    <th
      onClick={() => onSort(k)}
      className="py-2.5 px-3 bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] cursor-pointer hover:bg-[#b2dfdb] transition-colors whitespace-nowrap select-none"
    >
      <div className={`flex items-center gap-1 ${center ? "justify-center" : ""}`}>
        <span>{label}</span>
        {sortKey === k
          ? sortDir === "asc" ? <ChevronUp className="w-3 h-3 text-[#00897B]" /> : <ChevronDown className="w-3 h-3 text-[#00897B]" />
          : <ChevronsUpDown className="w-3 h-3 text-[#b2dfdb]" />}
      </div>
    </th>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const PLACEHOLDER = `[ { "personil_yantek": "44150_NAMA", "rating": 5, "no_laporan": "G...", "waktu_lapor": "29/05/2026 10:00:00" }, ... ]`;

export default function YantekPage() {
  const [input, setInput]         = useState("");
  const [dates, setDates]         = useState<DateSummary[]>([]);
  const [rowCache, setRowCache]   = useState<Record<string, YantekRow[]>>({});
  const [filterYear, setFilterYear]   = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterPosko, setFilterPosko] = useState<string | null>(null);
  const [tab, setTab]             = useState<Tab>("rekap");
  const [search, setSearch]       = useState("");
  const [sortKey, setSortKey]     = useState("totalWO");
  const [sortDir, setSortDir]     = useState<SortDir>("desc");
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { rows: inputRows, error } = useMemo(() => parseInput(input), [input]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const loadAllIntoCache = useCallback(async () => {
    const res  = await fetch("/api/yantek?all=true");
    const data = await res.json() as { rows: YantekRow[] };
    const grouped: Record<string, YantekRow[]> = {};
    for (const row of data.rows) {
      const d = row.waktu_lapor ? toDateStr(row.waktu_lapor) : "unknown";
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(row);
    }
    return grouped;
  }, []);

  const refreshDates = useCallback(async () => {
    const res  = await fetch("/api/yantek");
    const data = await res.json() as DateSummary[];
    setDates(data);
    return data;
  }, []);

  // ── Init: load all data ────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const dateList = await refreshDates();
        if (dateList.length > 0) {
          const grouped = await loadAllIntoCache();
          setRowCache(grouped);
          // Default ke bulan terbaru yang ada datanya
          const latestDate = dateList.map(d => d.date).sort().pop()!;
          const [y, m] = latestDate.split("-");
          setFilterYear(y);
          setFilterMonth(m);
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [refreshDates, loadAllIntoCache]);

  // ── Derived: tahun & bulan yang tersedia dari data ────────────────────────

  const availableYears = useMemo(() => {
    const years = new Set(dates.map(d => d.date.slice(0, 4)));
    return [...years].sort().reverse();
  }, [dates]);

  const availableMonths = useMemo(() => {
    const months = new Set(
      dates.filter(d => !filterYear || d.date.startsWith(filterYear)).map(d => d.date.slice(5, 7))
    );
    return [...months].sort();
  }, [dates, filterYear]);

  // ── Active rows (filtered by tahun + bulan) ───────────────────────────────

  const activeRows = useMemo(() => {
    const allRows = dates.flatMap(d => rowCache[d.date] ?? []);
    return allRows.filter(row => {
      if (!row.waktu_lapor) return true;
      const d = toDateStr(row.waktu_lapor);
      if (filterYear  && !d.startsWith(filterYear))  return false;
      if (filterMonth && d.slice(5, 7) !== filterMonth) return false;
      return true;
    });
  }, [dates, rowCache, filterYear, filterMonth]);

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (inputRows.length === 0 || error) return;
    setSaving(true); setSaveError(null);
    const grouped: Record<string, YantekRow[]> = {};
    for (const row of inputRows) {
      const d = row.waktu_lapor ? toDateStr(row.waktu_lapor) : "unknown";
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(row);
    }
    try {
      for (const [date, rows] of Object.entries(grouped)) {
        const label = date !== "unknown" ? fmtDateLabel(date) : "Data manual";
        const res   = await fetch("/api/yantek", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, label, rows }),
        });
        if (!res.ok) throw new Error(`Gagal menyimpan ${date}`);
      }
      setInput("");
      const [, grouped2] = await Promise.all([refreshDates(), loadAllIntoCache()]);
      setRowCache(grouped2);
      // Arahkan filter ke bulan data yang baru disimpan
      const savedDates = Object.keys(grouped).sort();
      const latest = savedDates[savedDates.length - 1];
      if (latest) {
        setFilterYear(latest.slice(0, 4));
        setFilterMonth(latest.slice(5, 7));
      }
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(date: string) {
    await fetch(`/api/yantek?date=${date}`, { method: "DELETE" });
    setRowCache(prev => { const n = { ...prev }; delete n[date]; return n; });
    await refreshDates();
  }

  // ── Download PDF ──────────────────────────────────────────────────────────

  async function handleDownloadPdf() {
    if (stats.length === 0) return;
    setPdfLoading(true);
    try {
      const [{ pdf }, { default: YantekPdfDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./_YantekPdf"),
      ]);

      const poskoLabel = filterPosko
        ? `ULP ${POSKO_MAP.find(p => p.kode === filterPosko)?.label ?? filterPosko}`
        : "Semua ULP";
      const dateLabel = filterMonth && filterYear
        ? `${MONTHS_ID[parseInt(filterMonth) - 1]} ${filterYear}`
        : filterYear || "Semua Data";

      const pdfStats = [...stats].sort((a, b) => b.r[5] - a.r[5]);

      const element = (
        <YantekPdfDoc
          stats={pdfStats}
          grandTotal={grandTotal}
          dateLabel={dateLabel}
          filterLabel={poskoLabel}
        />
      );

      const blob = await pdf(element).toBlob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `yantek${filterPosko ? `-${filterPosko}` : ""}-${filterYear}-${filterMonth}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  }

  // ── Filter by posko prefix ────────────────────────────────────────────────

  const poskoRows = useMemo(() => {
    if (!filterPosko) return activeRows;
    return activeRows.filter(row => extractPrefix(row.personil_yantek ?? "") === filterPosko);
  }, [activeRows, filterPosko]);

  // Count per posko for badge labels
  const poskoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of activeRows) {
      const kode = extractPrefix(row.personil_yantek ?? "");
      counts[kode] = (counts[kode] ?? 0) + 1;
    }
    return counts;
  }, [activeRows]);

  // ── Low-rating rows (★1 & ★2) ─────────────────────────────────────────────

  const lowRatingRows = useMemo(
    () => poskoRows.filter(r => r.rating === 1 || r.rating === 2),
    [poskoRows],
  );

  // ── Stats ─────────────────────────────────────────────────────────────────

  const stats = useMemo(() => buildStats(poskoRows), [poskoRows]);

  const filteredStats = useMemo(() => {
    let s = search.trim()
      ? stats.filter(x => x.petugas.toLowerCase().includes(search.toLowerCase()))
      : [...stats];
    s.sort((a, b) => {
      let diff = 0;
      if (sortKey === "petugas")    diff = a.petugas.localeCompare(b.petugas);
      else if (sortKey === "avgRating") diff = (a.avgRating ?? -1) - (b.avgRating ?? -1);
      else if (sortKey.startsWith("r") && sortKey.length === 2)
        diff = a.r[parseInt(sortKey[1])] - b.r[parseInt(sortKey[1])];
      else diff =
        ((a as unknown as Record<string,number>)[sortKey] ?? 0) -
        ((b as unknown as Record<string,number>)[sortKey] ?? 0);
      return sortDir === "asc" ? diff : -diff;
    });
    return s;
  }, [stats, search, sortKey, sortDir]);

  function handleSort(k: string) {
    if (sortKey !== k) { setSortKey(k); setSortDir("desc"); return; }
    setSortDir(d => d === "desc" ? "asc" : "desc");
  }

  const inputDates = useMemo(
    () => [...new Set(inputRows.flatMap(r => r.waktu_lapor ? [toDateStr(r.waktu_lapor)] : []))].sort(),
    [inputRows],
  );
  const saveBtnLabel = inputDates.length === 1
    ? `Simpan ${fmtDateLabel(inputDates[0])}`
    : inputDates.length > 1 ? `Simpan ${inputDates.length} tanggal` : "Simpan";

  const canSave = inputRows.length > 0 && !error;

  // Grand total for footer
  const grandTotal = useMemo(() => {
    const totalWO    = stats.reduce((a, s) => a + s.totalWO, 0);
    const rTotals    = [0,1,2,3,4,5].map(i => stats.reduce((a, s) => a + s.r[i], 0));
    const adaRating  = stats.reduce((a, s) => a + s.adaRating, 0);
    const sumStars   = rTotals.reduce((a, cnt, i) => a + cnt * i, 0);
    const avgRating  = adaRating > 0 ? sumStars / adaRating : null;
    return { totalWO, rTotals, avgRating };
  }, [stats]);

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 space-y-4">

      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg shrink-0"><Wrench className="w-5 h-5" /></div>
            <div>
              <h1 className="text-xl font-bold">Analisis Yantek</h1>
              <p className="text-sm text-white/75 mt-0.5">
                Rekap WO &amp; rating petugas · data disimpan di server (VPS)
              </p>
            </div>
          </div>
          {dates.length > 0 && (
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-emerald-200">
                {dates.reduce((a, d) => a + d.count, 0)} WO · {dates.length} tanggal tersimpan
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Input Panel */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-[#00897B]" />
            <span className="text-sm font-semibold text-[#1B2631]">Paste JSON Baru</span>
            {canSave && (
              <span className="text-xs text-emerald-600">
                ✓ {inputRows.length} baris
                {inputDates.length === 1 ? ` — ${fmtDateLabel(inputDates[0])}` : ` — ${inputDates.length} tanggal`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canSave && (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00897B] hover:bg-[#00695C] disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Menyimpan..." : saveBtnLabel}
              </button>
            )}
            {input && (
              <button onClick={() => setInput("")} className="p-1 rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={4}
          className="w-full bg-[#0d1b2a] border border-[#1e3552] rounded-lg p-3 font-mono text-xs text-[#e2e8f0] placeholder-[#334155] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 resize-y"
          spellCheck={false}
        />

        {saveError && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <p className="text-[11px] text-red-600">{saveError}</p>
          </div>
        )}
        {error && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <p className="text-[11px] text-red-600 font-mono">{error}</p>
          </div>
        )}
      </div>

      {/* Filter Tahun + Bulan + ULP */}
      {dates.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 space-y-3">
          {/* Tahun & Bulan */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-[#64748b] shrink-0 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-[#00897B]" /> Periode:
            </span>
            <select
              value={filterYear}
              onChange={e => { setFilterYear(e.target.value); setFilterMonth(""); }}
              className="text-xs border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            >
              <option value="">Semua Tahun</option>
              {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={filterMonth}
              onChange={e => setFilterMonth(e.target.value)}
              className="text-xs border border-[#E2E8F0] rounded-lg px-2.5 py-1.5 text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
              disabled={!filterYear}
            >
              <option value="">Semua Bulan</option>
              {availableMonths.map(m => (
                <option key={m} value={m}>{MONTHS_ID[parseInt(m) - 1]}</option>
              ))}
            </select>
            {poskoRows.length > 0 && (
              <span className="text-xs text-[#94a3b8] ml-1">
                {poskoRows.length} WO · {stats.length} petugas
              </span>
            )}
          </div>

          {/* Filter ULP */}
          <div className="flex items-center gap-2 flex-wrap border-t border-[#E2E8F0] pt-3">
            <span className="text-xs font-semibold text-[#64748b] shrink-0">Filter ULP:</span>
            <button
              onClick={() => setFilterPosko(null)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                filterPosko === null
                  ? "bg-[#004D40] text-white"
                  : "bg-[#E0F2F1] text-[#00695C] hover:bg-[#00897B] hover:text-white"
              }`}
            >
              Semua
            </button>
            {POSKO_MAP.map(({ kode, label }) => {
              const cnt = poskoCounts[kode] ?? 0;
              return (
                <button
                  key={kode}
                  onClick={() => setFilterPosko(kode === filterPosko ? null : kode)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    filterPosko === kode
                      ? "bg-[#00897B] text-white"
                      : "bg-[#E0F2F1] text-[#00695C] hover:bg-[#00897B] hover:text-white"
                  }`}
                >
                  {label}
                  {cnt > 0 && <span className="opacity-70">{cnt}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-[#94a3b8]">
          <Loader2 className="w-5 h-5 animate-spin text-[#00897B]" />
          <span className="text-sm">Memuat data...</span>
        </div>
      )}

      {/* Main Content */}
      {!loading && dates.length > 0 && (
        <>
          {/* Tabs + Download */}
          <div className="flex items-center gap-2">
            <button onClick={() => setTab("rekap")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === "rekap" ? "bg-[#00897B] text-white shadow-sm" : "bg-white text-[#64748b] hover:text-[#00897B] border border-[#E2E8F0]"
              }`}
            >
              <Users className="w-4 h-4" /> Rekap Petugas
            </button>
            <button onClick={() => setTab("warning")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === "warning"
                  ? "bg-red-600 text-white shadow-sm"
                  : "bg-white text-[#64748b] hover:text-red-600 hover:border-red-300 border border-[#E2E8F0]"
              }`}
            >
              <TriangleAlert className="w-4 h-4" />
              Rating ★1 &amp; ★2
              {lowRatingRows.length > 0 && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  tab === "warning" ? "bg-white/25 text-white" : "bg-red-100 text-red-600"
                }`}>
                  {lowRatingRows.length}
                </span>
              )}
            </button>
            <button onClick={() => setTab("detail")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === "detail" ? "bg-[#00897B] text-white shadow-sm" : "bg-white text-[#64748b] hover:text-[#00897B] border border-[#E2E8F0]"
              }`}
            >
              <List className="w-4 h-4" /> Data Detail
            </button>
            <button onClick={() => setTab("database")}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                tab === "database" ? "bg-[#00897B] text-white shadow-sm" : "bg-white text-[#64748b] hover:text-[#00897B] border border-[#E2E8F0]"
              }`}
            >
              <FileJson className="w-4 h-4" /> Database
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${tab === "database" ? "bg-white/25 text-white" : "bg-[#E0F2F1] text-[#00695C]"}`}>
                {dates.length}
              </span>
            </button>
            <button
              onClick={handleDownloadPdf}
              disabled={pdfLoading || stats.length === 0}
              className="ml-auto flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-[#E2E8F0] text-[#64748b] hover:text-[#00897B] hover:border-[#00897B] disabled:opacity-50 transition-colors"
            >
              {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {pdfLoading ? "Membuat PDF..." : "Download PDF"}
            </button>
          </div>

          {tab === "rekap" && (
            <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
              {/* Search bar */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0]">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Cari nama petugas..."
                    className="pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#00897B] w-52 text-[#1B2631] placeholder-[#94a3b8]"
                  />
                </div>
                {search && (
                  <button onClick={() => setSearch("")} className="p-1 rounded text-[#94a3b8] hover:text-[#1B2631]">
                    <X className="w-3 h-3" />
                  </button>
                )}
                <span className="text-xs text-[#94a3b8] ml-auto">{filteredStats.length} petugas</span>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] w-8">#</th>
                      <Th label="Nama Petugas" k="petugas"   {...{sortKey,sortDir,onSort:handleSort}} />
                      <Th label="Total WO"     k="totalWO"  {...{sortKey,sortDir,onSort:handleSort}} center />
                      {[1,2,3,4,5].map(s => (
                        <Th key={s} label={`★${s}`} k={`r${s}`} {...{sortKey,sortDir,onSort:handleSort}} center />
                      ))}
                      <Th label="Avg ★" k="avgRating" {...{sortKey,sortDir,onSort:handleSort}} center />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStats.map((s, i) => {
                      const isWarn = s.r[1] > 0 || s.r[2] > 0;
                      return (
                        <tr key={s.petugas} className={`border-t border-[#E2E8F0] transition-colors ${isWarn ? "bg-red-50 hover:bg-red-100/70" : "hover:bg-[#F4F6F8]"}`}>
                          <td className="py-2.5 px-3 text-[#94a3b8] text-right tabular-nums">{i + 1}</td>
                          <td className={`py-2.5 px-3 font-semibold whitespace-nowrap ${isWarn ? "text-red-700" : "text-[#1B2631]"}`}>{s.petugas}</td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-[#1B2631]">{s.totalWO}</td>
                          {[1,2,3,4,5].map(si => {
                            const cnt = s.r[si];
                            const pct = s.totalWO > 0 ? (cnt / s.totalWO) * 100 : 0;
                            return (
                              <td key={si} className="py-2 px-2 text-center">
                                {cnt > 0 ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <span className={`inline-block min-w-5.5 px-1.5 py-0.5 rounded font-bold text-[11px] ${STAR_TEXT[si]}`} style={{ backgroundColor: STAR_BG[si] }}>{cnt}</span>
                                    <span className="text-[10px] text-[#94a3b8] tabular-nums">{pct.toFixed(0)}%</span>
                                  </div>
                                ) : <span className="text-[#E2E8F0]">—</span>}
                              </td>
                            );
                          })}
                          <td className="py-2.5 px-3 text-center">
                            {s.avgRating !== null
                              ? <span className={`font-bold text-sm ${s.avgRating>=4.5?"text-emerald-600":s.avgRating>=3.5?"text-lime-600":s.avgRating>=2.5?"text-amber-600":"text-red-600"}`}>
                                  {s.avgRating.toFixed(2)}
                                </span>
                              : <span className="text-[#94a3b8]">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Grand total footer */}
              <div className="border-t-2 border-[#E2E8F0] px-4 py-2.5 flex items-center gap-6 text-xs text-[#64748b] bg-[#F4F6F8] flex-wrap">
                <span className="font-bold text-[#1B2631]">Total</span>
                <span>
                  <span className="font-bold text-[#1B2631] tabular-nums">{grandTotal.totalWO}</span>
                  <span className="text-[#94a3b8] ml-1">WO</span>
                </span>
                {[1,2,3,4,5].map(si => {
                  const cnt = grandTotal.rTotals[si];
                  const pct = grandTotal.totalWO > 0 ? (cnt / grandTotal.totalWO) * 100 : 0;
                  return cnt > 0 ? (
                    <span key={si} className="flex items-center gap-1">
                      <span className={`font-bold tabular-nums ${STAR_TEXT[si]}`}>{cnt}</span>
                      <span className="text-[#94a3b8]">★{si}</span>
                      <span className="text-[#b2c0cc] text-[10px]">({pct.toFixed(0)}%)</span>
                    </span>
                  ) : null;
                })}
                {grandTotal.avgRating !== null && (
                  <span className="ml-auto">
                    Avg: <span className="font-bold text-[#1B2631]">{grandTotal.avgRating.toFixed(2)}</span> ★
                  </span>
                )}
              </div>
            </div>
          )}

          {tab === "warning" && <LowRatingTab rows={lowRatingRows} />}

          {tab === "detail" && <DetailTable rows={poskoRows} />}

          {tab === "database" && (
            <DatabaseTab
              dates={dates}
              rowCache={rowCache}
              filterYear={filterYear}
              filterMonth={filterMonth}
              onDelete={handleDelete}
              onSelectMonth={(y, m) => { setFilterYear(y); setFilterMonth(m); setTab("rekap"); }}
            />
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && dates.length === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] py-16 flex flex-col items-center gap-3 text-[#94a3b8]">
          <Wrench className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">Tempel data JSON lalu klik Simpan</p>
          <p className="text-xs opacity-70">Data tersimpan sebagai file di server VPS · tidak hilang walau refresh</p>
        </div>
      )}
    </div>
  );
}

// ── Database Tab ─────────────────────────────────────────────────────────────

interface DatabaseTabProps {
  dates: DateSummary[];
  rowCache: Record<string, YantekRow[]>;
  filterYear: string;
  filterMonth: string;
  onDelete: (date: string) => Promise<void>;
  onSelectMonth: (year: string, month: string) => void;
}

const DAY_NAME = ["Min","Sen","Sel","Rab","Kam","Jum","Sab"];

function DatabaseTab({ dates, rowCache, filterYear, filterMonth, onDelete, onSelectMonth }: DatabaseTabProps) {
  const [deletingDate, setDeletingDate] = useState<string | null>(null);

  // Kelompokkan dates per tahun-bulan
  const byMonth = useMemo(() => {
    const map = new Map<string, DateSummary[]>();
    for (const d of dates) {
      const key = d.date.slice(0, 7); // YYYY-MM
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [dates]);

  // Filter sesuai filterYear + filterMonth
  const visibleMonths = useMemo(() => {
    return byMonth.filter(([key]) => {
      const [y, m] = key.split("-");
      if (filterYear && y !== filterYear) return false;
      if (filterMonth && m !== filterMonth) return false;
      return true;
    });
  }, [byMonth, filterYear, filterMonth]);

  if (dates.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E2E8F0] py-14 flex flex-col items-center gap-3 text-[#94a3b8]">
        <FileJson className="w-10 h-10 opacity-20" />
        <p className="text-sm font-medium">Belum ada data tersimpan</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {visibleMonths.length === 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] py-10 flex items-center justify-center text-[#94a3b8] text-sm">
          Tidak ada data untuk periode yang dipilih
        </div>
      )}

      {visibleMonths.map(([monthKey, monthDates]) => {
        const [y, m] = monthKey.split("-");
        const monthLabel = `${MONTHS_ID[parseInt(m) - 1]} ${y}`;
        const totalWO = monthDates.reduce((a, d) => a + d.count, 0);

        return (
          <div key={monthKey} className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
            {/* Month header */}
            <div className="flex items-center justify-between px-4 py-3 bg-[#E0F2F1] border-b border-[#b2dfdb]">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#00695C]" />
                <span className="text-sm font-bold text-[#004D40]">{monthLabel}</span>
                <span className="text-xs text-[#00897B] font-medium">{monthDates.length} tanggal · {totalWO} WO</span>
              </div>
              <button
                onClick={() => onSelectMonth(y, m)}
                className="text-xs px-2.5 py-1 rounded-lg bg-[#00897B] text-white hover:bg-[#00695C] transition-colors font-semibold"
              >
                Lihat Rekap →
              </button>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F4F6F8]">
                    <th className="py-2 px-3 text-left text-[#64748b] font-semibold border-b border-[#E2E8F0] w-8">#</th>
                    <th className="py-2 px-3 text-left text-[#64748b] font-semibold border-b border-[#E2E8F0]">Tanggal</th>
                    <th className="py-2 px-3 text-left text-[#64748b] font-semibold border-b border-[#E2E8F0]">Hari</th>
                    <th className="py-2 px-3 text-center text-[#64748b] font-semibold border-b border-[#E2E8F0]">Jumlah WO</th>
                    <th className="py-2 px-3 text-left text-[#64748b] font-semibold border-b border-[#E2E8F0]">Disimpan</th>
                    <th className="py-2 px-3 text-center text-[#64748b] font-semibold border-b border-[#E2E8F0]">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {[...monthDates].sort((a, b) => a.date.localeCompare(b.date)).map((d, i) => {
                    const [dy, dm, dd] = d.date.split("-");
                    const dayName = DAY_NAME[new Date(`${dy}-${dm}-${dd}`).getDay()];
                    const savedAt = d.savedAt ? new Date(d.savedAt) : null;
                    const rows = rowCache[d.date] ?? [];
                    const avgRating = rows.length > 0
                      ? (() => {
                          const rated = rows.filter(r => r.rating != null);
                          if (!rated.length) return null;
                          return rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length;
                        })()
                      : null;

                    return (
                      <tr key={d.date} className={`border-t border-[#E2E8F0] ${i % 2 === 0 ? "bg-white" : "bg-[#F4F6F8]/50"} hover:bg-[#E0F2F1]/30 transition-colors`}>
                        <td className="py-2.5 px-3 text-[#94a3b8] text-right tabular-nums">{i + 1}</td>
                        <td className="py-2.5 px-3 font-semibold text-[#1B2631] whitespace-nowrap">
                          {dd}/{dm}/{dy}
                        </td>
                        <td className="py-2.5 px-3 text-[#64748b]">{dayName}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-bold text-[#1B2631] tabular-nums">{d.count}</span>
                          <span className="text-[#94a3b8] ml-1">WO</span>
                        </td>
                        <td className="py-2.5 px-3 text-[#94a3b8] whitespace-nowrap">
                          {savedAt
                            ? `${savedAt.toLocaleDateString("id-ID", { day:"2-digit", month:"short" })} ${savedAt.toLocaleTimeString("id-ID", { hour:"2-digit", minute:"2-digit" })}`
                            : "—"}
                          {avgRating !== null && (
                            <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${avgRating >= 4.5 ? "bg-emerald-50 text-emerald-600" : avgRating >= 3.5 ? "bg-lime-50 text-lime-700" : avgRating >= 2.5 ? "bg-amber-50 text-amber-600" : "bg-red-50 text-red-600"}`}>
                              ★ {avgRating.toFixed(1)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            onClick={async () => {
                              if (!confirm(`Hapus data ${d.label}?`)) return;
                              setDeletingDate(d.date);
                              await onDelete(d.date);
                              setDeletingDate(null);
                            }}
                            disabled={deletingDate === d.date}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors text-[11px]"
                          >
                            {deletingDate === d.date
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <X className="w-3 h-3" />}
                            Hapus
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#E2E8F0] bg-[#F4F6F8]">
                    <td colSpan={3} className="py-2 px-3 text-xs font-bold text-[#64748b]">Total {monthLabel}</td>
                    <td className="py-2 px-3 text-center text-xs font-bold text-[#1B2631]">{totalWO} WO</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Low Rating Tab (★1 & ★2) ─────────────────────────────────────────────────

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

function parseWaktu(s: string): Date {
  const [date, time] = s.split(" ");
  const [d, m, y] = date.split("/");
  return new Date(`${y}-${m}-${d}T${time}`);
}

function calcDurasiNyalaSmt(row: YantekRow): string | null {
  const nyala = row.waktu_nyala_sementara;
  const lapor = row.waktu_lapor;
  if (!nyala || !lapor) return null;
  try {
    const diffMins = Math.round((parseWaktu(nyala).getTime() - parseWaktu(lapor).getTime()) / 60000);
    return diffMins >= 0 ? String(diffMins) : null;
  } catch { return null; }
}

interface PerPetugasLow { nama: string; r1: number; r2: number; total: number }

function LowRatingTab({ rows }: { rows: YantekRow[] }) {
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
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] py-14 flex flex-col items-center gap-3 text-[#94a3b8]">
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
          <p className="text-xs text-[#94a3b8] mb-1">Rating ★1</p>
          <p className="text-2xl font-bold text-red-600">{r1Count}</p>
          <p className="text-[11px] text-[#94a3b8] mt-0.5">WO</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-orange-100 p-4">
          <p className="text-xs text-[#94a3b8] mb-1">Rating ★2</p>
          <p className="text-2xl font-bold text-orange-500">{r2Count}</p>
          <p className="text-[11px] text-[#94a3b8] mt-0.5">WO</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
          <p className="text-xs text-[#94a3b8] mb-1">Petugas Terdampak</p>
          <p className="text-2xl font-bold text-[#1B2631]">{perPetugas.length}</p>
          <p className="text-[11px] text-[#94a3b8] mt-0.5">petugas</p>
        </div>
      </div>

      {/* Per-petugas summary */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E2E8F0]">
          <p className="text-xs font-semibold text-[#1B2631]">Rekap per Petugas</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="py-2 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] w-8">#</th>
                <th className="py-2 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0]">Nama Petugas</th>
                <th className="py-2 px-3 text-center bg-red-50 text-red-600 font-semibold border-b border-[#E2E8F0]">★1</th>
                <th className="py-2 px-3 text-center bg-orange-50 text-orange-500 font-semibold border-b border-[#E2E8F0]">★2</th>
                <th className="py-2 px-3 text-center bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0]">Total</th>
              </tr>
            </thead>
            <tbody>
              {perPetugas.map((p, i) => (
                <tr key={p.nama} className="border-t border-[#E2E8F0] hover:bg-red-50/40 transition-colors">
                  <td className="py-2 px-3 text-[#94a3b8] text-right tabular-nums">{i + 1}</td>
                  <td className="py-2 px-3 font-semibold text-red-700">{p.nama}</td>
                  <td className="py-2 px-3 text-center">
                    {p.r1 > 0
                      ? <span className="inline-block px-2 py-0.5 rounded bg-red-50 text-red-600 font-bold">{p.r1}</span>
                      : <span className="text-[#E2E8F0]">—</span>}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {p.r2 > 0
                      ? <span className="inline-block px-2 py-0.5 rounded bg-orange-50 text-orange-500 font-bold">{p.r2}</span>
                      : <span className="text-[#E2E8F0]">—</span>}
                  </td>
                  <td className="py-2 px-3 text-center font-bold text-[#1B2631]">{p.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail all rows */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0]">
          <p className="text-xs font-semibold text-[#1B2631]">Detail Semua WO Rating Rendah</p>
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari..."
              className="pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#00897B] w-48 text-[#1B2631] placeholder-[#94a3b8]" />
          </div>
          {search && <button onClick={() => setSearch("")} className="p-1 rounded text-[#94a3b8] hover:text-[#1B2631]"><X className="w-3 h-3" /></button>}
          <span className="text-xs text-[#94a3b8]">{sortedRows.length} WO</span>
        </div>
        <div className="overflow-auto max-h-[55vh]">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="py-2 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] w-8">#</th>
                <th className="py-2 px-3 text-center bg-red-50 text-red-600 font-semibold border-b border-[#E2E8F0]">Rating</th>
                {LOW_COLS.map(c => (
                  <th key={c} className="py-2 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] whitespace-nowrap">
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
                    <td className="py-2 px-3 text-[#94a3b8] text-right tabular-nums">{i + 1}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${isR1 ? "bg-red-100 text-red-600" : "bg-orange-100 text-orange-500"}`}>★{rv}</span>
                    </td>
                    {LOW_COLS.map(c => {
                      if (c === "durasi_nyala_sementara") {
                        return (
                          <td key={c} className="py-2 px-3 text-center tabular-nums">
                            {durasiNyala
                              ? <span className="font-mono text-[#1B2631]">{durasiNyala}</span>
                              : <span className="text-[#C7D2DA] italic text-[11px]">—</span>}
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
                            ? <span className="text-[#C7D2DA] italic text-[11px]">—</span>
                            : <span className="text-[#1B2631]">{String(val)}</span>}
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

// ── Detail Table ──────────────────────────────────────────────────────────────

function DetailTable({ rows }: { rows: YantekRow[] }) {
  const [search, setSearch] = useState("");
  const cols = DETAIL_COLS.filter(c => rows.some(r => r[c] !== undefined));

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => cols.some(c => String(r[c] ?? "").toLowerCase().includes(q)));
  }, [rows, cols, search]);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari..."
            className="pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#00897B] w-52 text-[#1B2631] placeholder-[#94a3b8]" />
        </div>
        {search && <button onClick={() => setSearch("")} className="p-1 rounded text-[#94a3b8] hover:text-[#1B2631]"><X className="w-3 h-3" /></button>}
        <span className="text-xs text-[#94a3b8] ml-auto">{filtered.length} baris</span>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="py-2.5 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] w-8">#</th>
              {cols.map(c => (
                <th key={c as string} className="py-2.5 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] whitespace-nowrap">
                  {c as string}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, i) => (
              <tr key={i} className="border-t border-[#E2E8F0] hover:bg-[#F4F6F8] transition-colors">
                <td className="py-2 px-3 text-[#94a3b8] text-right tabular-nums">{i + 1}</td>
                {cols.map(c => (
                  <td key={c as string} className="py-2 px-3 whitespace-nowrap">
                    {c === "rating"
                      ? row.rating !== null && row.rating !== undefined
                        ? <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${STAR_TEXT[Math.min(Math.max(Number(row.rating),0),5)]}`} style={{backgroundColor:STAR_BG[Math.min(Math.max(Number(row.rating),0),5)]}}>★ {row.rating}</span>
                        : <span className="text-[#C7D2DA] italic text-[11px]">—</span>
                      : row[c] === null || row[c] === undefined
                        ? <span className="text-[#C7D2DA] italic text-[11px]">—</span>
                        : <span className="text-[#1B2631]">{String(row[c])}</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
