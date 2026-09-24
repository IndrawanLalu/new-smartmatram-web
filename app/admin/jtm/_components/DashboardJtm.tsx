"use client";

import { Clock, Network, Ruler, TowerControl, TreePine, TriangleAlert } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import TrenBulananArsir from "@/app/admin/_components/TrenBulananArsir";
import DaftarBatang from "@/app/admin/_components/DaftarBatang";
import { useDashboardJtm } from "../_hooks/useDashboardJtm";

/**
 * Dashboard ringkas Inspeksi JTM — pola Kinerja Pelayanan Teknik
 * (teknisaplikasi.md butir 7). Kartu & tren per tahun; cakupan dan temuan
 * adalah keadaan TERKINI jaringan (hanya inspeksi yang sudah disetujui).
 */

const angkaKm = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })} km`;

export default function DashboardJtm({ ulp, tahun }: { ulp: string; tahun: number }) {
  const d = useDashboardJtm(ulp, tahun);

  if (d.galat) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-amber-800">Dashboard gagal dimuat: {d.galat} — angka nol di sini tidak berarti tidak ada pekerjaan.</p>
      </div>
    );
  }

  const nol = d.loading ? "…" : undefined;
  const pct = d.kmLaluSetara > 0 ? ((d.km - d.kmLaluSetara) / d.kmLaluSetara) * 100 : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={`Diinspeksi ${tahun}`}
          value={nol ?? angkaKm(d.km)}
          icon={Ruler}
          tone="navy"
          delta={pct !== undefined ? { pct, vs: `${tahun - 1} periode sama` } : undefined}
          hint={`${d.segmen} segmen selesai disusuri`}
        />
        <StatTile
          label="Menunggu persetujuan"
          value={nol ?? d.menunggu.toLocaleString("id-ID")}
          icon={Clock}
          tone="attention"
          hint="Belum terhitung sebelum disetujui"
        />
        <StatTile
          label="Cakupan tiang"
          value={nol ?? (d.tiang > 0 ? `${((d.tiangDinilai / d.tiang) * 100).toFixed(1)}%` : "—")}
          icon={TowerControl}
          tone="green"
          hint={`${d.tiangDinilai.toLocaleString("id-ID")} dari ${d.tiang.toLocaleString("id-ID")} tiang segmen aktif`}
        />
        <StatTile
          label="Tiang bertemuan"
          value={nol ?? d.tiangBertemuan.toLocaleString("id-ID")}
          icon={TriangleAlert}
          tone="accent"
          hint="Keadaan terakhir yang disetujui, termasuk ROW"
        />
      </div>

      <div className="h-[320px]">
        <TrenBulananArsir
          data={d.bulanan}
          tahun={tahun}
          judul="Inspeksi JTM — km diinspeksi"
          satuan="km"
          ikon={Network}
          loading={d.loading}
          idArsir="arsirJtm"
          desimal
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DaftarBatang
          judul={d.loading ? "Temuan · memuat…" : "Temuan · jumlah tiang"}
          ikon={TriangleAlert}
          item={d.temuan}
          satuan="tiang"
          kosong="Tidak ada temuan pada inspeksi yang sudah disetujui."
        />
        <DaftarBatang
          judul={d.loading ? "Penghalang jalur (ROW) · memuat…" : "Penghalang jalur (ROW) · jumlah tiang"}
          ikon={TreePine}
          item={d.row}
          satuan="tiang"
          kosong="Tidak ada tiang rawan ROW."
        />
      </div>
    </div>
  );
}
