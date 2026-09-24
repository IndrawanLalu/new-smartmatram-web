"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { TitikBulan } from "@/app/admin/_components/TrenBulananArsir";
import type { ItemBatang } from "@/app/admin/_components/DaftarBatang";

/**
 * Ringkasan setahun Perabasan — dalam KILOMETER.
 *
 * Capaian = segmen DIVERIFIKASI saja, dibukukan pada tanggal pekerjaannya
 * selesai — aturan yang sama dengan view `wo_perabasan_capaian`. Laporan yang
 * belum diperiksa bukan capaian: kalau ikut dihitung, angkanya turun lagi saat
 * admin mengembalikannya.
 */

interface Item { ulp: string; regu: string | null; panjang_km: number | null; tgl_selesai: string }
interface Wo { target_km: number; pohon_dirabas: number }

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];
const bulat2 = (v: number) => Math.round(v * 100) / 100;

export function useDashboardPerabasan(ulp: string, tahun: number) {
  const [item, setItem] = useState<Item[]>([]);
  const [wo, setWo] = useState<Wo[]>([]);
  const [menunggu, setMenunggu] = useState(0);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const tarik = useCallback(async () => {
    const qItem = () => {
      let x = supabaseBrowser
        .from("wo_perabasan_item")
        .select("ulp,regu,panjang_km,tgl_selesai")
        .eq("status", "Diverifikasi")
        .gte("tgl_selesai", `${tahun - 1}-01-01`)
        .lte("tgl_selesai", `${tahun}-12-31`)
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    const qWo = () => {
      let x = supabaseBrowser
        .from("wo_perabasan_capaian")
        .select("target_km,pohon_dirabas")
        .gte("tgl_wo", `${tahun}-01-01`)
        .lte("tgl_wo", `${tahun}-12-31`)
        .order("wo_id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    let qTunggu = supabaseBrowser.from("wo_perabasan_item").select("id", { count: "exact", head: true }).eq("status", "Selesai");
    if (ulp !== "SEMUA") qTunggu = qTunggu.eq("ulp", ulp);

    try {
      const [i, w, t] = await Promise.all([fetchAllRows<Item>(qItem), fetchAllRows<Wo>(qWo), qTunggu]);
      if (t.error) throw new Error(t.error.message);
      return { i, w, t: t.count ?? 0, error: null as string | null };
    } catch (e) {
      return { i: [] as Item[], w: [] as Wo[], t: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }, [ulp, tahun]);

  useEffect(() => {
    let hidup = true;
    tarik().then((h) => {
      if (!hidup) return;
      setItem(h.i);
      setWo(h.w);
      setMenunggu(h.t);
      setGalat(h.error);
      setLoading(false);
    });
    return () => { hidup = false; };
  }, [tarik]);

  return useMemo(() => {
    const sekarang = new Date();
    const bulanIni = sekarang.getFullYear() === tahun ? sekarang.getMonth() : sekarang.getFullYear() > tahun ? 11 : -1;
    const kmDari = (a: Item[]) => bulat2(a.reduce((n, x) => n + Number(x.panjang_km ?? 0), 0));
    const kini = item.filter((x) => x.tgl_selesai.startsWith(String(tahun)));
    const lalu = item.filter((x) => x.tgl_selesai.startsWith(String(tahun - 1)));

    const bulanan: TitikBulan[] = BULAN_PENDEK.map((label, i) => {
      const k = `-${String(i + 1).padStart(2, "0")}-`;
      return {
        key: label,
        label,
        kini: kmDari(kini.filter((x) => x.tgl_selesai.slice(4, 8) === k)),
        lalu: kmDari(lalu.filter((x) => x.tgl_selesai.slice(4, 8) === k)),
        lewat: i <= bulanIni,
        berjalan: i === bulanIni && sekarang.getFullYear() === tahun,
      };
    });

    const capaian = kmDari(kini);
    const laluSetara = bulat2(bulanan.filter((b) => b.lewat).reduce((a, b) => a + b.lalu, 0));
    const target = bulat2(wo.reduce((a, x) => a + Number(x.target_km ?? 0), 0));

    const perUlp: ItemBatang[] = UNIT.filter((u) => ulp === "SEMUA" || u === ulp).map((u) => ({
      label: u,
      jumlah: kmDari(kini.filter((x) => x.ulp === u)),
    }));
    const perRegu = new Map<string, number>();
    for (const x of kini) {
      const k = x.regu ?? "Tanpa regu";
      perRegu.set(k, bulat2((perRegu.get(k) ?? 0) + Number(x.panjang_km ?? 0)));
    }

    return {
      loading,
      galat,
      bulanan,
      capaian,
      laluSetara,
      target,
      persen: target > 0 ? Math.round((capaian / target) * 100) : null,
      segmen: kini.length,
      menunggu,
      pohon: wo.reduce((a, x) => a + Number(x.pohon_dirabas ?? 0), 0),
      perUlp,
      perRegu: [...perRegu.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, jumlah]) => ({ label, jumlah })),
    };
  }, [item, wo, menunggu, loading, galat, tahun, ulp]);
}
