"use client";

import { ClipboardList, Gauge, Scale, SearchCheck, Users, Zap } from "lucide-react";
import DomainCard, { BarList, MiniStats, type BarRow } from "./DomainCard";
import { CHART_OTHER, CHART_SERIES, STATUS_COLOR } from "@/lib/chartColors";
import { STAGE_ORDER, STAGE_RAMP } from "@/app/admin/work-order/_constants";
import type { WoStats } from "@/app/admin/work-order/_lib/woStats";
import type {
  DomainGangguan, DomainGardu, DomainInspeksi, DomainPemerataan, DomainProduktivitas,
} from "../_hooks/useDashboardOverview";

/** Warna status inspeksi. Merah/amber di sini memang berarti "bermasalah",
 *  bukan hiasan — status yang tidak dikenal jatuh ke abu, bukan warna acak. */
const STATUS_INSPEKSI: Record<string, string> = {
  "Temuan": STATUS_COLOR.kritis,
  "Perlu Tindakan": STATUS_COLOR.waspada,
  "Ditugaskan": "#5878C4",
  "Dalam Proses": "#2A4A9C",
};

const pct1 = (n: number) => `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

interface DomainGridProps {
  inspeksi: DomainInspeksi;
  wo: WoStats;
  gardu: DomainGardu;
  pemerataan: DomainPemerataan;
  produktivitas: DomainProduktivitas;
  gangguan: DomainGangguan;
}

export default function DomainGrid({
  inspeksi, wo, gardu, pemerataan, produktivitas, gangguan,
}: DomainGridProps) {
  const statusRows: BarRow[] = inspeksi.byStatus.slice(0, 5).map((s) => ({
    label: s.status,
    value: s.jumlah,
    color: STATUS_INSPEKSI[s.status] ?? CHART_OTHER,
  }));

  const stageRows: BarRow[] = STAGE_ORDER.map((stage, i) => ({
    label: stage,
    value: wo.byStage[stage],
    color: STAGE_RAMP[i],
  }));

  const bebanRows: BarRow[] = gardu.sebaran.map((s, i) => ({
    label: s.rentang,
    value: s.jumlah,
    // Rentang terakhir (≥80%) adalah keadaan bermasalah, jadi merah.
    color: i === gardu.sebaran.length - 1 ? STATUS_COLOR.kritis : STAGE_RAMP[i],
  }));

  return (
    <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
      <DomainCard
        icon={SearchCheck}
        title="Inspeksi"
        value={inspeksi.terbuka}
        unit="terbuka"
        href="/admin/monitoring-inspeksi"
        hrefLabel="Monitoring"
      >
        <BarList rows={statusRows} />
        <MiniStats
          items={[
            { label: "Jaringan baru", value: inspeksi.jaringanBaru },
            { label: "Pohon baru", value: inspeksi.pohonBaru },
            { label: "Selesai periode ini", value: inspeksi.selesai },
          ]}
        />
      </DomainCard>

      <DomainCard
        icon={ClipboardList}
        title="Work Order"
        value={`${wo.pct}%`}
        unit="selesai"
        href="/admin/work-order"
        hrefLabel="Work Order"
      >
        <BarList rows={stageRows} />
        <MiniStats
          items={[
            { label: "Total baris", value: wo.total },
            { label: "Diverifikasi", value: wo.verified },
            { label: "Disetujui", value: wo.approved },
          ]}
        />
      </DomainCard>

      <DomainCard
        icon={Gauge}
        title="Pengukuran Gardu"
        value={gardu.diukur}
        unit="pengukuran"
        href="/admin/pengukuran-gardu"
        hrefLabel="Pengukuran"
      >
        <BarList rows={bebanRows} />
        <MiniStats
          items={[
            { label: "Gardu dipantau", value: gardu.gardhuDipantau },
            { label: "Overload", value: gardu.overload },
            { label: "Rata-rata beban", value: pct1(gardu.avgBeban) },
          ]}
        />
      </DomainCard>

      <DomainCard
        icon={Scale}
        title="Pemerataan Beban"
        value={pemerataan.selesai}
        unit="gardu"
        href="/admin/pengukuran-gardu"
        hrefLabel="Pemerataan"
      >
        {pemerataan.selesai === 0 ? (
          <p className="text-[11px] text-ink-muted">
            Belum ada pemerataan beban pada periode ini.
          </p>
        ) : (
          <BarList
            rows={[
              { label: "Sebelum", value: pemerataan.terbaik?.before ?? 0, color: STATUS_COLOR.waspada },
              { label: "Sesudah", value: pemerataan.terbaik?.after ?? 0, color: STATUS_COLOR.aman },
            ]}
            suffix="%"
          />
        )}
        <MiniStats
          items={[
            { label: "Perbaikan rata-rata", value: pct1(pemerataan.perbaikanRataRata) },
            { label: "Gardu terbaik", value: pemerataan.terbaik?.no_gardu ?? "—" },
            { label: "Total periode", value: pemerataan.selesai },
          ]}
        />
      </DomainCard>

      <DomainCard
        icon={Users}
        title="Produktivitas Petugas"
        value={produktivitas.petugasAktif}
        unit="aktif"
        href="/admin/rekap-produktivitas"
        hrefLabel="Rekap"
      >
        <BarList
          rows={produktivitas.top.map((p) => ({
            label: p.nama,
            value: p.jumlah,
            color: CHART_SERIES[1],
          }))}
        />
        <MiniStats
          items={[
            { label: "Petugas terdaftar", value: produktivitas.totalPetugas },
            { label: "Aktif periode ini", value: produktivitas.petugasAktif },
            {
              label: "Rasio aktif",
              value: produktivitas.totalPetugas
                ? pct1((produktivitas.petugasAktif / produktivitas.totalPetugas) * 100)
                : "—",
            },
          ]}
        />
      </DomainCard>

      <DomainCard
        icon={Zap}
        title="Gangguan Penyulang"
        value={gangguan.total}
        unit="kejadian"
        href="/admin/advanced-dashboard"
        hrefLabel="Analisis"
      >
        <BarList
          rows={gangguan.topPenyulang.map((p) => ({
            label: p.nama,
            value: p.jumlah,
            color: CHART_SERIES[0],
          }))}
        />
        <MiniStats
          items={[
            { label: "Total kejadian", value: gangguan.total },
            { label: "Penyulang terdampak", value: gangguan.topPenyulang.length },
            { label: "Terbanyak", value: gangguan.topPenyulang[0]?.nama ?? "—" },
          ]}
        />
      </DomainCard>
    </div>
  );
}
