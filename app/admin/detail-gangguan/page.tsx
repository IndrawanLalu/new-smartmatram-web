"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Zap,
  Search,
  X,
  Download,
  Loader2,
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Database,
  Save,
  Terminal,
  Copy,
  Check,
  FileJson,
  Clock,
} from "lucide-react";
import KoreksiModal, { type KoreksiRow } from "./_components/KoreksiModal";
import RekapTab from "./_components/RekapTab";
import {
  STEPS,
  loadSettings,
  saveSettings,
} from "./_components/koreksiSettings";
import { Settings } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────────

interface GangguanRow {
  id?: number | string;
  apkt_id?: string;
  no_laporan?: string;
  pembuat_laporan?: string;
  waktu_lapor?: string;
  durasi_response_time?: number | null;
  durasi_recovery_time?: number | null;
  status_akhir?: string;
  nama_posko?: string;
  nama_pelapor?: string;
  alamat_pelapor?: string;
  penyebab?: string | null;
  tindakan?: string | null;
  kode_gangguan?: string | null;
  jenis_gangguan?: string | null;
  [key: string]: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const COLS: { key: keyof GangguanRow; label: string; numeric?: boolean }[] = [
  { key: "no_laporan", label: "No Laporan" },
  { key: "waktu_lapor", label: "Waktu Lapor" },
  { key: "jenis_gangguan", label: "Jenis" },
  { key: "kode_gangguan", label: "Kode" },
  { key: "penyebab", label: "Penyebab" },
  { key: "tindakan", label: "Tindakan" },
  { key: "durasi_response_time", label: "Response", numeric: true },
  { key: "durasi_recovery_time", label: "Recovery", numeric: true },
  { key: "status_akhir", label: "Status" },
  { key: "nama_pelapor", label: "Pelapor" },
  { key: "alamat_pelapor", label: "Alamat" },
  { key: "nama_posko", label: "Posko" },
];

const NUMERIC_KEYS = new Set(
  COLS.filter((c) => c.numeric).map((c) => c.key as string),
);

// Query GraphQL (1 baris) untuk dipakai di perintah console.
const GQL = `query ssdetailGangguan($dateFrom:Date!,$dateTo:Date!,$posko:[Int],$idUid:[Int],$idUp3:[Int],$idUlp:[Int],$idRegu:Int!,$media:String!,$namaRegional:String!,$isSelesai:Int!,$tanggal:String,$skip:Int,$take:Int,$requireTotalCount:Boolean,$sort:[SortInput],$filter:[FilterInput]){ssdetailGangguan(dateFrom:$dateFrom,dateTo:$dateTo,posko:$posko,idUid:$idUid,idUp3:$idUp3,idRegu:$idRegu,idUlp:$idUlp,namaRegional:$namaRegional,media:$media,isSelesai:$isSelesai,tanggal:$tanggal,skip:$skip,take:$take,requireTotalCount:$requireTotalCount,sort:$sort,filter:$filter){totalCount data{id no_laporan pembuat_laporan waktu_lapor waktu_response waktu_recovery durasi_dispatch_time durasi_response_time durasi_recovery_time durasi_perjalanan_time status_akhir is_marking referensi_marking idpel_nometer nama_pelapor alamat_pelapor no_telp_pelapor keterangan_pelapor media nama_posko jarak_closing dispatch_oleh diselesaikan_oleh penyebab tindakan kode_gangguan jenis_gangguan ket_batal batal_by ket_marking}}}`;

function buildSnippet(from: string, to: string): string {
  const vars = {
    skip: 0,
    take: 5000,
    requireTotalCount: true,
    dateFrom: from,
    dateTo: to,
    posko: [441501],
    idUid: [44],
    idUp3: [441],
    idUlp: [44150],
    idRegu: 0,
    namaRegional: "REGIONAL SULMAPANA",
    media: "",
    isSelesai: 0,
    tanggal: "",
  };
  return `fetch("https://new-apktservice.pln.co.id:32183/graphql",{method:"POST",headers:{accept:"application/json","content-type":"application/json"},body:JSON.stringify({query:${JSON.stringify(GQL)},variables:${JSON.stringify(vars)}})}).then(r=>r.json()).then(d=>{const a=d.data.ssdetailGangguan.data;window.apktData=JSON.stringify(a);console.log("✅ "+a.length+" baris siap. Sekarang ketik:  copy(apktData)  lalu Enter, lalu paste di Smart.");}).catch(e=>console.error(e));`;
}

function extractRows(text: string): {
  rows: GangguanRow[];
  error: string | null;
} {
  if (!text.trim()) return { rows: [], error: null };
  let p: unknown;
  try {
    p = JSON.parse(text);
  } catch (e) {
    return { rows: [], error: (e as Error).message };
  }
  let arr: unknown = p;
  if (!Array.isArray(arr)) {
    const o = p as Record<string, unknown>;
    arr =
      (o?.data as { ssdetailGangguan?: { data?: unknown } })?.ssdetailGangguan
        ?.data ??
      (o?.ssdetailGangguan as { data?: unknown })?.data ??
      o?.data ??
      o?.rows ??
      null;
  }
  if (!Array.isArray(arr))
    return {
      rows: [],
      error:
        "Tidak menemukan array data. Tempel hasil ssdetailGangguan.data atau seluruh respons JSON.",
    };
  return { rows: arr as GangguanRow[], error: null };
}

// ── Klasifikasi Non CT (Fase A) ─────────────────────────────────────────────────
// "CT" = periksa meter/CT → DIBUANG. "Non CT" = perlu dikoreksi waktunya.
const CT_KODE = ["99112", "99113", "13500", "99111", "11522", "99110"];
const CT_TINDAKAN = ["tamper", "temper", "ct"];

function classifyCt(row: GangguanRow): {
  isCT: boolean;
  reason: string | null;
} {
  const ket = String(row.keterangan_pelapor ?? "").toLowerCase();
  if (ket.includes("periksa") || ket.includes("priksa"))
    return { isCT: true, reason: "Pengaduan periksa meter" };
  const tind = String(row.tindakan ?? "").toLowerCase();
  const hitT = CT_TINDAKAN.find((t) => tind.includes(t));
  if (hitT) return { isCT: true, reason: `Tindakan "${hitT}"` };
  const kode = String(row.kode_gangguan ?? "").trim();
  if (CT_KODE.includes(kode)) return { isCT: true, reason: `Kode ${kode}` };
  return { isCT: false, reason: null };
}

type FilterMode = "non" | "ct" | "all";

// Durasi APKT dalam DETIK → "2j 9m" / "9m 18d". (7758 dtk = 2:09:18)
function fmtDurSec(sec: number): string {
  if (!Number.isFinite(sec)) return "—";
  const t = Math.max(0, Math.round(sec));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h}j`);
  if (m) parts.push(`${m}m`);
  if (s && !h) parts.push(`${s}d`); // detik hanya bila < 1 jam
  return parts.length ? parts.join(" ") : "0d";
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DetailGangguanPage() {
  const [dateFrom, setDateFrom] = useState(firstOfMonthStr());
  const [dateTo, setDateTo] = useState(todayStr());
  const [tab, setTab] = useState<"data" | "rekap">("data");

  const [showCmd, setShowCmd] = useState(false);
  const [copied, setCopied] = useState(false);

  // Pengaturan default koreksi (durasi + korektor)
  const [showSettings, setShowSettings] = useState(false);
  const [setDurs, setSetDurs] = useState<number[]>(STEPS.map((s) => s.def));
  const [setKorektor, setSetKorektor] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setSetDurs(s.durs);
    setSetKorektor(s.korektor);
  }, []);

  function handleSaveSettings() {
    saveSettings({
      durs: setDurs.map((n) => Number(n) || 0),
      korektor: setKorektor.trim(),
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);

  const [rows, setRows] = useState<GangguanRow[]>([]);
  const [koreksiMap, setKoreksiMap] = useState<Map<string, KoreksiRow>>(
    new Map(),
  );
  const [selectedRow, setSelectedRow] = useState<GangguanRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("non");
  const [sortKey, setSortKey] = useState<string>("durasi_response_time");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const { rows: parsed, error: parseErr } = useMemo(
    () => extractRows(input),
    [input],
  );
  const snippet = useMemo(
    () => buildSnippet(dateFrom, dateTo),
    [dateFrom, dateTo],
  );

  async function loadSaved() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/apkt/gangguan?from=${dateFrom}&to=${dateTo}`,
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data.rows)) setRows(data.rows);
    } catch {
      /* tabel mungkin belum dibuat */
    } finally {
      setLoading(false);
    }
  }

  async function loadKoreksi() {
    try {
      const res = await fetch("/api/apkt/koreksi");
      const data = await res.json();
      if (res.ok && Array.isArray(data.rows)) {
        const m = new Map<string, KoreksiRow>();
        data.rows.forEach((r: KoreksiRow) => m.set(r.no_laporan, r));
        setKoreksiMap(m);
      }
    } catch {
      /* tabel koreksi mungkin belum dibuat */
    }
  }

  // Muat data tersimpan saat halaman dibuka.
  useEffect(() => {
    loadSaved();
    loadKoreksi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* abaikan */
    }
  }

  async function handleSave() {
    if (parsed.length === 0 || parseErr) return;
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);
    try {
      const res = await fetch("/api/apkt/gangguan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveErr(
          `${data.error ?? "Gagal menyimpan"}${data.hint ? " — " + data.hint : ""}`,
        );
        return;
      }
      setSaveMsg(
        `${data.saved} laporan tersimpan${data.deduped ? ` (${data.deduped} duplikat dilewati)` : ""}`,
      );
      setInput("");
      await loadSaved();
    } catch (e) {
      setSaveErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const classified = useMemo(
    () => rows.map((r) => ({ row: r, ct: classifyCt(r) })),
    [rows],
  );
  const counts = useMemo(() => {
    let ct = 0;
    for (const c of classified) if (c.ct.isCT) ct++;
    return { all: classified.length, ct, non: classified.length - ct };
  }, [classified]);

  const nonRows = useMemo(
    () => classified.filter((c) => !c.ct.isCT).map((c) => c.row),
    [classified],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = classified.filter(({ row, ct }) => {
      if (filterMode === "non" && ct.isCT) return false;
      if (filterMode === "ct" && !ct.isCT) return false;
      if (
        q &&
        !COLS.some((c) =>
          String(row[c.key] ?? "")
            .toLowerCase()
            .includes(q),
        )
      )
        return false;
      return true;
    });
    const numeric = NUMERIC_KEYS.has(sortKey);
    list.sort((a, b) => {
      const av = a.row[sortKey];
      const bv = b.row[sortKey];
      const diff = numeric
        ? (Number(av) || 0) - (Number(bv) || 0)
        : String(av ?? "").localeCompare(String(bv ?? ""));
      return sortDir === "asc" ? diff : -diff;
    });
    return list;
  }, [classified, search, filterMode, sortKey, sortDir]);

  function handleDownloadCsv() {
    if (filtered.length === 0) return;
    const header = ["Kategori", ...COLS.map((c) => c.label)].join(";");
    const lines = filtered.map(({ row, ct }) =>
      [
        `"${ct.isCT ? "CT" : "Non CT"}"`,
        ...COLS.map((c) => `"${String(row[c.key] ?? "").replace(/"/g, '""')}"`),
      ].join(";"),
    );
    const csv = [header, ...lines].join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `gangguan-ampenan-${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#F4F6F8] p-6 space-y-4">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold">
              Detail Gangguan APKT — Ampenan
            </h1>
            <p className="text-sm text-white/75 mt-0.5">
              Jalankan perintah di console APKT → paste JSON di sini → simpan ke
              database
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2">
        <TabBtn active={tab === "data"} onClick={() => setTab("data")}>Data &amp; Koreksi</TabBtn>
        <TabBtn active={tab === "rekap"} onClick={() => setTab("rekap")}>Rekap</TabBtn>
      </div>

      {tab === "rekap" && <RekapTab rows={nonRows} koreksiMap={koreksiMap} />}

      {tab === "data" && (
      <>
      {/* Tanggal + perintah console */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Dari tanggal">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
          </Field>
          <Field label="Sampai tanggal">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
          </Field>
          <button
            onClick={loadSaved}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 border border-[#E2E8F0] text-[#00897B] text-sm font-semibold rounded-lg hover:border-[#00897B] disabled:opacity-60 transition-colors"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Muat dari DB
          </button>
        </div>

        {/* Perintah console */}
        <div>
          <button
            onClick={() => setShowCmd((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold text-[#00897B] hover:text-[#00695C] transition-colors"
          >
            <ChevronDown
              size={12}
              className={`transition-transform ${showCmd ? "" : "-rotate-90"}`}
            />
            <Terminal size={12} /> Perintah Console (untuk tanggal {dateFrom}{" "}
            s/d {dateTo})
          </button>
          {showCmd && (
            <div className="mt-2 space-y-2">
              <ol className="text-[11px] text-[#64748b] list-decimal list-inside space-y-0.5">
                <li>
                  Login & buka situs APKT, lalu buka <b>DevTools → Console</b>.
                </li>
                <li>
                  Klik <b>Salin Perintah</b>, paste di console, tekan{" "}
                  <b>Enter</b>.
                </li>
                <li>
                  Tunggu sampai muncul{" "}
                  <span className="font-mono text-[#00897B]">
                    ✅ N baris siap
                  </span>
                  , lalu ketik{" "}
                  <span className="font-mono text-[#00897B]">
                    copy(apktData)
                  </span>{" "}
                  + Enter (menyalin ke clipboard).
                </li>
                <li>
                  Kembali ke sini, paste di kotak bawah, klik{" "}
                  <b>Simpan ke Database</b>.
                </li>
              </ol>
              <div className="relative">
                <pre className="bg-[#0d1b2a] text-[#e2e8f0] text-[10px] font-mono rounded-lg p-3 pr-24 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                  {snippet}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 bg-[#00897B] hover:bg-[#00695C] text-white text-[11px] font-semibold rounded transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={12} /> Tersalin
                    </>
                  ) : (
                    <>
                      <Copy size={12} /> Salin Perintah
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Pengaturan default koreksi */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="flex items-center gap-1 text-sm font-semibold text-[#1B2631] hover:text-[#00897B] transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${showSettings ? "" : "-rotate-90"}`}
          />
          <Settings size={14} className="text-[#00897B]" /> Pengaturan Default
          Koreksi
          <span className="text-xs font-normal text-[#94a3b8] ml-1">
            (durasi & korektor dipakai otomatis di modal)
          </span>
        </button>
        {showSettings && (
          <div className="mt-3 space-y-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <label className="flex-1 text-xs text-[#1B2631]">
                    {s.label}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={setDurs[i] ?? 0}
                    onChange={(e) =>
                      setSetDurs((prev) =>
                        prev.map((v, idx) =>
                          idx === i
                            ? e.target.value === ""
                              ? 0
                              : Number(e.target.value)
                            : v,
                        ),
                      )
                    }
                    className="w-20 border border-[#E2E8F0] rounded-lg px-2 py-1 text-sm text-right text-[#1B2631] bg-white focus:outline-none focus:border-[#00897B]"
                  />
                  <span className="text-[10px] text-[#94a3b8] w-7">mnt</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-2 border-t border-[#E2E8F0]">
              <label className="text-xs text-[#64748b]">
                Korektor default:
              </label>
              <input
                value={setKorektor}
                onChange={(e) => setSetKorektor(e.target.value)}
                placeholder="Nama korektor"
                className="w-44 border border-[#E2E8F0] rounded-lg px-2 py-1 text-sm text-[#1B2631] bg-white placeholder-[#94a3b8] focus:outline-none focus:border-[#00897B]"
              />
              <button
                onClick={handleSaveSettings}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 bg-[#00897B] hover:bg-[#00695C] text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {settingsSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Tersimpan
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" /> Simpan Pengaturan
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Paste JSON */}
      <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-[#00897B]" />
            <span className="text-sm font-semibold text-[#1B2631]">
              Paste JSON dari Console
            </span>
            {parsed.length > 0 && (
              <span className="text-xs text-emerald-600">
                ✓ {parsed.length} baris terdeteksi
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {parsed.length > 0 && !parseErr && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00897B] hover:bg-[#00695C] disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? "Menyimpan..." : "Simpan ke Database"}
              </button>
            )}
            {input && (
              <button
                onClick={() => setInput("")}
                className="p-1 rounded-lg text-[#94a3b8] hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder='Tempel array JSON di sini, mis. [ { "id": ..., "no_laporan": "G...", ... }, ... ]'
          rows={4}
          className="w-full bg-[#0d1b2a] border border-[#1e3552] rounded-lg p-3 font-mono text-xs text-[#e2e8f0] placeholder-[#334155] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 resize-y"
          spellCheck={false}
        />

        {parseErr && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <p className="text-[11px] text-red-600 font-mono">{parseErr}</p>
          </div>
        )}
        {saveErr && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <p className="text-[11px] text-red-600">{saveErr}</p>
          </div>
        )}
        {saveMsg && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg">
            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <p className="text-[11px] text-emerald-700">{saveMsg}</p>
          </div>
        )}
      </div>

      {/* Tabel data tersimpan */}
      {rows.length > 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E2E8F0] flex-wrap">
            <CalendarDays className="w-4 h-4 text-[#00897B] shrink-0" />
            <span className="text-sm font-semibold text-[#1B2631]">
              {rows.length} tersimpan · {dateFrom} s/d {dateTo}
            </span>

            {/* Toggle Non CT / CT / Semua */}
            <div className="flex items-center gap-1">
              <FilterBtn
                active={filterMode === "non"}
                onClick={() => setFilterMode("non")}
                cls="bg-emerald-600 border-emerald-600"
              >
                Non CT · {counts.non}
              </FilterBtn>
              <FilterBtn
                active={filterMode === "ct"}
                onClick={() => setFilterMode("ct")}
                cls="bg-gray-500 border-gray-500"
              >
                CT · {counts.ct}
              </FilterBtn>
              <FilterBtn
                active={filterMode === "all"}
                onClick={() => setFilterMode("all")}
                cls="bg-[#00897B] border-[#00897B]"
              >
                Semua · {counts.all}
              </FilterBtn>
            </div>

            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#94a3b8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari..."
                className="pl-8 pr-3 py-1.5 text-xs border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-[#00897B] w-48 text-[#1B2631] placeholder-[#94a3b8]"
              />
            </div>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="p-1 rounded text-[#94a3b8] hover:text-[#1B2631]"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-[#E2E8F0] text-[#64748b] hover:text-[#00897B] hover:border-[#00897B] transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>

          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] w-8">
                    #
                  </th>
                  <th className="py-2.5 px-3 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] whitespace-nowrap">
                    Kategori
                  </th>
                  {COLS.map((c) => (
                    <th
                      key={c.key as string}
                      onClick={() => handleSort(c.key as string)}
                      className="py-2.5 px-2 text-left bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] cursor-pointer hover:bg-[#b2dfdb] transition-colors select-none"
                    >
                      <div className="flex items-center gap-1">
                        <span>{c.label}</span>
                        {sortKey === (c.key as string) ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="w-3 h-3 text-[#00897B]" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-[#00897B]" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-[#b2dfdb]" />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="py-2.5 px-3 text-right bg-[#E0F2F1] text-[#00695C] font-semibold border-b border-[#E2E8F0] whitespace-nowrap">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ row, ct }, i) => (
                  <tr
                    key={row.apkt_id ?? row.id ?? i}
                    className="border-t border-[#E2E8F0] hover:bg-[#F4F6F8] transition-colors"
                  >
                    <td className="py-2 px-3 text-[#94a3b8] text-right tabular-nums">
                      {i + 1}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {ct.isCT ? (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-500"
                          title={ct.reason ?? ""}
                        >
                          CT
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700">
                          Non CT
                        </span>
                      )}
                    </td>
                    {COLS.map((c) => {
                      const v = row[c.key];
                      return (
                        <td
                          key={c.key as string}
                          className={`py-2 px-2 align-top break-words ${c.numeric ? "text-right tabular-nums whitespace-nowrap" : ""}`}
                        >
                          {v === null || v === undefined || v === "" ? (
                            <span className="text-[#C7D2DA] italic">—</span>
                          ) : c.numeric && Number.isFinite(Number(v)) ? (
                            <span className="text-[#1B2631]">
                              {String(v)}
                              <span className="text-[10px] text-[#94a3b8] ml-1">
                                ({fmtDurSec(Number(v))})
                              </span>
                            </span>
                          ) : (
                            <span className="text-[#1B2631]">{String(v)}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 whitespace-nowrap text-right">
                      {(() => {
                        const done = koreksiMap.has(
                          String(row.no_laporan ?? ""),
                        );
                        return (
                          <button
                            onClick={() => setSelectedRow(row)}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                              done
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                : "bg-[#00897B] text-white hover:bg-[#00695C]"
                            }`}
                          >
                            {done ? (
                              <>
                                <Check size={11} /> Dikoreksi
                              </>
                            ) : (
                              <>
                                <Clock size={11} /> Koreksi
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !loading && (
          <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] py-16 flex flex-col items-center gap-3 text-[#94a3b8]">
            <Zap className="w-10 h-10 opacity-30" />
            <p className="text-sm font-medium">
              Belum ada data tersimpan untuk rentang ini
            </p>
            <p className="text-xs opacity-70">
              Salin perintah console di atas, jalankan, lalu paste hasilnya
            </p>
          </div>
        )
      )}
      </>
      )}

      {selectedRow && (
        <KoreksiModal
          row={selectedRow}
          existing={
            koreksiMap.get(String(selectedRow.no_laporan ?? "")) ?? null
          }
          onClose={() => setSelectedRow(null)}
          onSaved={loadKoreksi}
        />
      )}
    </div>
  );
}

function TabBtn({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
        active ? "bg-[#00897B] text-white shadow-sm" : "bg-white text-[#64748b] border border-[#E2E8F0] hover:text-[#00897B]"
      }`}>
      {children}
    </button>
  );
}

function FilterBtn({
  active,
  onClick,
  cls,
  children,
}: {
  active: boolean;
  onClick: () => void;
  cls: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
        active
          ? `${cls} text-white`
          : "bg-white border-[#E2E8F0] text-[#64748b] hover:border-[#00897B] hover:text-[#00897B]"
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-[#64748b]">{label}</span>
      {children}
    </div>
  );
}
