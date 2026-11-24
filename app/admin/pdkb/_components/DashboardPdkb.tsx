"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, HardHat, Layers, Network, TriangleAlert, Wrench } from "lucide-react";
import StatTile from "@/app/admin/_components/StatTile";
import TrenBulananArsir, { type TitikBulan } from "@/app/admin/_components/TrenBulananArsir";
import DaftarBatang, { type ItemBatang } from "@/app/admin/_components/DaftarBatang";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { UNIT } from "../_hooks/usePdkb";
import { belumSelesai } from "../_hooks/useTugasPdkb";

/**
 * Dashboard PDKB — pola Kinerja Yantek (teknisaplikasi.md butir 7): empat
 * kartu, satu tren bulanan, dua rincian. Ikut ULP & tahun; catatan
 * Dibatalkan tidak dihitung.
 */

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

interface Props {
  ulp: string;
  tahun: number;
}

interface Kerja { tgl: string; ulp: string; jenis: string; inspeksi_id: string | null }
interface Tugas { status: string; assigned_at: string | null }

export default function DashboardPdkb({ ulp, tahun }: Props) {
  const [kerja, setKerja] = useState<Kerja[]>([]);
  const [tugas, setTugas] = useState<Tugas[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    Promise.all([
      fetchAllRows<Kerja>(() => {
        let x = supabaseBrowser.from("pdkb_pekerjaan").select("tgl,ulp,jenis,inspeksi_id")
          .eq("status", "Tercatat").gte("tgl", `${tahun - 1}-01-01`).lte("tgl", `${tahun}-12-31`).order("id");
        if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
        return x;
      }),
      fetchAllRows<Tugas>(() => {
        let x = supabaseBrowser.from("pdkb_tugas").select("status,assigned_at").order("id");
        if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
        return x;
      }),
    ]).then(
      ([k, t]) => { if (hidup) { setKerja(k); setTugas(t); setGalat(null); setLoading(false); } },
      (e: Error) => { if (hidup) { setGalat(e.message); setLoading(false); } },
    );
    return () => { hidup = false; };
  }, [ulp, tahun]);

  const d = useMemo(() => {
    const sekarang = new Date();
    const bulanIni = sekarang.getFullYear() === tahun ? sekarang.getMonth() : sekarang.getFullYear() > tahun ? 11 : -1;
    const kini = kerja.filter((b) => b.tgl.startsWith(String(tahun)));
    const lalu = kerja.filter((b) => b.tgl.startsWith(String(tahun - 1)));
    const bulanan: TitikBulan[] = BULAN_PENDEK.map((label, i) => {
      const k = `-${String(i + 1).padStart(2, "0")}-`;
      return {
        key: label, label,
        kini: kini.filter((b) => b.tgl.slice(4, 8) === k).length,
        lalu: lalu.filter((b) => b.tgl.slice(4, 8) === k).length,
        lewat: i <= bulanIni,
        berjalan: i === bulanIni && sekarang.getFullYear() === tahun,
      };
    });
    const laluSetara = bulanan.filter((b) => b.lewat).reduce((a, b) => a + b.lalu, 0);
    // Tugas yang masih terbuka dihitung SEMUA (tunggakan), yang lain ikut tahun ditugaskan.
    const terbuka = tugas.filter((t) => belumSelesai(t.status)).length;
    const tugasTahun = tugas.filter((t) => t.assigned_at?.startsWith(String(tahun)) && t.status !== "Dibatalkan" && t.status !== "Batal");
    const selesai = tugasTahun.filter((t) => t.status === "Selesai").length;
    const perUlp: ItemBatang[] = UNIT.map((u) => ({ label: u, jumlah: kini.filter((b) => b.ulp === u).length }))
      .filter((i) => ulp === "SEMUA" || i.label === ulp);
    const perJenis: ItemBatang[] = [
      { label: "Dari tugas temuan", jumlah: kini.filter((b) => b.inspeksi_id).length },
      { label: "Di luar tugas", jumlah: kini.filter((b) => !b.inspeksi_id).length },
    ];
    return {
      bulanan, laluSetara, total: kini.length, terbuka, selesai, tugasTahun: tugasTahun.length,
      jtm: kini.filter((b) => b.jenis === "JTM").length,
      gardu: kini.filter((b) => b.jenis === "GARDU").length,
      jtr: kini.filter((b) => b.jenis === "JTR").length,
      perUlp, perJenis,
    };
  }, [kerja, tugas, tahun, ulp]);

  if (galat) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-amber-800">Dashboard gagal dimuat: {galat} — angka nol di sini tidak berarti tidak ada pekerjaan.</p>
      </div>
    );
  }

  const nol = loading ? "…" : undefined;
  const pct = d.laluSetara > 0 ? ((d.total - d.laluSetara) / d.laluSetara) * 100 : undefined;
  const persen = d.tugasTahun > 0 ? Math.round((d.selesai / d.tugasTahun) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label={`Pekerjaan ${tahun}`} value={nol ?? d.total.toLocaleString("id-ID")} icon={Wrench} tone="navy"
          delta={pct !== undefined ? { pct, vs: `${tahun - 1} periode sama` } : undefined} />
        <StatTile label="Tugas belum dikerjakan" value={nol ?? d.terbuka.toLocaleString("id-ID")} icon={ClipboardList} tone="attention"
          hint="Semua bulan — tunggakan tidak hilang" />
        <StatTile label="Tugas selesai" value={nol ?? `${persen}%`} icon={CheckCircle2} tone="green"
          hint={`${d.selesai.toLocaleString("id-ID")} dari ${d.tugasTahun.toLocaleString("id-ID")} tugas ${tahun}`} />
        <StatTile label="JTM · Gardu · JTR" value={nol ?? `${d.jtm} · ${d.gardu} · ${d.jtr}`} icon={Network} tone="accent"
          hint="Jumlah pekerjaan per jenis" />
      </div>
      <div className="h-[320px]">
        <TrenBulananArsir data={d.bulanan} tahun={tahun} judul="Pekerjaan PDKB" satuan="pekerjaan" ikon={HardHat} loading={loading} idArsir="arsirPdkb" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DaftarBatang judul={`Per ULP · ${tahun}`} ikon={Layers} item={d.perUlp} satuan="pekerjaan" />
        <DaftarBatang judul={`Asal pekerjaan · ${tahun}`} ikon={ClipboardList} item={d.perJenis} satuan="pekerjaan" />
      </div>
    </div>
  );
}
