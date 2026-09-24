"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { TitikBulan } from "@/app/admin/_components/TrenBulananArsir";

/**
 * Angka dashboard Inspeksi JTM.
 *
 *   Tren       — KM segmen yang selesai diinspeksi (menunggu persetujuan maupun
 *                disetujui), dibukukan pada tanggal selesainya (WITA).
 *   Cakupan,
 *   Temuan     — keadaan TERKINI dari `tiang_kondisi_terakhir`, jadi hanya
 *                inspeksi yang sudah disetujui. Dihitung per TIANG.
 */

interface Selesai { segmen_id: string | null; tgl_selesai: string }
interface Cakupan { tiang: number | null; tiang_dinilai: number | null }
interface Kondisi { tiang_id: string; item_nama: string; kelompok: string | null; nilai_label: string | null }

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const bulat2 = (v: number) => Math.round(v * 100) / 100;
const tanggalWita = (ts: string) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Asia/Makassar" });

export function useDashboardJtm(ulp: string, tahun: number) {
  const [hasil, setHasil] = useState<{
    selesai: Selesai[];
    km: Map<string, number>;
    menunggu: number;
    cakupan: Cakupan[];
    kondisi: Kondisi[];
  } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const tarik = useCallback(async () => {
    const semua = ulp === "SEMUA";
    const [selesai, segmen, tunggu, cakupan, kondisi] = await Promise.all([
      fetchAllRows<Selesai>(() => {
        let q = supabaseBrowser
          .from("inspeksi_jtm")
          .select("segmen_id,tgl_selesai")
          .in("status", ["Selesai", "Diverifikasi"])
          .gte("tgl_selesai", `${tahun - 1}-01-01T00:00:00+08:00`)
          .lte("tgl_selesai", `${tahun}-12-31T23:59:59+08:00`);
        if (!semua) q = q.eq("ulp", ulp);
        return q.order("id");
      }),
      fetchAllRows<{ segmen_id: string; panjang_km: number | null }>(() => {
        let q = supabaseBrowser.from("segmen_ringkas").select("segmen_id,panjang_km");
        if (!semua) q = q.eq("ulp", ulp);
        return q.order("segmen_id");
      }),
      (() => {
        let q = supabaseBrowser.from("inspeksi_jtm").select("id", { count: "exact", head: true }).eq("status", "Selesai");
        if (!semua) q = q.eq("ulp", ulp);
        return q;
      })(),
      fetchAllRows<Cakupan>(() => {
        let q = supabaseBrowser.from("jtm_cakupan").select("tiang,tiang_dinilai");
        if (!semua) q = q.eq("ulp", ulp);
        return q.order("segmen_id");
      }),
      fetchAllRows<Kondisi>(() => {
        let q = supabaseBrowser.from("tiang_kondisi_terakhir").select("tiang_id,item_nama,kelompok,nilai_label").eq("normal", false);
        if (!semua) q = q.eq("ulp", ulp);
        return q.order("tiang_id").order("item_kode").order("bagian");
      }),
    ]);
    if (tunggu.error) throw new Error(tunggu.error.message);
    return {
      selesai,
      km: new Map(segmen.map((s) => [s.segmen_id, Number(s.panjang_km ?? 0)])),
      menunggu: tunggu.count ?? 0,
      cakupan,
      kondisi,
    };
  }, [ulp, tahun]);

  useEffect(() => {
    let hidup = true;
    tarik().then(
      (h) => { if (hidup) setHasil(h); },
      (e: Error) => { if (hidup) setGalat(e.message); },
    );
    return () => { hidup = false; };
  }, [tarik]);

  return useMemo(() => {
    const sekarang = new Date();
    const bulanIni = sekarang.getFullYear() === tahun ? sekarang.getMonth() : sekarang.getFullYear() > tahun ? 11 : -1;
    const baris = (hasil?.selesai ?? []).map((s) => ({ tgl: tanggalWita(s.tgl_selesai), km: s.segmen_id ? (hasil?.km.get(s.segmen_id) ?? 0) : 0 }));
    const jumlahKm = (a: typeof baris) => bulat2(a.reduce((n, x) => n + x.km, 0));
    const kini = baris.filter((b) => b.tgl.startsWith(String(tahun)));
    const lalu = baris.filter((b) => b.tgl.startsWith(String(tahun - 1)));

    const bulanan: TitikBulan[] = BULAN_PENDEK.map((label, i) => {
      const k = `-${String(i + 1).padStart(2, "0")}-`;
      return {
        key: label,
        label,
        kini: jumlahKm(kini.filter((b) => b.tgl.slice(4, 8) === k)),
        lalu: jumlahKm(lalu.filter((b) => b.tgl.slice(4, 8) === k)),
        lewat: i <= bulanIni,
        berjalan: i === bulanIni && sekarang.getFullYear() === tahun,
      };
    });

    // Temuan per jenis, dihitung per TIANG: satu tiang dengan tiga isolator
    // retak tetap satu tiang yang perlu didatangi.
    const hitungTiang = (pilih: (k: Kondisi) => boolean, label: (k: Kondisi) => string) => {
      const m = new Map<string, Set<string>>();
      for (const k of hasil?.kondisi ?? []) {
        if (!pilih(k)) continue;
        const l = label(k);
        const s = m.get(l) ?? new Set<string>();
        s.add(k.tiang_id);
        m.set(l, s);
      }
      return [...m.entries()].map(([l, s]) => ({ label: l, jumlah: s.size })).sort((a, b) => b.jumlah - a.jumlah);
    };
    const isRow = (k: Kondisi) => k.kelompok === "ROW";

    return {
      loading: hasil === null && galat === null,
      galat,
      bulanan,
      segmen: kini.length,
      km: jumlahKm(kini),
      kmLaluSetara: bulat2(bulanan.filter((b) => b.lewat).reduce((a, b) => a + b.lalu, 0)),
      menunggu: hasil?.menunggu ?? 0,
      tiang: (hasil?.cakupan ?? []).reduce((s, c) => s + Number(c.tiang ?? 0), 0),
      tiangDinilai: (hasil?.cakupan ?? []).reduce((s, c) => s + Number(c.tiang_dinilai ?? 0), 0),
      tiangBertemuan: new Set((hasil?.kondisi ?? []).map((k) => k.tiang_id)).size,
      temuan: hitungTiang((k) => !isRow(k), (k) => k.item_nama),
      row: hitungTiang(isRow, (k) => `${k.item_nama} — ${k.nilai_label ?? "?"}`),
    };
  }, [hasil, galat, tahun]);
}
