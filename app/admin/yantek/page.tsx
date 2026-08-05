"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Wrench, FileJson, X, Save, Users, List, AlertCircle, CalendarDays,
  Loader2, Download, TriangleAlert, Timer,
} from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canManageSettings, canSeeAllUnits } from "@/lib/roles";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import {
  buildDurasiPerPetugas, buildStats, durasiSah, extractPrefix, fmtDateLabel,
  hariDalamBulan, jumlahHariBerdata, median, medianPerHari, MONTHS_ID, parseInput,
  POSKO_MAP, toDateStr,
  type DateSummary, type Tab, type YantekRow,
} from "./_lib/yantek";
import { useYantekSla } from "./_hooks/useYantekSla";
import RekapTab from "./_components/RekapTab";
import SlaTab from "./_components/SlaTab";
import LowRatingTab from "./_components/LowRatingTab";
import DetailTable from "./_components/DetailTable";
import DatabaseTab from "./_components/DatabaseTab";
import KonsolPanel from "./_components/KonsolPanel";
import SlaSettingsModal from "./_components/SlaSettingsModal";

const PLACEHOLDER = `[ { "personil_yantek": "44150_NAMA", "rating": 5, "no_laporan": "G...", "waktu_lapor": "29/05/2026 10:00:00" }, ... ]`;

