"use client";

import dynamic from "next/dynamic";
import { Zap } from "lucide-react";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import { CHART_SERIES } from "@/lib/chartColors";
import SectionHeader, { StatRingkas } from "./SectionHeader";
import { BarList } from "./DomainCard";
import RisikoPanel from "./RisikoPanel";
import type {
  ChartPoint, DomainGangguan, DomainPadam, PeriodKey,
} from "../_hooks/useDashboardOverview";

const TrenGangguan = dynamic(() => import("./TrenGangguan"), {
  ssr: false,
  loading: () => <div className={`${CARD} h-full min-h-[300px] animate-pulse`} />,
});

const angka = (n: number) => n.toLocaleString("id-ID", { maximumFractionDigits: 0 });

interface Props {
  gangguan: DomainGangguan;
  padam: DomainPadam;
  trenChart: ChartPoint[];
  period: PeriodKey;
  risiko: React.ComponentProps<typeof RisikoPanel>;
  loading: boolean;
}

export default function SeksiGangguan({ gangguan, padam, trenChart, period, risiko, loading }: Props) {
  return (
    <section className="space-y-3">
      <SectionHeader
        id="seksi-gangguan"
        icon={Zap}
        judul="Gangguan Penyulang"
        keterangan="Jumlah kejadian dari Google Sheets; dampak pelanggan dari data padam APKT."
        href="/admin/advanced-dashboard"
        hrefLabel="Advanced Analytics"
      />

      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        <StatRingkas label="Kejadian" nilai={gangguan.total} catatan="pada periode ini" />
        <StatRingkas label="Padam APKT" nilai={padam.total} catatan="tercatat di APKT" />
        <StatRingkas
          label="Pelanggan Padam" nilai={angka(padam.pelangganPadam)} catatan="akumulasi periode"
          nada={padam.pelangganPadam > 0 ? "waspada" : "netral"}
        />
        <StatRingkas
          label="ENS" nilai={angka(padam.ens)} satuan="kWh" catatan="energi tak tersalurkan"
        />
        <StatRingkas
          label="Durasi Padam" nilai={padam.durasiRataRata.toFixed(1)} satuan="jam" catatan="rata-rata per kejadian"
        />
      </div>

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrenGangguan data={trenChart} period={period} loading={loading} />
        </div>
        <RisikoPanel {...risiko} />
      </div>

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        <div className={`${CARD} p-4`}>
          <p className={EYEBROW}>Penyulang Terbanyak Terganggu</p>
          <div className="mt-2">
            <BarList
              rows={gangguan.topPenyulang.map((p) => ({
                label: p.nama, value: p.jumlah, color: CHART_SERIES[0],
              }))}
            />
          </div>
        </div>
        <div className={`${CARD} p-4`}>
          <p className={EYEBROW}>Penyebab Padam Terbanyak</p>
          <div className="mt-2">
            <BarList
              rows={padam.topPenyebab.map((p) => ({
                label: p.nama, value: p.jumlah, color: CHART_SERIES[2],
              }))}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
