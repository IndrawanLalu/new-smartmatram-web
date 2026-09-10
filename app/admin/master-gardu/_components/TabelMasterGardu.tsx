"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Search, ChevronLeft, ChevronRight,
  Gauge, AlertTriangle, Wrench, Zap, RefreshCw, FileSpreadsheet, Download, Loader2, Plus,
  CircleDashed, CalendarClock,
} from "lucide-react";
import { canManageSettings, type CurrentUser } from "@/lib/roles";
import ImportMasterGarduModal from "./ImportMasterGarduModal";
import TambahGarduModal from "./TambahGarduModal";
import {
  buatBerkasEksporMaster, namaBerkasEkspor, type BarisEksporMaster,
} from "../_lib/garduMaster";
import {
  useGarduStatus, kunciGardu, AMBANG_BASI,
  type GarduMasterState, type StatusUkur,
} from "@/app/admin/_hooks/useGarduStatus";
import { type AnomalySettings } from "@/lib/anomaliGardu";
import { OVERLOAD_PCT } from "@/lib/garduAmbang";
import GarduTimelineModal from "./GarduTimelineModal";
import SaringanKondisiGardu from "./SaringanKondisiGardu";
import { useKondisiHargardu } from "../_hooks/useKondisiHargardu";
import {
  kunciKondisi, adaSaringanKondisi, lolosStatusHar,
  type SaringanKondisi, type NilaiKondisi, type KeadaanHar,
} from "../_lib/kondisiGardu";
import type { StatusHar, SaringanUrl } from "../_lib/saringanUrl";

// ── Constants ─────────────────────────────────────────────────────────────────

const INPUT_CLASS =
  "border border-line rounded-lg px-3 py-1.5 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15 bg-white";

const TH = "px-4 py-2.5 text-xs font-semibold text-accent-deep";
const KOSONG = <span className="text-ink-muted">—</span>;

const STATUS_UKUR_OPSI: { nilai: StatusUkur; label: string }[] = [
  { nilai: "",        label: "Semua Status Ukur" },
  { nilai: "belum",   label: "Belum pernah diukur" },
  { nilai: "basi",    label: "Perlu diukur ulang" },
  { nilai: "terukur", label: "Sudah pernah diukur" },
];

