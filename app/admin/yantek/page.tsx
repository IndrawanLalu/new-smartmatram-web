"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Wrench, Users, List, CalendarDays, Loader2, Download, TriangleAlert, Timer,
  Trophy, Terminal, FileJson,
} from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canManageSettings, canSeeAllUnits } from "@/lib/roles";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import {
  buildDurasiPerPetugas, buildStats, durasiSah, extractPrefix, hariDalamBulan,
  jumlahHariBerdata, median, medianPerHari, MONTHS_ID, POSKO_MAP, toDateStr,
  type DateSummary, type Tab, type YantekRow,
} from "./_lib/yantek";
import { useYantekSla } from "./_hooks/useYantekSla";
import RekapTab from "./_components/RekapTab";
import SlaTab from "./_components/SlaTab";
import JuaraTab from "./_components/JuaraTab";
import LowRatingTab from "./_components/LowRatingTab";
import DetailTable from "./_components/DetailTable";
import DatabaseTab from "./_components/DatabaseTab";
import AmbilDataTab from "./_components/AmbilDataTab";
import SlaSettingsModal from "./_components/SlaSettingsModal";

/** "2026-05" → "2026-04". Dipakai untuk garis pembanding di tab SLA. */
function bulanSebelumnya(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function YantekPage() {
  const user = useCurrentUser();

  const [dates, setDates] = useState<DateSummary[]>([]);
  const [rowCache, setRowCache] = useState<Record<string, YantekRow[]>>({});
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterPosko, setFilterPosko] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("juara");
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [aturSla, setAturSla] = useState(false);

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
        } else {
          // Belum ada apa-apa untuk dilihat — langsung antar ke cara mengisinya.
          setTab("ambil");
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

  /** Label periode & cakupan — dipakai judul PDF dan panggung juara, supaya
   *  keduanya menyebut rentang yang sama persis. */
  const poskoLabel = filterPosko
    ? `ULP ${POSKO_MAP.find((p) => p.kode === filterPosko)?.label ?? filterPosko}`
    : "Semua ULP";
  const periodeLabel = filterMonth && filterYear
    ? `${MONTHS_ID[parseInt(filterMonth) - 1]} ${filterYear}`
    : filterYear || "Semua Data";

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

  /** Dipanggil tab Ambil Data setelah POST selesai — halaman yang memegang
   *  cache & filter, jadi pemuatan ulangnya dikerjakan di sini. */
  const handleTersimpan = useCallback(
    async (tanggalTerakhir: string | null) => {
      const [, grouped] = await Promise.all([refreshDates(), loadAllIntoCache()]);
      setRowCache(grouped);
      if (tanggalTerakhir) {
        setFilterYear(tanggalTerakhir.slice(0, 4));
        setFilterMonth(tanggalTerakhir.slice(5, 7));
        setTab("juara");
      }
    },
    [refreshDates, loadAllIntoCache],
  );

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
          dateLabel={periodeLabel}
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
    { key: "juara",    label: "Papan Juara",    icon: Trophy },
    { key: "sla",      label: "SLA & Durasi",   icon: Timer },
    { key: "rekap",    label: "Rekap Petugas",  icon: Users },
    { key: "warning",  label: "Rating ★1 & ★2", icon: TriangleAlert, badge: lowRatingRows.length, tone: "merah" },
    { key: "detail",   label: "Data Detail",    icon: List },
    { key: "database", label: "Database",       icon: FileJson, badge: dates.length },
    { key: "ambil",    label: "Ambil Data",     icon: Terminal },
  ];

  /** Selain tab Ambil Data, semua tab bergantung pada data tersimpan. */
  const butuhData = tab !== "ambil";

  return (
    // Judul halaman ada di topbar (PageTitle), jadi halaman ini langsung isi.
    <div className="space-y-3 text-ink">
      {/* Filter periode + ULP */}
      {dates.length > 0 && butuhData && (
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

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-3 text-ink-muted">
          <Loader2 className="w-5 h-5 animate-spin text-navy-600" />
          <span className="text-sm">Memuat data...</span>
        </div>
      ) : (
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
            {butuhData && dates.length > 0 && (
              <button onClick={handleDownloadPdf} disabled={pdfLoading || stats.length === 0} className={BTN_GHOST}>
                {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {pdfLoading ? "Membuat PDF..." : "Download PDF"}
              </button>
            )}
          </div>

          {tab === "ambil" && (
            <AmbilDataTab
              unit={canSeeAllUnits(user.role) ? null : user.unit}
              onTersimpan={handleTersimpan}
            />
          )}

          {butuhData && dates.length === 0 && (
            <div className={`${CARD} py-16 flex flex-col items-center gap-3 text-ink-muted`}>
              <Wrench className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">Belum ada data tersimpan</p>
              <button onClick={() => setTab("ambil")} className={BTN_GHOST}>
                <Terminal className="w-4 h-4" /> Buka tab Ambil Data
              </button>
            </div>
          )}

          {butuhData && dates.length > 0 && (
            <>
              {tab === "juara" && (
                <JuaraTab
                  rows={poskoRows}
                  sla={sla}
                  bulanKey={bulanKey}
                  periode={periodeLabel}
                  cakupan={poskoLabel}
                />
              )}

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
                  onSelectMonth={(y, m) => { setFilterYear(y); setFilterMonth(m); setTab("juara"); }}
                />
              )}
            </>
          )}
        </>
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
