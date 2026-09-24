"use client";

import { Clock, Layers, Ruler, Target, Trees, TriangleAlert, Users } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import TrenBulananArsir from "@/app/admin/_components/TrenBulananArsir";
import DaftarBatang from "@/app/admin/_components/DaftarBatang";
import { useDashboardPerabasan } from "../_hooks/useDashboardPerabasan";

/**
 * Dashboard ringkas Perabasan Pohon — pola sama dengan modul Kinerja
 * Pelayanan Teknik lain (teknisaplikasi.md butir 7), satuannya KM.
 */

const angkaKm = (v: number) => v.toLocaleString("id-ID", { maximumFractionDigits: 2 });

export default function DashboardPerabasan({ ulp, tahun }: { ulp: string; tahun: number }) {
  const d = useDashboardPerabasan(ulp, tahun);

  if (d.galat) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-amber-800">
          Dashboard gagal dimuat: {d.galat} — angka nol di sini tidak berarti tidak ada pekerjaan.
        </p>
      </div>
    );
  }

  const nol = d.loading ? "…" : undefined;
  const pct = d.laluSetara > 0 ? ((d.capaian - d.laluSetara) / d.laluSetara) * 100 : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={`Capaian ${tahun}`}
          value={nol ?? `${angkaKm(d.capaian)} km`}
          icon={Ruler}
          tone="green"
          delta={pct !== undefined ? { pct, vs: `${tahun - 1} periode sama` } : undefined}
          hint={`${d.segmen} segmen diverifikasi`}
        />
        <StatTile
          label={`Target WO ${tahun}`}
          value={nol ?? `${angkaKm(d.target)} km`}
          icon={Target}
          tone="navy"
          hint={d.persen !== null ? `${d.persen}% tercapai` : "Belum ada WO terbit"}
        />
        <StatTile
          label="Menunggu verifikasi"
          value={nol ?? d.menunggu.toLocaleString("id-ID")}
          icon={Clock}
          tone="attention"
          hint="Segmen selesai dikerjakan regu, belum diperiksa"
        />
        <StatTile
          label="Pohon dirabas"
          value={nol ?? d.pohon.toLocaleString("id-ID")}
          icon={Trees}
          tone="accent"
          hint={`Dari WO terbit ${tahun}`}
        />
      </div>

      <div className="h-[320px]">
        <TrenBulananArsir
          data={d.bulanan}
          tahun={tahun}
          judul="Perabasan Pohon — km diverifikasi"
          satuan="km"
          ikon={Trees}
          loading={d.loading}
          idArsir="arsirRabas"
          desimal
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DaftarBatang judul={`Per ULP · ${tahun}`} ikon={Layers} item={d.perUlp} satuan="km" />
        <DaftarBatang judul={`Per regu · ${tahun}`} ikon={Users} item={d.perRegu} satuan="km" kosong="Belum ada segmen diverifikasi" />
      </div>
    </div>
  );
}
