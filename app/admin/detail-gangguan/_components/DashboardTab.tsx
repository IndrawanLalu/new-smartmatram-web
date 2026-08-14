"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { ClipboardList, Info, PencilLine, Timer, TimerReset } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/app/admin/_ui";
import { CHART_SERIES } from "@/lib/chartColors";
import {
  bangunBanding, bangunEmber, bangunSebaran, cakupan, fmtMenit, KATEGORI_LABEL, ringkas, saringMode,
  type FilterMode, type GangguanTerklasifikasi, type Kerapatan, type KoreksiRow, type Metrik,
} from "../_lib/gangguan";

const BandingChart = dynamic(() => import("./BandingChart"), {
  ssr: false,
  loading: () => <div className={`${CARD} h-full min-h-[290px] animate-skeleton`} />,
});

interface DashboardTabProps {
  items: GangguanTerklasifikasi[];
  koreksiMap: Map<string, KoreksiRow>;
  dateFrom: string;
  dateTo: string;
  /** Sama dengan filter di tab Data — satu lensa untuk seluruh halaman. */
  mode: FilterMode;
  counts: { all: number; ct: number; non: number };
  onMode: (m: FilterMode) => void;
}

const WARNA_RPT = CHART_SERIES[0];
const WARNA_RCT = CHART_SERIES[1];

/** Kerapatan ember mengikuti panjang rentang — lihat `bangunEmber`. */
const SATUAN_EMBER: Record<Kerapatan, string> = {
  hari: "per hari",
  minggu: "per blok 7 hari",
  bulan: "per bulan",
};

const JUDUL_REKAP: Record<Kerapatan, string> = {
  hari: "Rekap Harian",
  minggu: "Rekap per Blok 7 Hari",
  bulan: "Rekap Bulanan",
};

const METRIK_LABEL: Record<Metrik, string> = {
  rpt: "Response Time",
  rct: "Recovery Time",
};

/** `null` = ikut panjang rentang (lihat `bangunEmber`). */
const PILIHAN_KERAPATAN: { key: Kerapatan | null; label: string }[] = [
  { key: null, label: "Otomatis" },
  { key: "hari", label: "Harian" },
  { key: "minggu", label: "Mingguan" },
  { key: "bulan", label: "Bulanan" },
];

