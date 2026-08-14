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
  Settings,
  LayoutDashboard,
  ListChecks,
  Table2,
} from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import KoreksiModal from "./_components/KoreksiModal";
import RekapTab from "./_components/RekapTab";
import DashboardTab from "./_components/DashboardTab";
import {
  STEPS,
  loadSettings,
  saveSettings,
} from "./_components/koreksiSettings";
import {
  classifyCt,
  fmtDurSec,
  KATEGORI_LABEL as KATEGORI,
  type FilterMode,
  type GangguanRow,
  type KoreksiRow,
} from "./_lib/gangguan";

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

/** Sel kepala tabel — dipakai belasan kali di satu tabel. */
const TH =
  "py-2.5 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line";

type Tab = "data" | "dashboard" | "rekap";

const TABS: { key: Tab; label: string; icon: typeof Table2 }[] = [
  { key: "data", label: "Data & Koreksi", icon: Table2 },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "rekap", label: "Rekap Koreksi", icon: ListChecks },
];

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
  const [tab, setTab] = useState<Tab>("data");

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
  /** Rentang yang benar-benar sedang dimuat — bukan isi kotak tanggal. Grafik
   *  memakai ini supaya sumbunya tidak bergeser saat tanggal diubah tapi
   *  tombol "Muat dari DB" belum ditekan. */
  const [range, setRange] = useState({ from: firstOfMonthStr(), to: todayStr() });
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
      if (res.ok && Array.isArray(data.rows)) {
        setRows(data.rows);
        setRange({ from: dateFrom, to: dateTo });
      }
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
    a.download = `gangguan-ampenan-${range.from}_${range.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    // Judul halaman ada di topbar (PageTitle), jadi halaman ini langsung isi.
    <div className="space-y-3 text-ink">
      {/* Rentang tanggal — berlaku untuk seluruh tab, termasuk Dashboard */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Dari tanggal">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={FIELD}
            />
          </Field>
          <Field label="Sampai tanggal">
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={FIELD}
            />
          </Field>
          <button onClick={loadSaved} disabled={loading} className={BTN_GHOST}>
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Muat dari DB
          </button>
          {rows.length > 0 && (
            <span className="text-xs text-ink-muted ml-auto">
              {rows.length} laporan tersimpan · {range.from} s/d {range.to}
            </span>
          )}
        </div>

        {/* Perintah console — hanya relevan saat menarik data baru */}
        {tab === "data" && (
          <div className="border-t border-line pt-3">
            <button
              onClick={() => setShowCmd((v) => !v)}
              className="flex items-center gap-1 text-xs font-semibold text-navy-600 hover:text-navy-500 transition-colors"
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
                <ol className="text-[11px] text-ink-soft list-decimal list-inside space-y-0.5">
                  <li>
                    Login & buka situs APKT, lalu buka <b>DevTools → Console</b>.
                  </li>
                  <li>
                    Klik <b>Salin Perintah</b>, paste di console, tekan{" "}
                    <b>Enter</b>.
                  </li>
                  <li>
                    Tunggu sampai muncul{" "}
                    <span className="font-mono text-navy-600">
                      ✅ N baris siap
                    </span>
                    , lalu ketik{" "}
                    <span className="font-mono text-navy-600">
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
                  <pre className="bg-navy-900 text-[#e2e8f0] text-[10px] font-mono rounded-xl p-3 pr-24 overflow-x-auto whitespace-pre-wrap break-all max-h-32">
                    {snippet}
                  </pre>
                  <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 flex items-center gap-1 px-2.5 py-1 bg-navy-600 hover:bg-navy-500 text-white text-[11px] font-semibold rounded-lg transition-colors"
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
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`${CHIP} ${tab === key ? CHIP_ON : CHIP_OFF}`}
          >
            <Icon className="w-3.5 h-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === "dashboard" && (
        <DashboardTab
          items={classified}
          koreksiMap={koreksiMap}
          dateFrom={range.from}
          dateTo={range.to}
          mode={filterMode}
          counts={counts}
          onMode={setFilterMode}
        />
      )}

      {tab === "rekap" && <RekapTab rows={nonRows} koreksiMap={koreksiMap} />}

      {tab === "data" && (
      <>
      {/* Pengaturan default koreksi */}
      <div className={`${CARD} p-4`}>
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="flex items-center gap-1.5 text-sm font-semibold text-ink hover:text-navy-600 transition-colors"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${showSettings ? "" : "-rotate-90"}`}
          />
          <Settings size={14} className="text-navy-600" /> Pengaturan Default
          Koreksi
          <span className="text-xs font-normal text-ink-muted ml-1">
            (durasi & korektor dipakai otomatis di modal)
          </span>
        </button>
        {showSettings && (
          <div className="mt-3 space-y-3">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {STEPS.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2">
                  <label className="flex-1 text-xs text-ink">{s.label}</label>
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
                    className={`${FIELD} w-20 text-right`}
                  />
                  <span className="text-[10px] text-ink-muted w-7">mnt</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3 pt-3 border-t border-line">
              <label className="text-xs text-ink-soft">Korektor default:</label>
              <input
                value={setKorektor}
                onChange={(e) => setSetKorektor(e.target.value)}
                placeholder="Nama korektor"
                className={`${FIELD} w-44`}
              />
              <button onClick={handleSaveSettings} className={`${BTN_PRIMARY} ml-auto`}>
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
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-navy-600" />
            <span className="text-sm font-semibold text-ink">
              Paste JSON dari Console
            </span>
            {parsed.length > 0 && (
              <span className="text-xs text-green-700">
                ✓ {parsed.length} baris terdeteksi
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {parsed.length > 0 && !parseErr && (
              <button onClick={handleSave} disabled={saving} className={BTN_PRIMARY}>
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
                className="p-1 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors"
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
          className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 resize-y"
          spellCheck={false}
        />

        {parseErr && <Peringatan nada="merah" mono>{parseErr}</Peringatan>}
        {saveErr && <Peringatan nada="merah">{saveErr}</Peringatan>}
        {saveMsg && <Peringatan nada="hijau">{saveMsg}</Peringatan>}
      </div>

      {/* Tabel data tersimpan */}
      {rows.length > 0 ? (
        <div className={`${CARD} overflow-hidden`}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line flex-wrap">
            <CalendarDays className="w-4 h-4 text-navy-600 shrink-0" />
            <span className="text-sm font-semibold text-ink mr-1">
              {rows.length} tersimpan · {range.from} s/d {range.to}
            </span>

            {/* Toggle Non CT / CT / Semua — state yang sama dengan tab Dashboard */}
            {KATEGORI.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilterMode(key)}
                className={`${CHIP} ${filterMode === key ? CHIP_ON : CHIP_OFF}`}
              >
                {label}
                <span className="opacity-70">
                  {key === "non" ? counts.non : key === "ct" ? counts.ct : counts.all}
                </span>
              </button>
            ))}

            <div className="relative ml-auto">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari..."
                className="h-8 w-48 pl-8 pr-3 rounded-xl border border-line bg-white text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 transition-colors"
              />
            </div>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="p-1 rounded-lg text-ink-muted hover:text-ink hover:bg-surface transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            <button onClick={handleDownloadCsv} className={BTN_GHOST}>
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          </div>

          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className={`${TH} w-8`}>#</th>
                  <th className={`${TH} whitespace-nowrap`}>Kategori</th>
                  {COLS.map((c) => (
                    <th
                      key={c.key as string}
                      onClick={() => handleSort(c.key as string)}
                      className={`${TH} px-2 cursor-pointer hover:bg-navy-100 transition-colors select-none`}
                    >
                      <div className="flex items-center gap-1">
                        <span>{c.label}</span>
                        {sortKey === (c.key as string) ? (
                          sortDir === "asc" ? (
                            <ChevronUp className="w-3 h-3 text-navy-600" />
                          ) : (
                            <ChevronDown className="w-3 h-3 text-navy-600" />
                          )
                        ) : (
                          <ChevronsUpDown className="w-3 h-3 text-navy-300" />
                        )}
                      </div>
                    </th>
                  ))}
                  <th className={`${TH} text-right whitespace-nowrap`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(({ row, ct }, i) => (
                  <tr
                    key={row.apkt_id ?? row.id ?? i}
                    className="border-t border-line hover:bg-surface transition-colors"
                  >
                    <td className="py-2 px-3 text-ink-muted text-right tabular-nums">
                      {i + 1}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      {/* Navy vs abu, bukan hijau vs abu: hijau dikunci untuk
                          status, sedangkan ini kategori. */}
                      {ct.isCT ? (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-surface text-ink-muted"
                          title={ct.reason ?? ""}
                        >
                          CT
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-navy-50 text-navy-600">
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
                            <span className="text-ink-muted italic">—</span>
                          ) : c.numeric && Number.isFinite(Number(v)) ? (
                            <span className="text-ink">
                              {String(v)}
                              <span className="text-[10px] text-ink-muted ml-1">
                                ({fmtDurSec(Number(v))})
                              </span>
                            </span>
                          ) : (
                            <span className="text-ink">{String(v)}</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 px-3 whitespace-nowrap text-right">
                      {(() => {
                        const done = koreksiMap.has(String(row.no_laporan ?? ""));
                        return (
                          <button
                            onClick={() => setSelectedRow(row)}
                            className={`inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                              done
                                ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                                : "bg-navy-600 text-white hover:bg-navy-500"
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
          <div className={`${CARD} py-16 flex flex-col items-center gap-3 text-ink-muted`}>
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

/** Bilah pesan di bawah kotak paste — merah untuk gagal, hijau untuk berhasil. */
function Peringatan({
  nada,
  mono,
  children,
}: {
  nada: "merah" | "hijau";
  mono?: boolean;
  children: React.ReactNode;
}) {
  const merah = nada === "merah";
  return (
    <div
      className={`mt-2 flex items-center gap-2 px-3 py-2 rounded-xl border ${
        merah ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
      }`}
    >
      {merah ? (
        <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
      ) : (
        <Check className="w-3.5 h-3.5 text-green-700 shrink-0" />
      )}
      <p className={`text-[11px] ${merah ? "text-red-700" : "text-green-700"} ${mono ? "font-mono" : ""}`}>
        {children}
      </p>
    </div>
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
      <span className="text-xs font-semibold text-ink-soft">{label}</span>
      {children}
    </div>
  );
}