const STATUS_HAR_OPSI: { nilai: StatusHar; label: string }[] = [
  { nilai: "",      label: "Semua Pemeliharaan" },
  { nilai: "belum", label: "Belum pernah dipelihara" },
  { nilai: "sudah", label: "Sudah pernah dipelihara" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(s: string) {
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

/**
 * Angka KPI, atau "—" kalau datanya memang belum ada.
 *
 * Data tab ini baru ditarik setelah tombol "Tampilkan Data" ditekan, jadi
 * sebelum itu semua hitungan bernilai nol. Menampilkan nol berarti berkata
 * "tidak ada gardu yang belum diukur" padahal yang benar adalah "belum dihitung"
 * — persis kebalikan dari yang seharusnya dibaca orang.
 */
const angka = (n: number, siap: boolean) => (siap ? n : "—");

function BebanBar({ pct }: { pct: number }) {
  const barCls = pct >= OVERLOAD_PCT ? "bg-red-500" : pct >= 60 ? "bg-amber-500" : "bg-green-500";
  const txtCls = pct >= OVERLOAD_PCT ? "text-red-600" : pct >= 60 ? "text-amber-600" : "text-green-700";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 bg-surface rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${barCls}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-sm font-bold ${txtCls}`}>{Math.round(pct)}%</span>
    </div>
  );
}

function SourceBadge({ type }: { type: GarduMasterState["event_type"] }) {
  if (!type) return KOSONG;
  return type === "pengukuran" ? (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-navy-50 text-navy-600 border border-navy-200 font-medium whitespace-nowrap">
      <Zap size={10} /> Ukur
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-medium whitespace-nowrap">
      <Wrench size={10} /> Seimbang
    </span>
  );
}

/** Lencana status baris — empat keadaan yang saling meniadakan, diurutkan dari
 *  yang paling menentukan. Gardu yang belum pernah diukur tidak bisa dinilai
 *  anomali maupun basi, jadi ia diperiksa lebih dulu. */
function StatusBadge({ belumDiukur, anomali, basi }: {
  belumDiukur: boolean;
  anomali?: { isAnomali: boolean; reasons: string[] };
  basi: boolean;
}) {
  const dasar = "text-[11px] px-2 py-0.5 rounded-full font-semibold whitespace-nowrap border";

  if (belumDiukur) {
    return (
      <span title="Terdaftar di master, belum pernah diukur" className={`${dasar} bg-surface text-ink-soft border-line`}>
        Belum Diukur
      </span>
    );
  }
  if (anomali?.isAnomali) {
    return (
      <span title={anomali.reasons.join(" · ")} className={`${dasar} bg-red-50 text-red-600 border-red-200 cursor-help`}>
        Anomali
      </span>
    );
  }
  if (basi) {
    return (
      <span
        title={`Pengukuran terakhir sudah lewat batas: ≥${AMBANG_BASI.bebanTinggi}% maksimal ${AMBANG_BASI.bulanTinggi} bulan, <${AMBANG_BASI.bebanTinggi}% maksimal ${AMBANG_BASI.bulanRendah} bulan`}
        className={`${dasar} bg-amber-50 text-amber-700 border-amber-200 cursor-help`}
      >
        Perlu Ukur
      </span>
    );
  }
  return <span className={`${dasar} bg-green-50 text-green-700 border-green-200`}>Normal</span>;
}

/**
 * Kartu KPI ringkas — ikon dan label sebaris di atas, angka di bawah.
 *
 * Sengaja dipadatkan supaya tujuh kartu muat satu baris. Penjelasan panjangnya
 * pindah ke `hint` (tooltip), bukan baris teks ketiga yang menambah tinggi.
 *
 * Warna peringatan hanya dipakai saat angkanya benar-benar bukan nol — nol
 * berwarna merah cuma melatih mata untuk mengabaikan warna merah.
 */
function KPICard({
  label, value, hint, icon: Icon, variant = "default",
}: {
  label: string; value: number | string; hint?: string;
  icon: React.ElementType; variant?: "default" | "danger" | "warning" | "info";
}) {
  const s = {
    default: { card: "border-line",       icon: "text-accent-deep", val: "text-ink" },
    danger:  { card: "border-red-200",    icon: "text-red-600",     val: "text-red-600" },
    warning: { card: "border-amber-200",  icon: "text-amber-600",   val: "text-amber-600" },
    info:    { card: "border-blue-200",   icon: "text-blue-700",    val: "text-blue-700" },
  }[variant];
  return (
    <div title={hint} className={`bg-white rounded-xl border px-3 py-2.5 ${s.card}`}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon size={13} className={`shrink-0 ${s.icon}`} />
        <p className="text-xs font-semibold text-ink-soft truncate">{label}</p>
      </div>
      <p className={`text-2xl font-bold leading-none ${s.val}`}>{value}</p>
    </div>
  );
}

/**
 * Nilai gardu ini untuk item yang sedang disaring.
 *
 * Ada supaya saringan tidak jadi kotak hitam: baris yang lolos harus bisa
 * menunjukkan sendiri alasannya. Item per fasa/jurusan bisa punya beberapa nilai
 * sekaligus — bagiannya ikut ditulis, karena "jurusan C konektor" dan "semua
 * jurusan konektor" adalah dua pekerjaan yang sangat berbeda.
 */
function SelKondisi({
  item, nilaiPerItem, kunci,
}: {
  item: string[];
  nilaiPerItem: Map<string, Map<string, NilaiKondisi[]>>;
  kunci: string;
}) {
  const isi = item.flatMap((kode) => {
    const daftar = nilaiPerItem.get(kode)?.get(kunci);
    if (!daftar) return [{ kode, teks: "belum diperiksa", normal: true, kosong: true }];
    return daftar
      .filter((d) => d.label || d.nilai)
      .map((d) => ({
        kode,
        teks: (d.label ?? d.nilai ?? "") + (d.bagian !== "-" ? ` (${d.bagian})` : ""),
        normal: d.normal,
        kosong: false,
      }));
  });

  if (isi.length === 0) return KOSONG;

  return (
    <div className="flex flex-wrap gap-1 max-w-64">
      {isi.map((x, i) => (
        <span
          key={`${x.kode}-${i}`}
          className={`text-[11px] px-1.5 py-0.5 rounded border whitespace-nowrap ${
            x.kosong
              ? "bg-surface text-ink-muted border-line border-dashed"
              : x.normal
                ? "bg-surface text-ink-soft border-line"
                : "bg-amber-50 text-amber-700 border-amber-200 font-medium"
          }`}
        >
          {x.teks}
        </span>
      ))}
    </div>
  );
}

/**
 * Tanggal pemeliharaan terverifikasi terakhir.
 *
 * Gardu yang pekerjaannya sedang menunggu persetujuan tidak ditulis "Belum
 * pernah" begitu saja — secara angka memang belum terhitung, tapi orang yang
 * membaca kolom ini sedang memutuskan mau mengirim regu ke mana.
 */
function SelHar({ keadaan }: { keadaan: KeadaanHar | undefined }) {
  if (keadaan?.pernah) {
    // `tgl_selesai` bertipe timestamptz, bukan date seperti tanggal pengukuran —
    // dipotong dulu ke YYYY-MM-DD, kalau tidak `fmtDate` akan mengeluarkan
    // "01T00:00:00+08:00-08-2026".
    return (
      <span className="text-ink-soft">
        {keadaan.tgl ? fmtDate(keadaan.tgl.slice(0, 10)) : "Disetujui"}
      </span>
    );
  }
  if (keadaan?.menunggu) {
    return (
      <span className="text-[11px] px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200 whitespace-nowrap">
        Menunggu persetujuan
      </span>
    );
  }
  return <span className="text-[11px] text-ink-muted">Belum pernah</span>;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  user: CurrentUser;
  ulp: string;
  settings: AnomalySettings;
  /** Saringan yang dibawa dari alamat halaman — dipakai tautan dari dashboard. */
  awal: SaringanUrl;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataGarduTab({ user, ulp, settings, awal }: Props) {
  const [saringanKondisi, setSaringanKondisi] = useState<SaringanKondisi>(awal.kondisi);
  const [statusHar, setStatusHar] = useState<StatusHar>(awal.statusHar);

  // Datang dari tautan yang sudah membawa saringan berarti orangnya sudah tahu
  // apa yang dicari — menahannya di balik tombol "Tampilkan Data" cuma
  // menyuruhnya menegaskan permintaan yang baru saja dia buat.
  const [showTable, setShowTable] = useState(
    () => adaSaringanKondisi(awal.kondisi) || awal.statusHar !== "",
  );

  const {
    harTerakhir, nilaiPerItem, lolos,
    memuat: memuatKondisi, galat: galatKondisi,
  } = useKondisiHargardu(ulp, saringanKondisi, showTable);

  /** Item yang sedang dipakai menyaring — kolom Kondisi menampilkan nilainya,
   *  supaya alasan sebuah baris ikut tersaring terlihat di baris itu sendiri. */
  const itemDisaring = useMemo(
    () => Object.entries(saringanKondisi).filter(([, v]) => v.length > 0).map(([k]) => k),
    [saringanKondisi],
  );

  const saringTambahan = useCallback(
    (row: GarduMasterState) => {
      const kunci = kunciKondisi(row.kode, row.ulp);
      return lolosStatusHar(harTerakhir.get(kunci), statusHar) && lolos(kunci);
    },
    [statusHar, harTerakhir, lolos],
  );

  const {
    data, allData, rawData,
    loading, error,
    filter, setFilter,
    page, setPage, totalPages, totalFiltered,
    penyulangOptions,
    anomaliMap, anomaliCount, penyeimbanganCount, avgBeban, cakupan, basiSet,
    refresh,
  } = useGarduStatus(user, ulp, settings, showTable, saringTambahan);

  const [selectedGardu, setSelectedGardu] = useState<GarduMasterState | null>(null);
  const [imporTerbuka, setImporTerbuka] = useState(false);
  const [tambahTerbuka, setTambahTerbuka] = useState(false);
  const [mengunduh, setMengunduh] = useState(false);
  /** Master gardu menentukan acuan kVA seluruh pengukuran — perubahannya
   *  berdampak ke semua ULP, jadi dibatasi ke yang boleh mengatur setelan. */
  const bisaImpor = canManageSettings(user.role);

  const kvaOptions = useMemo(
    () => [...new Set(rawData.map((d) => d.kva_master).filter((k): k is number => k !== null))]
      .sort((a, b) => a - b),
    [rawData]
  );

  /** Angka KPI baru boleh dipercaya setelah datanya benar-benar ditarik. */
  const siap = showTable && !loading;

  /**
   * Unduh isi master sebagai .xlsx.
   *
   * Yang diekspor adalah `allData` — hasil saringan yang sedang aktif, bukan
   * seluruh master. Jadi "Belum pernah diukur + ULP Gerung" bisa langsung jadi
   * berkas kerja, dan berkas yang sama bisa disunting lalu diunggah kembali
   * lewat Impor Master tanpa disalin ke template dulu.
   */
  async function unduhMaster() {
    setMengunduh(true);
    try {
      const rows: BarisEksporMaster[] = allData.map((d) => ({
        kode: d.kode,
        ulp: d.ulp,
        daya: d.kva_master,
        nama: d.nama,
        alamat: d.alamat,
        feeder: d.penyulang,
        merk: d.merk,
        status: d.status,
        kode_amg: d.kode_amg,
        lat: d.lat,
        lng: d.lng,
        tgl_ukur_terakhir: d.event_date,
        persen_beban: d.persen_beban,
      }));
      const blob = await buatBerkasEksporMaster(rows);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = namaBerkasEkspor(ulp);
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setMengunduh(false);
    }
  }

  return (
    <div className="space-y-5">

      {/* ── KPI Cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2.5">
        <KPICard
          label="Sudah Diukur" value={angka(cakupan.terukur, siap)} icon={Gauge}
          hint={`Punya setidaknya satu pengukuran atau penyeimbangan${
            siap ? ` — dari ${cakupan.totalMaster} gardu di master` : ""}`}
        />
        <KPICard
          label="Anomali" value={angka(anomaliCount, siap)} icon={AlertTriangle}
          variant={siap && anomaliCount > 0 ? "danger" : "default"}
          hint="Gardu yang kondisi terakhirnya memenuhi kriteria anomali aktif"
        />
        <KPICard
          label="Dari Pemeliharaan" value={angka(penyeimbanganCount, siap)} icon={Wrench}
          variant={siap ? "info" : "default"}
          hint="Kondisi terakhirnya berasal dari penyeimbangan, belum diukur ulang"
        />
        <KPICard
          label="Rata-rata Beban" value={siap ? `${avgBeban}%` : "—"} icon={Gauge}
          variant={siap && avgBeban >= OVERLOAD_PCT ? "danger" : "default"}
          hint="Rata-rata beban gardu yang sudah pernah diukur — yang belum diukur tidak ikut membagi"
        />
        <KPICard
          label="Belum Diukur" value={angka(cakupan.belumDiukur, siap)} icon={CircleDashed}
          variant={siap && cakupan.belumDiukur > 0 ? "warning" : "default"}
          hint={`Terdaftar di master gardu tapi belum pernah diukur sama sekali${
            siap ? ` — dari ${cakupan.totalMaster} gardu di master` : ""}`}
        />
        <KPICard
          label={`≥${AMBANG_BASI.bebanTinggi}% · ${AMBANG_BASI.bulanTinggi} Bln`}
          value={angka(cakupan.basiTinggi, siap)} icon={CalendarClock}
          variant={siap && cakupan.basiTinggi > 0 ? "danger" : "default"}
          hint={`Beban terakhir ≥${AMBANG_BASI.bebanTinggi}% dan sudah lewat ${AMBANG_BASI.bulanTinggi} bulan tidak diukur ulang`}
        />
        <KPICard
          label={`<${AMBANG_BASI.bebanTinggi}% · ${AMBANG_BASI.bulanRendah} Bln`}
          value={angka(cakupan.basiRendah, siap)} icon={CalendarClock}
          variant={siap && cakupan.basiRendah > 0 ? "warning" : "default"}
          hint={`Beban terakhir <${AMBANG_BASI.bebanTinggi}% dan sudah lewat ${AMBANG_BASI.bulanRendah} bulan tidak diukur ulang`}
        />
      </div>

      {/* ── Filter Bar ────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-line px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            value={filter.search}
            onChange={(e) => { setFilter({ ...filter, search: e.target.value }); setPage(1); }}
            placeholder="Cari no. gardu, penyulang, alamat..."
            className={`w-full pl-8 pr-3 py-1.5 text-sm border border-line rounded-lg bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500`}
          />
        </div>

        <select
          value={filter.penyulang}
          onChange={(e) => { setFilter({ ...filter, penyulang: e.target.value }); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value="">Semua Penyulang</option>
          {penyulangOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>

        <select
          value={filter.kvaTrafo}
          onChange={(e) => { setFilter({ ...filter, kvaTrafo: e.target.value }); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value="">Semua KVA</option>
          {kvaOptions.map((k) => <option key={k} value={k}>{k} kVA</option>)}
        </select>

        <select
          value={filter.minBeban}
          onChange={(e) => { setFilter({ ...filter, minBeban: Number(e.target.value) }); setPage(1); }}
          className={INPUT_CLASS}
        >
          <option value={0}>Semua Beban</option>
          <option value={60}>Beban ≥60%</option>
          <option value={80}>Beban ≥80%</option>
          <option value={100}>Beban ≥100%</option>
        </select>

        <select
          value={filter.statusUkur}
          onChange={(e) => { setFilter({ ...filter, statusUkur: e.target.value as StatusUkur }); setPage(1); }}
          className={INPUT_CLASS}
        >
          {STATUS_UKUR_OPSI.map((o) => (
            <option key={o.nilai} value={o.nilai}>{o.label}</option>
          ))}
        </select>

        <select
          value={statusHar}
          onChange={(e) => { setStatusHar(e.target.value as StatusHar); setPage(1); }}
          className={INPUT_CLASS}
          title="Menurut pemeliharaan gardu yang sudah disetujui"
        >
          {STATUS_HAR_OPSI.map((o) => (
            <option key={o.nilai} value={o.nilai}>{o.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={filter.anomaliOnly}
            onChange={(e) => { setFilter({ ...filter, anomaliOnly: e.target.checked }); setPage(1); }}
            className="w-3.5 h-3.5 accent-navy-600"
          />
          <span className="text-sm text-ink">Anomali saja</span>
        </label>

        <div className="flex items-center gap-2 ml-auto">
          {bisaImpor && (
            <button
              onClick={() => setTambahTerbuka(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-ink-soft hover:text-navy-600 hover:border-navy-300 transition-colors"
            >
              <Plus size={12} /> Tambah Gardu
            </button>
          )}
          {bisaImpor && (
            <button
              onClick={() => setImporTerbuka(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-ink-soft hover:text-navy-600 hover:border-navy-300 transition-colors"
            >
              <FileSpreadsheet size={12} /> Impor Master
            </button>
          )}
          {showTable && (
            <button
              onClick={unduhMaster}
              disabled={mengunduh || allData.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-ink-soft hover:text-navy-600 hover:border-navy-300 transition-colors disabled:opacity-40"
              title="Unduh gardu yang sedang tampil — bisa disunting lalu diunggah kembali"
            >
              {mengunduh ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
              Ekspor Master
            </button>
          )}
          {showTable && (
            <button
              onClick={refresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-line text-ink-soft hover:text-accent-deep hover:border-navy-300 transition-colors"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          )}
          {showTable
            ? (
              <span className="text-sm font-medium text-ink-soft flex items-center gap-1.5">
                {memuatKondisi && <Loader2 size={12} className="animate-spin" />}
                {totalFiltered} gardu
              </span>
            )
            : (
              <button
                onClick={() => setShowTable(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 text-sm rounded-lg bg-navy-600 text-white font-semibold hover:opacity-90 transition-opacity"
              >
                <Gauge size={12} /> Tampilkan Data
              </button>
            )
          }
        </div>
      </div>

      <SaringanKondisiGardu
        saringan={saringanKondisi}
        onUbah={(v) => { setSaringanKondisi(v); setPage(1); }}
        aktif={showTable}
      />

      {galatKondisi && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {galatKondisi}
        </div>
      )}

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-line overflow-hidden">
        {!showTable && (
          <div className="flex flex-col items-center gap-2 py-16 text-ink-soft">
            <Gauge size={32} className="opacity-40" />
            <p className="text-sm">Data gardu belum ditampilkan.</p>
            <p className="text-sm">Atur filter di atas, lalu klik <strong className="text-ink">Tampilkan Data</strong>.</p>
          </div>
        )}

        {showTable && error && (
          <div className="m-4 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
        )}

        {showTable && (loading || memuatKondisi) && (
          <div className="flex items-center justify-center py-14 gap-2 text-ink-soft text-sm">
            <div className="w-5 h-5 border-4 border-line border-t-navy-600 rounded-full animate-spin" />
            {loading ? "Memuat data gardu..." : "Menyaring menurut kondisi pemeliharaan..."}
          </div>
        )}

        {showTable && !loading && !memuatKondisi && allData.length === 0 && !error && (
          <div className="flex flex-col items-center gap-2 py-14 text-ink-soft">
            <Gauge size={28} />
            <p className="text-sm font-medium">Tidak ada gardu yang cocok dengan filter.</p>
            <p className="text-sm">
              Longgarkan filternya, atau impor master gardu kalau memang belum ada isinya.
            </p>
            <p className="text-xs max-w-lg text-center text-ink-muted">
              Saringan kondisi hanya menemukan gardu yang pemeliharaannya <b>sudah disetujui</b>.
              Gardu yang belum pernah dipelihara dicari lewat pil <b>Belum diperiksa</b>.
            </p>
          </div>
        )}

        {showTable && !loading && !memuatKondisi && allData.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-surface">
                    <th className={`${TH} text-left`}>No. Gardu</th>
                    <th className={`${TH} text-left`}>Penyulang</th>
                    <th className={`${TH} text-left`}>Alamat</th>
                    <th className={`${TH} text-center`}>KVA</th>
                    <th className={`${TH} text-center`}>Beban</th>
                    <th className={`${TH} text-center`}>Arus R/S/T</th>
                    <th className={`${TH} text-center`}>Suhu°C</th>
                    <th className={`${TH} text-center`}>Sumber</th>
                    <th className={`${TH} text-left`}>Tgl Ukur</th>
                    {itemDisaring.length > 0 && <th className={`${TH} text-left`}>Kondisi</th>}
                    <th className={`${TH} text-left`}>HAR Terakhir</th>
                    <th className={`${TH} text-center`}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.map((row) => {
                    const kunci = kunciGardu(row);
                    // Kunci kondisi HARGARDU dinormalkan huruf besarnya — catatan
                    // pemeliharaan datang dari aplikasi lapangan, bukan dari
                    // master, jadi tidak boleh diandaikan ejaannya sama persis.
                    const kKondisi = kunciKondisi(row.kode, row.ulp);
                    return (
                      <tr
                        key={kunci}
                        onClick={() => setSelectedGardu(row)}
                        className={`cursor-pointer transition-colors hover:bg-navy-50/60 ${
                          row.belum_diukur ? "text-ink-soft" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5 font-semibold text-ink">{row.kode}</td>
                        <td className="px-4 py-2.5 text-ink-soft">{row.penyulang ?? KOSONG}</td>
                        <td className="px-4 py-2.5 text-ink-soft max-w-40 truncate">{row.alamat ?? KOSONG}</td>
                        <td className="px-4 py-2.5 text-center text-ink">
                          {row.kva_master ?? KOSONG}
                          {/* kVA pengukuran menyimpang dari master — salah satunya
                              pasti keliru, dan persen bebannya ikut terpengaruh. */}
                          {row.kva_beda && (
                            <span
                              title={`Pengukuran terakhir memakai ${row.kva_pengukuran} kVA, master mencatat ${row.kva_master} kVA`}
                              className="ml-1 text-amber-600 font-bold cursor-help"
                            >
                              *
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.persen_beban !== null ? <BebanBar pct={row.persen_beban} /> : KOSONG}
                        </td>
                        <td className="px-4 py-2.5 text-center font-mono text-ink-soft">
                          {row.total_arus_r !== null
                            ? `${Math.round(row.total_arus_r)}/${Math.round(row.total_arus_s ?? 0)}/${Math.round(row.total_arus_t ?? 0)}`
                            : KOSONG}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {row.suhu_trafo != null ? (
                            <span className={row.suhu_trafo > 60 ? "text-amber-600 font-semibold" : "text-ink-soft"}>
                              {row.suhu_trafo}
                            </span>
                          ) : KOSONG}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <SourceBadge type={row.event_type} />
                        </td>
                        <td className="px-4 py-2.5 text-ink-soft">
                          {row.event_date ? fmtDate(row.event_date) : KOSONG}
                        </td>
                        {itemDisaring.length > 0 && (
                          <td className="px-4 py-2.5">
                            <SelKondisi item={itemDisaring} nilaiPerItem={nilaiPerItem} kunci={kKondisi} />
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <SelHar keadaan={harTerakhir.get(kKondisi)} />
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusBadge
                            belumDiukur={row.belum_diukur}
                            anomali={anomaliMap.get(kunci)}
                            basi={basiSet.has(kunci)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-5 py-3 border-t border-line flex items-center justify-between">
                <span className="text-sm text-ink-soft">
                  {totalFiltered} gardu · Hal {page}/{totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 flex items-center justify-center rounded border border-line text-ink-soft hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-7 h-7 flex items-center justify-center rounded border border-line text-ink-soft hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Timeline Modal */}
      {selectedGardu && (
        <GarduTimelineModal
          gardu={selectedGardu}
          onClose={() => setSelectedGardu(null)}
          settings={settings}
        />
      )}

      {imporTerbuka && (
        <ImportMasterGarduModal
          onClose={() => setImporTerbuka(false)}
          onSelesai={refresh}
        />
      )}

      {tambahTerbuka && (
        <TambahGarduModal
          ulpAwal={ulp}
          onClose={() => setTambahTerbuka(false)}
          onSelesai={refresh}
        />
      )}
    </div>
  );
}
