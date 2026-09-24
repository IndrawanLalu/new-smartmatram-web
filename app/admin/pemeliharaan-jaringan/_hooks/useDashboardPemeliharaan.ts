"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { TitikBulan } from "@/app/admin/_components/TrenBulananArsir";
import type { ItemBatang } from "@/app/admin/_components/DaftarBatang";
import type { KategoriRef } from "./usePemeliharaanJaringan";

/**
 * Ringkasan satu tahun untuk tab Dashboard — ikut penyaring ULP & tahun
 * halaman. Yang ditarik hanya kolom yang dihitung (tanggal, ULP, jenis,
 * kategori, status), dua tahun (tahun terpilih + pembanding), dan dipaginasi
 * penuh (teknisaplikasi.md butir 13).
 *
 * Catatan Dibatalkan TIDAK dihitung — salah input bukan pekerjaan.
 */

interface Baris {
  tgl: string;
  ulp: string;
  jenis: string;
  kategori: string;
  status: string;
}

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export function useDashboardPemeliharaan(ulp: string, tahun: number, kategori: KategoriRef[]) {
  const [data, setData] = useState<Baris[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const tarik = useCallback(async () => {
    const q = () => {
      let x = supabaseBrowser
        .from("pemeliharaan_jaringan")
        .select("tgl,ulp,jenis,kategori,status")
        .neq("status", "Dibatalkan")
        .gte("tgl", `${tahun - 1}-01-01`)
        .lte("tgl", `${tahun}-12-31`)
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    return fetchAllRows<Baris>(q).then(
      (rows) => ({ rows, error: null as string | null }),
      (e: Error) => ({ rows: [] as Baris[], error: e.message }),
    );
  }, [ulp, tahun]);

  useEffect(() => {
    let hidup = true;
    tarik().then((h) => {
      if (!hidup) return;
      setData(h.rows);
      setGalat(h.error);
      setLoading(false);
    });
    return () => { hidup = false; };
  }, [tarik]);

  return useMemo(() => {
    const sekarang = new Date();
    const bulanIni = sekarang.getFullYear() === tahun ? sekarang.getMonth() : sekarang.getFullYear() > tahun ? 11 : -1;
    const kini = data.filter((b) => b.tgl.startsWith(String(tahun)));
    const lalu = data.filter((b) => b.tgl.startsWith(String(tahun - 1)));

    const bulanan: TitikBulan[] = BULAN_PENDEK.map((label, i) => {
      const k = `-${String(i + 1).padStart(2, "0")}-`;
      return {
        key: label,
        label,
        kini: kini.filter((b) => b.tgl.slice(4, 8) === k).length,
        lalu: lalu.filter((b) => b.tgl.slice(4, 8) === k).length,
        lewat: i <= bulanIni,
        berjalan: i === bulanIni && sekarang.getFullYear() === tahun,
      };
    });

    // Pembanding "tahun lalu" = periode yang sama (s.d. bulan berjalan), bukan
    // setahun penuh — tahun yang baru jalan sembilan bulan selalu kalah dari
    // dua belas bulan penuh.
    const laluSetara = bulanan.filter((b) => b.lewat).reduce((a, b) => a + b.lalu, 0);
    const menunggu = kini.filter((b) => b.status === "Selesai").length;

    const perUlp: ItemBatang[] = UNIT.map((u) => ({
      label: u,
      jumlah: kini.filter((b) => b.ulp === u).length,
      menunggu: kini.filter((b) => b.ulp === u && b.status === "Selesai").length,
    })).filter((i) => ulp === "SEMUA" || i.label === ulp);

    const label = new Map(kategori.map((k) => [k.kode, k.label]));
    const hitungKat = new Map<string, number>();
    for (const b of kini) hitungKat.set(b.kategori, (hitungKat.get(b.kategori) ?? 0) + 1);
    const urut = [...hitungKat.entries()].sort((a, b) => b[1] - a[1]);
    // Enam teratas + "Lainnya" — daftar panjang kategori kecil hanya menenggelamkan yang penting.
    const perKategori: ItemBatang[] = urut.slice(0, 6).map(([k, n]) => ({ label: label.get(k) ?? k, jumlah: n }));
    const sisa = urut.slice(6).reduce((a, [, n]) => a + n, 0);
    if (sisa > 0) perKategori.push({ label: "Lainnya", jumlah: sisa });

    return {
      loading,
      galat,
      bulanan,
      total: kini.length,
      laluSetara,
      menunggu,
      diverifikasi: kini.filter((b) => b.status === "Diverifikasi").length,
      jtm: kini.filter((b) => b.jenis === "JTM").length,
      jtr: kini.filter((b) => b.jenis === "JTR").length,
      perUlp,
      perKategori,
    };
  }, [data, loading, galat, tahun, ulp, kategori]);
}