/** "2026-05" → "2026-04". Dipakai untuk garis pembanding di tab SLA. */
function bulanSebelumnya(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function YantekPage() {
  const user = useCurrentUser();

  const [input, setInput] = useState("");
  const [dates, setDates] = useState<DateSummary[]>([]);
  const [rowCache, setRowCache] = useState<Record<string, YantekRow[]>>({});
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterPosko, setFilterPosko] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sla");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [aturSla, setAturSla] = useState(false);

  const { rows: inputRows, error } = useMemo(() => parseInput(input), [input]);

  /** ULP efektif untuk ambang SLA — mengikuti filter posko kalau dipilih,
   *  kalau tidak jatuh ke unit user (UP3 tanpa filter = ambang 'ALL'). */
  const ulpAktif = useMemo(() => {
    if (filterPosko) return POSKO_MAP.find((p) => p.kode === filterPosko)?.ulp ?? null;
    return canSeeAllUnits(user.role) ? null : user.unit;
  }, [filterPosko, user]);

  const { sla, rows: slaRows, saving: slaSaving, simpan: simpanSla } = useYantekSla(ulpAktif);

  // ── Muat data ─────────────────────────────────────────────────────────────

  const loadAllIntoCache = useCallback(async () => {
    const res = await fetch("/api/yantek?all=true");
    const data = (await res.json()) as { rows: YantekRow[] };
    const grouped: Record<string, YantekRow[]> = {};
    for (const row of data.rows) {
      const d = row.waktu_lapor ? toDateStr(row.waktu_lapor) : "unknown";
      if (!grouped[d]) grouped[d] = [];
      grouped[d].push(row);
    }
    return grouped;
  }, []);

  const refreshDates = useCallback(async () => {
    const res = await fetch("/api/yantek");
    const data = (await res.json()) as DateSummary[];
    setDates(data);
    return data;
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const dateList = await refreshDates();
        if (dateList.length > 0) {
          setRowCache(await loadAllIntoCache());
          const latestDate = dateList.map((d) => d.date).sort().pop()!;
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

  // ── Turunan ───────────────────────────────────────────────────────────────

  const availableYears = useMemo(
    () => [...new Set(dates.map((d) => d.date.slice(0, 4)))].sort().reverse(),
    [dates],
  );

  const availableMonths = useMemo(
    () => [...new Set(
      dates.filter((d) => !filterYear || d.date.startsWith(filterYear)).map((d) => d.date.slice(5, 7)),
    )].sort(),
    [dates, filterYear],
  );

  const activeRows = useMemo(() => {
    const allRows = dates.flatMap((d) => rowCache[d.date] ?? []);
    return allRows.filter((row) => {
      if (!row.waktu_lapor) return true;
      const d = toDateStr(row.waktu_lapor);
      if (filterYear && !d.startsWith(filterYear)) return false;
      if (filterMonth && d.slice(5, 7) !== filterMonth) return false;
      return true;
    });
  }, [dates, rowCache, filterYear, filterMonth]);

  const cocokPosko = useCallback(
    (row: YantekRow) => !filterPosko || extractPrefix(row.personil_yantek ?? "") === filterPosko,
    [filterPosko],
  );

  const poskoRows = useMemo(() => activeRows.filter(cocokPosko), [activeRows, cocokPosko]);

  /** Baris bulan sebelumnya, filter posko sama — hanya untuk garis pembanding. */
  const bulanKey = filterYear && filterMonth ? `${filterYear}-${filterMonth}` : "";
  const rowsBulanLalu = useMemo(() => {
    if (!bulanKey) return [];
    const prev = bulanSebelumnya(bulanKey);
    return dates
      .filter((d) => d.date.startsWith(prev))
      .flatMap((d) => rowCache[d.date] ?? [])
      .filter(cocokPosko);
  }, [bulanKey, dates, rowCache, cocokPosko]);

  const poskoCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of activeRows) {
      const kode = extractPrefix(row.personil_yantek ?? "");
      counts[kode] = (counts[kode] ?? 0) + 1;
    }
    return counts;
  }, [activeRows]);

  const lowRatingRows = useMemo(
    () => poskoRows.filter((r) => r.rating === 1 || r.rating === 2),
    [poskoRows],
  );

  const stats = useMemo(() => buildStats(poskoRows), [poskoRows]);

  const grandTotal = useMemo(() => {
    const totalWO = stats.reduce((a, s) => a + s.totalWO, 0);
    const rTotals = [0, 1, 2, 3, 4, 5].map((i) => stats.reduce((a, s) => a + s.r[i], 0));
    const adaRating = stats.reduce((a, s) => a + s.adaRating, 0);
    const sumStars = rTotals.reduce((a, cnt, i) => a + cnt * i, 0);
    return { totalWO, rTotals, avgRating: adaRating > 0 ? sumStars / adaRating : null };
  }, [stats]);

  /** Ringkasan & grafik untuk PDF — dihitung dari baris yang sedang tampil,
   *  memakai helper yang sama dengan tab SLA supaya angkanya tidak berbeda. */
  const ringkasPdf = useMemo(() => {
    const resp = durasiSah(poskoRows, "durasi_menit_response");
    const reco = durasiSah(poskoRows, "durasi_menit_recovery");
    return {
      medRpt: median(resp),
      medRct: median(reco),
      patuhRpt: resp.length ? (resp.filter((v) => v <= sla.response).length / resp.length) * 100 : 0,
      patuhRct: reco.length ? (reco.filter((v) => v <= sla.recovery).length / reco.length) * 100 : 0,
    };
  }, [poskoRows, sla]);

  const chartPdf = useMemo(() => {
    if (!bulanKey) return [];
    const jumlahHari = hariDalamBulan(bulanKey);
    const rptMap = medianPerHari(poskoRows, "durasi_menit_response", jumlahHari);
    const rctMap = medianPerHari(poskoRows, "durasi_menit_recovery", jumlahHari);
    return Array.from({ length: jumlahHari }, (_, i) => ({
      label: String(i + 1),
      rpt: rptMap.get(i + 1) ?? null,
      rct: rctMap.get(i + 1) ?? null,
    }));
  }, [poskoRows, bulanKey]);

  // ── Aksi ──────────────────────────────────────────────────────────────────

  const inputDates = useMemo(
    () => [...new Set(inputRows.flatMap((r) => (r.waktu_lapor ? [toDateStr(r.waktu_lapor)] : [])))].sort(),
    [inputRows],
  );
  const canSave = inputRows.length > 0 && !error;
  const saveBtnLabel = inputDates.length === 1
    ? `Simpan ${fmtDateLabel(inputDates[0])}`
    : inputDates.length > 1 ? `Simpan ${inputDates.length} tanggal` : "Simpan";

  async function handleSave() {
    if (!canSave) return;
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
        const res = await fetch("/api/yantek", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, label, rows }),
        });
        if (!res.ok) throw new Error(`Gagal menyimpan ${date}`);
      }
      setInput("");
      const [, grouped2] = await Promise.all([refreshDates(), loadAllIntoCache()]);
      setRowCache(grouped2);
      const latest = Object.keys(grouped).sort().pop();
      if (latest && latest !== "unknown") {
        setFilterYear(latest.slice(0, 4));
        setFilterMonth(latest.slice(5, 7));
      }
    } catch (e) {
      setSaveError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(date: string) {
    await fetch(`/api/yantek?date=${date}`, { method: "DELETE" });
    setRowCache((prev) => { const n = { ...prev }; delete n[date]; return n; });
    await refreshDates();
  }

  async function handleDownloadPdf() {
    if (stats.length === 0) return;
    setPdfLoading(true);
    try {
      const [{ pdf }, { default: YantekPdfDoc }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./_YantekPdf"),
      ]);
      const poskoLabel = filterPosko
        ? `ULP ${POSKO_MAP.find((p) => p.kode === filterPosko)?.label ?? filterPosko}`
        : "Semua ULP";
      const dateLabel = filterMonth && filterYear
        ? `${MONTHS_ID[parseInt(filterMonth) - 1]} ${filterYear}`
        : filterYear || "Semua Data";

      // Rating dan durasi digabung jadi SATU tabel — PDF-nya hanya satu berkas.
      const durasi = buildDurasiPerPetugas(poskoRows, sla);
      const statsPdf = [...stats]
        .map((x) => {
          const d = durasi.get(x.petugas);
          return {
            ...x,
            medRpt: d?.medRpt ?? 0,
            medRct: d?.medRct ?? 0,
            lewatRpt: d?.lewatRpt ?? 0,
            lewatRct: d?.lewatRct ?? 0,
            hariAktif: d?.hariAktif ?? 0,
            rataPerHari: d?.rataPerHari ?? 0,
          };
        })
        .sort((a, b) => (b.lewatRpt + b.lewatRct) - (a.lewatRpt + a.lewatRct) || b.totalWO - a.totalWO);

      const element = (
        <YantekPdfDoc
          stats={statsPdf}
          grandTotal={grandTotal}
          dateLabel={dateLabel}
          filterLabel={poskoLabel}
          sla={{ response: sla.response, recovery: sla.recovery }}
          chart={chartPdf}
          ringkas={ringkasPdf}
          hariRentang={jumlahHariBerdata(poskoRows)}
        />
      );
      const blob = await pdf(element).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `yantek${filterPosko ? `-${filterPosko}` : ""}-${filterYear}-${filterMonth}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  }

  const TABS: { key: Tab; label: string; icon: typeof Users; badge?: number; tone?: "merah" }[] = [
    { key: "sla",      label: "SLA & Durasi",   icon: Timer },
    { key: "rekap",    label: "Rekap Petugas",  icon: Users },
    { key: "warning",  label: "Rating ★1 & ★2", icon: TriangleAlert, badge: lowRatingRows.length, tone: "merah" },
    { key: "detail",   label: "Data Detail",    icon: List },
    { key: "database", label: "Database",       icon: FileJson, badge: dates.length },
  ];

  return (
    // Judul halaman ada di topbar (PageTitle), jadi halaman ini langsung isi.
    <div className="space-y-3 text-ink">
      <KonsolPanel unit={canSeeAllUnits(user.role) ? null : user.unit} />

      {/* Paste JSON */}
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <FileJson className="w-4 h-4 text-navy-600" />
            <span className="text-sm font-semibold text-ink">Paste JSON</span>
            {canSave && (
              <span className="text-xs text-green-700">
                ✓ {inputRows.length} baris
                {inputDates.length === 1 ? ` — ${fmtDateLabel(inputDates[0])}` : ` — ${inputDates.length} tanggal`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canSave && (
              <button onClick={handleSave} disabled={saving} className={BTN_GHOST}>
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {saving ? "Menyimpan..." : saveBtnLabel}
              </button>
            )}
            {input && (
              <button onClick={() => setInput("")} className="p-1 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-50 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={3}
          className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-xs text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 resize-y"
          spellCheck={false}
        />

        {(saveError || error) && (
          <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <p className="text-[11px] text-red-700 font-mono">{saveError ?? error}</p>
          </div>
        )}
      </div>

      {/* Filter periode + ULP */}
      {dates.length > 0 && (
        <div className={`${CARD} p-4 space-y-3`}>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-ink-soft shrink-0 flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-navy-600" /> Periode:
            </span>
            <select
              value={filterYear}
              onChange={(e) => { setFilterYear(e.target.value); setFilterMonth(""); }}
              className={`${FIELD} text-xs`}
            >
              <option value="">Semua Tahun</option>
              {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className={`${FIELD} text-xs`}
              disabled={!filterYear}
            >
              <option value="">Semua Bulan</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>{MONTHS_ID[parseInt(m) - 1]}</option>
              ))}
            </select>
            {poskoRows.length > 0 && (
              <span className="text-xs text-ink-muted ml-1">
                {poskoRows.length} WO · {stats.length} petugas
              </span>
            )}
            <div className="flex-1" />
            <span className="text-xs text-ink-muted">
              {dates.reduce((a, d) => a + d.count, 0)} WO · {dates.length} tanggal tersimpan
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap border-t border-line pt-3">
            <span className={`${EYEBROW} shrink-0 mr-1`}>Filter ULP</span>
            <button
              onClick={() => setFilterPosko(null)}
              className={`${CHIP} ${filterPosko === null ? CHIP_ON : CHIP_OFF}`}
            >
              Semua
            </button>
            {POSKO_MAP.map(({ kode, label }) => (
              <button
                key={kode}
                onClick={() => setFilterPosko(kode === filterPosko ? null : kode)}
                className={`${CHIP} ${filterPosko === kode ? CHIP_ON : CHIP_OFF}`}
              >
                {label}
                {(poskoCounts[kode] ?? 0) > 0 && <span className="opacity-70">{poskoCounts[kode]}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-ink-muted">
          <Loader2 className="w-5 h-5 animate-spin text-navy-600" />
          <span className="text-sm">Memuat data...</span>
        </div>
      )}

      {!loading && dates.length > 0 && (
        <>
          <div className="flex items-center gap-1.5 flex-wrap">
            {TABS.map(({ key, label, icon: Icon, badge, tone }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`${CHIP} ${tab === key ? CHIP_ON : CHIP_OFF}`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
                {badge !== undefined && badge > 0 && (
                  <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    tab === key ? "bg-white/25 text-white"
                      : tone === "merah" ? "bg-red-100 text-red-600" : "bg-navy-50 text-navy-600"
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={handleDownloadPdf} disabled={pdfLoading || stats.length === 0} className={BTN_GHOST}>
              {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {pdfLoading ? "Membuat PDF..." : "Download PDF"}
            </button>
          </div>

          {tab === "sla" && (
            bulanKey ? (
              <SlaTab
                rows={poskoRows}
                rowsLalu={rowsBulanLalu}
                bulanKey={bulanKey}
                sla={sla}
                bisaAtur={canManageSettings(user.role)}
                onAturSla={() => setAturSla(true)}
              />
            ) : (
              <div className={`${CARD} py-12 flex flex-col items-center gap-2 text-ink-muted`}>
                <Timer className="w-9 h-9 opacity-25" />
                <p className="text-sm">Pilih tahun dan bulan dulu untuk melihat dashboard SLA</p>
              </div>
            )
          )}

          {tab === "rekap" && <RekapTab stats={stats} grandTotal={grandTotal} />}
          {tab === "warning" && <LowRatingTab rows={lowRatingRows} />}
          {tab === "detail" && <DetailTable rows={poskoRows} />}
          {tab === "database" && (
            <DatabaseTab
              dates={dates}
              rowCache={rowCache}
              filterYear={filterYear}
              filterMonth={filterMonth}
              onDelete={handleDelete}
              onSelectMonth={(y, m) => { setFilterYear(y); setFilterMonth(m); setTab("sla"); }}
            />
          )}
        </>
      )}

      {!loading && dates.length === 0 && (
        <div className={`${CARD} py-16 flex flex-col items-center gap-3 text-ink-muted`}>
          <Wrench className="w-10 h-10 opacity-30" />
          <p className="text-sm font-medium">Jalankan perintah console di atas, lalu tempel hasilnya</p>
          <p className="text-xs opacity-70">Data tersimpan sebagai berkas di server VPS · tidak hilang walau refresh</p>
        </div>
      )}

      {aturSla && (
        <SlaSettingsModal
          rows={slaRows}
          saving={slaSaving}
          onSimpan={simpanSla}
          onClose={() => setAturSla(false)}
        />
      )}
    </div>
  );
}
