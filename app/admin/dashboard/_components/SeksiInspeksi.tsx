"use client";

import { SearchCheck, TreePine } from "lucide-react";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import { CHART_OTHER, STATUS_COLOR } from "@/lib/chartColors";
import SectionHeader, { StatRingkas } from "./SectionHeader";
import { BarList, type BarRow } from "./DomainCard";
import type { DomainInspeksi } from "../_hooks/useDashboardOverview";

/** Warna status inspeksi. Merah/amber di sini memang berarti "bermasalah",
 *  bukan hiasan — status yang tidak dikenal jatuh ke abu, bukan warna acak. */
const STATUS_INSPEKSI: Record<string, string> = {
  "Temuan": STATUS_COLOR.kritis,
  "Perlu Tindakan": STATUS_COLOR.waspada,
  "Ditugaskan": "#5878C4",
  "Dalam Proses": "#2A4A9C",
};

export default function SeksiInspeksi({ inspeksi }: { inspeksi: DomainInspeksi }) {
  const statusRows: BarRow[] = inspeksi.byStatus.slice(0, 5).map((s) => ({
    label: s.status,
    value: s.jumlah,
    color: STATUS_INSPEKSI[s.status] ?? CHART_OTHER,
  }));

  return (
    <section className="space-y-3">
      <SectionHeader
        id="seksi-inspeksi"
        icon={SearchCheck}
        judul="Inspeksi Jaringan & Pohon"
        keterangan="Temuan terbuka dihitung tanpa batas tanggal — temuan lama yang belum ditutup tetap tunggakan hari ini."
        href="/admin/monitoring-inspeksi"
        hrefLabel="Monitoring Inspeksi"
      />

      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
        <StatRingkas
          label="Belum Selesai" nilai={inspeksi.terbuka} catatan="seluruh temuan terbuka"
          nada={inspeksi.terbuka > 0 ? "waspada" : "aman"}
          href="/admin/monitoring-inspeksi"
        />
        <StatRingkas label="Temuan Jaringan" nilai={inspeksi.jaringanBaru} catatan="baru pada periode ini" />
        <StatRingkas label="Temuan Pohon" nilai={inspeksi.pohonBaru} catatan="baru pada periode ini" />
        <StatRingkas label="Selesai" nilai={inspeksi.selesai} catatan="ditutup pada periode ini" nada="aman" />
        <StatRingkas
          label="Risiko Sangat Tinggi" nilai={inspeksi.risikoSangatTinggi} catatan="pohon, belum dikerjakan"
          nada={inspeksi.risikoSangatTinggi > 0 ? "kritis" : "netral"}
        />
      </div>

      <div className={`${CARD} p-4`}>
        <div className="flex items-center gap-1.5">
          <TreePine size={13} className="text-ink-muted shrink-0" />
          <p className={EYEBROW}>Sebaran Status Temuan Terbuka</p>
        </div>
        <div className="mt-2">
          <BarList rows={statusRows} />
        </div>
      </div>
    </section>
  );
}
