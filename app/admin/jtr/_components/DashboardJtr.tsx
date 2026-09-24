"use client";

import { Cable, Clock, MapPinOff, Network, Ruler, TreePine, TriangleAlert } from "lucide-react";
import type { CurrentUser } from "@/lib/roles";
import StatTile from "@/app/admin/_components/StatTile";
import TrenBulananArsir from "@/app/admin/_components/TrenBulananArsir";
import DaftarBatang from "@/app/admin/_components/DaftarBatang";
import { useJtrRekap } from "../_hooks/useJtrRekap";
import { useDashboardJtr } from "../_hooks/useDashboardJtr";

/**
 * Dashboard ringkas Inspeksi JTR — pola Kinerja Pelayanan Teknik
 * (teknisaplikasi.md butir 7). Kartu & tren per tahun; panjang jaringan,
 * cakupan, temuan, dan ROW adalah keadaan TERKINI jaringan.
 *
 * Temuan DITURUNKAN dari kondisi tiang yang tercatat (bukan kolom kesimpulan
 * yang diisi manusia), dihitung per TIANG.
 */

const angkaKm = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 2 })} km`;

export default function DashboardJtr({ user, ulp, tahun }: { user: CurrentUser; ulp: string; tahun: number }) {
  const d = useDashboardJtr(ulp, tahun);
  const r = useJtrRekap(user, ulp);

  const galat = d.galat ?? r.error;
  if (galat) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-amber-800">Dashboard gagal dimuat: {galat} — angka nol di sini tidak berarti tidak ada pekerjaan.</p>
      </div>
    );
  }

  const nol = d.loading ? "…" : undefined;
  const nolRekap = r.loading ? "…" : undefined;
  const pct = d.kmLaluSetara > 0 ? ((d.km - d.kmLaluSetara) / d.kmLaluSetara) * 100 : undefined;
  const garduMaster = r.cakupan.reduce((s, c) => s + Number(c.gardu_master ?? 0), 0);
  const inspeksi12 = r.cakupan.reduce((s, c) => s + Number(c.diinspeksi_12_bulan ?? 0), 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={`Diinspeksi ${tahun}`}
          value={nol ?? angkaKm(d.km)}
          icon={Ruler}
          tone="navy"
          delta={pct !== undefined ? { pct, vs: `${tahun - 1} periode sama` } : undefined}
          hint={`${d.gardu} gardu selesai ditelusuri`}
        />
        <StatTile
          label="Menunggu persetujuan"
          value={nol ?? d.menunggu.toLocaleString("id-ID")}
          icon={Clock}
          tone="attention"
          hint="Inspeksi gardu yang sudah ditutup petugas"
        />
        <StatTile
          label="Panjang penghantar"
          value={nolRekap ?? angkaKm(r.total.penghantar)}
          icon={Cable}
          tone="accent"
          hint={`Rute ${angkaKm(r.total.rute)} · ${r.total.jumlahTiang.toLocaleString("id-ID")} tiang`}
        />
        <StatTile
          label="Cakupan 12 bulan"
          value={nolRekap ?? (garduMaster > 0 ? `${((inspeksi12 / garduMaster) * 100).toFixed(1)}%` : "—")}
          icon={MapPinOff}
          tone="green"
          hint={`${inspeksi12.toLocaleString("id-ID")} dari ${garduMaster.toLocaleString("id-ID")} gardu · ${r.belumBertitik} belum bertitik`}
        />
      </div>

      <div className="h-[320px]">
        <TrenBulananArsir
          data={d.bulanan}
          tahun={tahun}
          judul="Inspeksi JTR — km diinspeksi"
          satuan="km"
          ikon={Network}
          loading={d.loading}
          idArsir="arsirJtr"
          desimal
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DaftarBatang
          judul={r.loading ? "Temuan · memuat…" : "Temuan · jumlah tiang"}
          ikon={TriangleAlert}
          item={r.temuan.map((t) => ({ label: t.label, jumlah: t.jumlah }))}
          satuan="tiang"
          kosong="Tidak ada temuan pada tiang yang tercatat."
        />
        <DaftarBatang
          judul={r.loading ? "Penghalang jalur (ROW) · memuat…" : "Penghalang jalur (ROW) · jumlah tiang"}
          ikon={TreePine}
          item={r.penghalang.map(([label, jumlah]) => ({ label, jumlah }))}
          satuan="tiang"
          kosong="Tidak ada tiang rawan ROW."
        />
      </div>
    </div>
  );
}
