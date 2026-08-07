"use client";

import { ClipboardList, Users } from "lucide-react";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import { CHART_SERIES } from "@/lib/chartColors";
import { STAGE_ORDER, STAGE_RAMP } from "@/app/admin/work-order/_constants";
import type { WoStats } from "@/app/admin/work-order/_lib/woStats";
import SectionHeader, { StatRingkas } from "./SectionHeader";
import { BarList, type BarRow } from "./DomainCard";
import type { DomainProduktivitas } from "../_hooks/useDashboardOverview";

const pct1 = (n: number) => `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

interface Props {
  wo: WoStats;
  produktivitas: DomainProduktivitas;
}

export default function SeksiPekerjaan({ wo, produktivitas }: Props) {
  const stageRows: BarRow[] = STAGE_ORDER.map((stage, i) => ({
    label: stage,
    value: wo.byStage[stage],
    color: STAGE_RAMP[i],
  }));

  const rasio = produktivitas.totalPetugas
    ? (produktivitas.petugasAktif / produktivitas.totalPetugas) * 100
    : null;

  return (
    <section className="space-y-3">
      <SectionHeader
        id="seksi-pekerjaan"
        icon={ClipboardList}
        judul="Work Order & Petugas"
        keterangan="Realisasi work order bulanan dan keaktifan petugas di seluruh jenis pekerjaan."
        href="/admin/work-order"
        hrefLabel="Work Order"
      />

      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        <StatRingkas
          label="Realisasi WO" nilai={`${wo.pct}%`} catatan={`${wo.selesai} dari ${wo.total} baris`}
          nada={wo.pct >= 80 ? "aman" : wo.pct >= 50 ? "waspada" : "netral"}
        />
        <StatRingkas label="Diverifikasi" nilai={wo.verified} catatan="oleh pengawas" />
        <StatRingkas label="Disetujui" nilai={wo.approved} catatan="tahap akhir" />
        <StatRingkas
          label="Lewat SLA" nilai={wo.slaNot} catatan="verifikasi di luar batas"
          nada={wo.slaNot > 0 ? "waspada" : "netral"}
          href="/admin/work-order"
        />
        <StatRingkas
          label="Petugas Aktif" nilai={produktivitas.petugasAktif}
          catatan={rasio !== null ? `${pct1(rasio)} dari ${produktivitas.totalPetugas}` : "belum ada data"}
        />
      </div>

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        <div className={`${CARD} p-4`}>
          <p className={EYEBROW}>Tahapan Work Order</p>
          <div className="mt-2">
            <BarList rows={stageRows} />
          </div>
        </div>
        <div className={`${CARD} p-4`}>
          <div className="flex items-center gap-1.5">
            <Users size={13} className="text-ink-muted shrink-0" />
            <p className={EYEBROW}>Petugas Paling Produktif</p>
          </div>
          <div className="mt-2">
            <BarList
              rows={produktivitas.top.map((p) => ({
                label: p.nama, value: p.jumlah, color: CHART_SERIES[1],
              }))}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
