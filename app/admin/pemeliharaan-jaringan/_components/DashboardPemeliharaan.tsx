"use client";

import { CheckCircle2, Clock, HardHat, Layers, Network, TriangleAlert, Wrench } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import TrenBulananArsir from "@/app/admin/_components/TrenBulananArsir";
import DaftarBatang from "@/app/admin/_components/DaftarBatang";
import type { KategoriRef } from "../_hooks/usePemeliharaanJaringan";
import { useDashboardPemeliharaan } from "../_hooks/useDashboardPemeliharaan";

/**
 * Dashboard ringkas Pemeliharaan Jaringan — pola untuk semua modul Kinerja
 * Pelayanan Teknik: empat kartu angka, satu tren bulanan, dua rincian.
 * Ikut penyaring ULP & tahun halaman; bulan diabaikan (dashboard = setahun).
 */

interface Props {
  ulp: string;
  tahun: number;
  kategori: KategoriRef[];
}

export default function DashboardPemeliharaan({ ulp, tahun, kategori }: Props) {
  const d = useDashboardPemeliharaan(ulp, tahun, kategori);

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

  const pct = d.laluSetara > 0 ? ((d.total - d.laluSetara) / d.laluSetara) * 100 : undefined;
  const persenVerif = d.total > 0 ? Math.round((d.diverifikasi / d.total) * 100) : 0;
  const nol = d.loading ? "…" : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={`Pekerjaan ${tahun}`}
          value={nol ?? d.total.toLocaleString("id-ID")}
          icon={Wrench}
          tone="navy"
          delta={pct !== undefined ? { pct, vs: `${tahun - 1} periode sama` } : undefined}
        />
        <StatTile
          label="Menunggu verifikasi"
          value={nol ?? d.menunggu.toLocaleString("id-ID")}
          icon={Clock}
          tone="attention"
          hint="Sudah dikirim regu, belum diperiksa admin"
        />
        <StatTile
          label="Terverifikasi"
          value={nol ?? `${persenVerif}%`}
          icon={CheckCircle2}
          tone="green"
          hint={`${d.diverifikasi.toLocaleString("id-ID")} dari ${d.total.toLocaleString("id-ID")} pekerjaan`}
        />
        <StatTile
          label="JTM · JTR"
          value={nol ?? `${d.jtm} · ${d.jtr}`}
          icon={Network}
          tone="accent"
          hint="Jumlah pekerjaan per jenis jaringan"
        />
      </div>

      <div className="h-[320px]">
        <TrenBulananArsir
          data={d.bulanan}
          tahun={tahun}
          judul="Pemeliharaan Jaringan"
          satuan="pekerjaan"
          ikon={HardHat}
          loading={d.loading}
          idArsir="arsirHarjar"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DaftarBatang judul={`Per ULP · ${tahun}`} ikon={Layers} item={d.perUlp} satuan="pekerjaan" />
        <DaftarBatang judul={`Per kategori · ${tahun}`} ikon={Wrench} item={d.perKategori} satuan="pekerjaan" />
      </div>
    </div>
  );
}
