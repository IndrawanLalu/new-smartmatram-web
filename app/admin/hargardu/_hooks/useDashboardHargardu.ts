"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { TitikBulan } from "@/app/admin/_components/TrenBulananArsir";
import type { ItemBatang } from "@/app/admin/_components/DaftarBatang";

/**
 * Tren setahun Pemeliharaan Gardu untuk dashboard ringkas: jumlah pekerjaan
 * per bulan (menurut tanggal selesai, tanpa yang dibatalkan) dan yang
 * menunggu persetujuan. Keadaan gardu per item datang dari `useHargarduRekap`
 * — itu keadaan TERKINI, bukan per tahun.
 */

interface Baris { tgl_selesai: string; ulp: string; status: string }

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export function useDashboardHargardu(ulp: string, tahun: number) {
  const [data, setData] = useState<Baris[]>([]);
  const [menunggu, setMenunggu] = useState(0);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const tarik = useCallback(async () => {
    const q = () => {
      let x = supabaseBrowser
        .from("pemeliharaan_gardu")
        .select("tgl_selesai,ulp,status")
        .neq("status", "Dibatalkan")
        .gte("tgl_selesai", `${tahun - 1}-01-01`)
        .lte("tgl_selesai", `${tahun}-12-31T23:59:59`)
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    let qTunggu = supabaseBrowser.from("pemeliharaan_gardu").select("id", { count: "exact", head: true }).eq("status", "Selesai");
    if (ulp !== "SEMUA") qTunggu = qTunggu.eq("ulp", ulp);
    try {
      const [rows, t] = await Promise.all([fetchAllRows<Baris>(q), qTunggu]);
      if (t.error) throw new Error(t.error.message);
      return { rows, tunggu: t.count ?? 0, error: null as string | null };
    } catch (e) {
      return { rows: [] as Baris[], tunggu: 0, error: e instanceof Error ? e.message : String(e) };
    }
  }, [ulp, tahun]);

  useEffect(() => {
    let hidup = true;
    tarik().then((h) => {
      if (!hidup) return;
      setData(h.rows);
      setMenunggu(h.tunggu);
      setGalat(h.error);
      setLoading(false);
    });
    return () => { hidup = false; };
  }, [tarik]);

  return useMemo(() => {
    const sekarang = new Date();
    const bulanIni = sekarang.getFullYear() === tahun ? sekarang.getMonth() : sekarang.getFullYear() > tahun ? 11 : -1;
    const kini = data.filter((b) => b.tgl_selesai.startsWith(String(tahun)));
    const lalu = data.filter((b) => b.tgl_selesai.startsWith(String(tahun - 1)));

    const bulanan: TitikBulan[] = BULAN_PENDEK.map((label, i) => {
      const k = `-${String(i + 1).padStart(2, "0")}-`;
      return {
        key: label,
        label,
        kini: kini.filter((b) => b.tgl_selesai.slice(4, 8) === k).length,
        lalu: lalu.filter((b) => b.tgl_selesai.slice(4, 8) === k).length,
        lewat: i <= bulanIni,
        berjalan: i === bulanIni && sekarang.getFullYear() === tahun,
      };
    });

    const perUlp: ItemBatang[] = UNIT.filter((u) => ulp === "SEMUA" || u === ulp).map((u) => ({
      label: u,
      jumlah: kini.filter((b) => b.ulp === u).length,
      menunggu: kini.filter((b) => b.ulp === u && b.status === "Selesai").length,
    }));

    return {
      loading,
      galat,
      bulanan,
      total: kini.length,
      laluSetara: bulanan.filter((b) => b.lewat).reduce((a, b) => a + b.lalu, 0),
      menunggu,
      perUlp,
    };
  }, [data, menunggu, loading, galat, tahun, ulp]);
}