export default function DashboardTab({
  items, koreksiMap, dateFrom, dateTo, mode, counts, onMode,
}: DashboardTabProps) {
  const [metrikSebaran, setMetrikSebaran] = useState<Metrik>("rpt");
  const [kerapatanPilih, setKerapatanPilih] = useState<Kerapatan | null>(null);

  const banding = useMemo(
    () => bangunBanding(saringMode(items, mode), koreksiMap),
    [items, mode, koreksiMap],
  );

  const rpt = useMemo(() => ringkas(banding, "rpt"), [banding]);
  const rct = useMemo(() => ringkas(banding, "rct"), [banding]);

  const { ember, kerapatan } = useMemo(
    () => bangunEmber(banding, dateFrom, dateTo, kerapatanPilih),
    [banding, dateFrom, dateTo, kerapatanPilih],
  );

  const isi = useMemo(() => cakupan(banding, dateFrom, dateTo), [banding, dateFrom, dateTo]);

  const sebaran = useMemo(() => bangunSebaran(banding, metrikSebaran), [banding, metrikSebaran]);

  const dikoreksi = useMemo(() => banding.filter((b) => b.dikoreksi).length, [banding]);
  const pctKoreksi = banding.length ? Math.round((dikoreksi / banding.length) * 100) : 0;

  const dataRpt = useMemo(
    () => ember.map((e) => ({ label: e.label, asli: e.rptAsli, koreksi: e.rptKoreksi })),
    [ember],
  );
  const dataRct = useMemo(
    () => ember.map((e) => ({ label: e.label, asli: e.rctAsli, koreksi: e.rctKoreksi })),
    [ember],
  );
  const barisRekap = useMemo(() => ember.filter((e) => e.n > 0), [ember]);

  if (items.length === 0) {
    return (
      <div className={`${CARD} py-16 flex flex-col items-center gap-3 text-ink-muted`}>
        <ClipboardList className="w-10 h-10 opacity-30" />
        <p className="text-sm font-medium">Belum ada data pada rentang tanggal ini</p>
        <p className="text-xs opacity-70">
          Tarik data di tab Data &amp; Koreksi, atau ubah rentang tanggal lalu klik Muat dari DB
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Lingkup data yang sedang dilihat */}
      <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <p className={EYEBROW}>Kategori laporan</p>
            <p className="text-sm text-ink">
              {banding.length} laporan · {dateFrom} s/d {dateTo}
            </p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            {KATEGORI_LABEL.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onMode(key)}
                className={`${CHIP} ${mode === key ? CHIP_ON : CHIP_OFF}`}
              >
                {label}
                <span className="opacity-70">
                  {key === "non" ? counts.non : key === "ct" ? counts.ct : counts.all}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
          <span className={`${EYEBROW} shrink-0 mr-1`}>Kerapatan grafik</span>
          {PILIHAN_KERAPATAN.map(({ key, label }) => (
            <button
              key={label}
              onClick={() => setKerapatanPilih(key)}
              className={`${CHIP} ${kerapatanPilih === key ? CHIP_ON : CHIP_OFF}`}
            >
              {label}
              {key === null && kerapatanPilih === null && (
                <span className="opacity-70">{SATUAN_EMBER[kerapatan].replace("per ", "")}</span>
              )}
            </button>
          ))}

          {/* Hari yang belum pernah ditarik terlihat sama dengan hari tanpa
              gangguan — jadi cakupannya harus tertulis, bukan disimpulkan. */}
          <span
            className={`ml-auto text-xs ${
              isi.hariBerisi < isi.hariTotal ? "text-attention" : "text-ink-muted"
            }`}
            title="Hari tanpa data bukan berarti tidak ada gangguan — bisa jadi belum ditarik dari APKT"
          >
            {isi.hariBerisi} dari {isi.hariTotal} hari terisi
            {isi.terakhir && ` · data terakhir ${isi.terakhir}`}
          </span>
        </div>
      </div>

      {/* KPI */}
      <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Laporan Dianalisis"
          value={banding.length}
          icon={ClipboardList}
          hint={`${rpt.n} punya durasi response · ${rct.n} punya recovery`}
        />
        <StatTile
          label="Rata-rata Response"
          value={fmtMenit(rpt.koreksi)}
          icon={Timer}
          delta={rpt.delta !== 0 ? { pct: rpt.pct, vs: "sebelum koreksi", upIsGood: false } : undefined}
          hint={`sebelum koreksi ${fmtMenit(rpt.asli)}`}
        />
        <StatTile
          label="Rata-rata Recovery"
          value={fmtMenit(rct.koreksi)}
          tone="accent"
          icon={TimerReset}
          delta={rct.delta !== 0 ? { pct: rct.pct, vs: "sebelum koreksi", upIsGood: false } : undefined}
          hint={`sebelum koreksi ${fmtMenit(rct.asli)}`}
        />
        <StatTile
          label="Sudah Dikoreksi"
          value={`${pctKoreksi}%`}
          tone={pctKoreksi >= 100 ? "green" : "attention"}
          icon={PencilLine}
          hint={`${dikoreksi} dari ${banding.length} laporan`}
        />
      </div>

      {/* Tren asli vs koreksi */}
      <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
        <BandingChart
          judul="Response Time (RPT)"
          subjudul={`Rata-rata ${SATUAN_EMBER[kerapatan]} · menit`}
          data={dataRpt}
          warna={WARNA_RPT}
          hatchId="arsirRpt"
          satuan="menit"
        />
        <BandingChart
          judul="Recovery Time (RCT)"
          subjudul={`Rata-rata ${SATUAN_EMBER[kerapatan]} · menit`}
          data={dataRct}
          warna={WARNA_RCT}
          hatchId="arsirRct"
          satuan="menit"
        />
      </div>

      {/* Sebaran durasi */}
      <BandingChart
        judul={`Sebaran ${METRIK_LABEL[metrikSebaran]}`}
        subjudul="Jumlah laporan per rentang durasi (menit)"
        data={sebaran}
        warna={metrikSebaran === "rpt" ? WARNA_RPT : WARNA_RCT}
        hatchId="arsirSebaran"
        satuan="laporan"
        kanan={
          <div className="flex items-center gap-1 shrink-0">
            {(["rpt", "rct"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetrikSebaran(m)}
                className={`h-6 px-2 rounded-lg text-[11px] font-semibold transition-colors ${
                  metrikSebaran === m
                    ? "bg-white text-navy-700"
                    : "bg-white/12 text-white hover:bg-white/20"
                }`}
              >
                {m === "rpt" ? "Response" : "Recovery"}
              </button>
            ))}
          </div>
        }
      />

      {/* Rekap angka */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
          <p className="text-xs font-semibold text-ink">{JUDUL_REKAP[kerapatan]}</p>
          <span className="text-xs text-ink-muted ml-auto">
            {barisRekap.length} periode berisi data
          </span>
        </div>

        {barisRekap.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-ink-muted">
            <ClipboardList className="w-9 h-9 opacity-25" />
            <p className="text-sm">Tidak ada laporan pada rentang tanggal ini</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr>
                  {["Periode", "Laporan", "Dikoreksi", "RPT Asli", "RPT Koreksi", "Δ RPT",
                    "RCT Asli", "RCT Koreksi", "Δ RCT"].map((h, i) => (
                    <th
                      key={h}
                      className={`py-2.5 px-3 bg-navy-50 text-navy-600 font-semibold border-b border-line whitespace-nowrap ${
                        i === 0 ? "text-left" : "text-center"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {barisRekap.map((e) => (
                  <tr key={e.penuh} className="border-t border-line hover:bg-surface transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-ink whitespace-nowrap">{e.penuh}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-ink">{e.n}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-ink-soft">
                      {e.dikoreksi > 0 ? e.dikoreksi : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-center text-ink-muted whitespace-nowrap">
                      {fmtMenit(e.rptAsli)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-ink whitespace-nowrap">
                      {fmtMenit(e.rptKoreksi)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <Delta asli={e.rptAsli} koreksi={e.rptKoreksi} />
                    </td>
                    <td className="py-2.5 px-3 text-center text-ink-muted whitespace-nowrap">
                      {fmtMenit(e.rctAsli)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-semibold text-ink whitespace-nowrap">
                      {fmtMenit(e.rctKoreksi)}
                    </td>
                    <td className="py-2.5 px-3 text-center whitespace-nowrap">
                      <Delta asli={e.rctAsli} koreksi={e.rctKoreksi} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line bg-navy-50/60 font-semibold">
                  <td className="py-2.5 px-3 text-ink whitespace-nowrap">Total / Rata-rata</td>
                  <td className="py-2.5 px-3 text-center font-mono text-ink">{banding.length}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-ink">{dikoreksi}</td>
                  <td className="py-2.5 px-3 text-center text-ink-soft whitespace-nowrap">
                    {fmtMenit(rpt.n ? rpt.asli : null)}
                  </td>
                  <td className="py-2.5 px-3 text-center text-ink whitespace-nowrap">
                    {fmtMenit(rpt.n ? rpt.koreksi : null)}
                  </td>
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <Delta asli={rpt.n ? rpt.asli : null} koreksi={rpt.n ? rpt.koreksi : null} />
                  </td>
                  <td className="py-2.5 px-3 text-center text-ink-soft whitespace-nowrap">
                    {fmtMenit(rct.n ? rct.asli : null)}
                  </td>
                  <td className="py-2.5 px-3 text-center text-ink whitespace-nowrap">
                    {fmtMenit(rct.n ? rct.koreksi : null)}
                  </td>
                  <td className="py-2.5 px-3 text-center whitespace-nowrap">
                    <Delta asli={rct.n ? rct.asli : null} koreksi={rct.n ? rct.koreksi : null} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex items-start gap-2 px-4 py-2.5 border-t border-line text-[11px] text-ink-muted">
          <Info size={13} className="shrink-0 mt-px" />
          <p>
            Kolom <b>Koreksi</b> memakai waktu hasil koreksi bila laporan sudah digarap, dan waktu
            asli bila belum — jadi angkanya adalah nilai yang berlaku sekarang, bukan hanya nilai
            laporan yang sudah dikoreksi.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Selisih asli → koreksi. Turun = hijau, naik = merah (warna status dikunci). */
function Delta({ asli, koreksi }: { asli: number | null; koreksi: number | null }) {
  if (asli === null || koreksi === null) return <span className="text-ink-muted">—</span>;
  const selisih = koreksi - asli;
  if (Math.round(selisih) === 0) return <span className="text-ink-muted">—</span>;
  const pct = asli > 0 ? (selisih / asli) * 100 : 0;
  const turun = selisih < 0;
  return (
    <span className={`font-semibold tabular-nums ${turun ? "text-green-700" : "text-red-600"}`}>
      {turun ? "−" : "+"}
      {fmtMenit(Math.abs(selisih))}
      <span className="font-normal text-ink-muted"> ({Math.abs(Math.round(pct))}%)</span>
    </span>
  );
}
