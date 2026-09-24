"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Rabas DI LUAR WO — satu baris satu pohon, tanpa segmen, tanpa km
 * (keputusan user 25 Sep 2026, R4 `rencana-mobile-perabasan.md`).
 *
 * Tampil di ULP LOKASI (yang memeriksanya) maupun ULP REGU (yang
 * mengerjakannya) — bantuan darurat Ampenan ke Cakra terlihat di keduanya.
 * Yang menunggu diperiksa dan yang dikembalikan selalu dimuat; yang diterima
 * dan dibatalkan disaring per periode tanggal pekerjaan.
 */

export type StatusLuar = "Selesai" | "Diverifikasi" | "Ditolak" | "Dibatalkan";

export const LABEL_LUAR: Record<StatusLuar, string> = {
  Selesai: "Menunggu verifikasi",
  Ditolak: "Dikembalikan",
  Diverifikasi: "Diverifikasi",
  Dibatalkan: "Dibatalkan",
};

export interface BarisLuar {
  id: string;
  ulp: string;
  ulpRegu: string;
  penyulang: string;
  regu: string | null;
  jenisPohon: string | null;
  lokasi: string | null;
  lat: number | null;
  lng: number | null;
  fotoSebelum: string;
  fotoSesudah: string;
  tgl: string;
  catatan: string | null;
  status: StatusLuar;
  verifiedBy: string | null;
  verifiedNote: string | null;
}

const dua = (n: number) => String(n).padStart(2, "0");
const akhirBulan = (t: number, b: number) => new Date(t, b, 0).getDate();

const petaBaris = (r: Record<string, unknown>): BarisLuar => ({
  id: r.id as string,
  ulp: r.ulp as string,
  ulpRegu: r.ulp_regu as string,
  penyulang: r.penyulang as string,
  regu: (r.regu as string) ?? null,
  jenisPohon: (r.jenis_pohon as string) ?? null,
  lokasi: (r.lokasi as string) ?? null,
  lat: r.lat === null ? null : Number(r.lat),
  lng: r.lng === null ? null : Number(r.lng),
  fotoSebelum: r.foto_sebelum_url as string,
  fotoSesudah: r.foto_sesudah_url as string,
  tgl: r.tgl as string,
  catatan: (r.catatan as string) ?? null,
  status: r.status as StatusLuar,
  verifiedBy: (r.verified_by as string) ?? null,
  verifiedNote: (r.verified_note as string) ?? null,
});

export function useLuarWoPerabasan(ulp: string, tahun: number, bulan: number, cari: string) {
  const toast = useToast();
  const [semua, setSemua] = useState<BarisLuar[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  // Memuat = hasil terakhir belum untuk saringan yang sekarang.
  const kunci = `${ulp}|${tahun}|${bulan}|${nonce}`;
  const [dimuatUntuk, setDimuatUntuk] = useState<string | null>(null);
  const loading = dimuatUntuk !== kunci;

  const tarik = useCallback(async () => {
    const awal = bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`;
    const akhir = bulan === 0 ? `${tahun}-12-31` : `${tahun}-${dua(bulan)}-${dua(akhirBulan(tahun, bulan))}`;
    const milik = `ulp.eq.${ulp},ulp_regu.eq.${ulp}`;

    const aktif = () => {
      const x = supabaseBrowser.from("perabasan_luar_wo").select("*").in("status", ["Selesai", "Ditolak"]).order("id");
      return ulp === "SEMUA" ? x : x.or(milik);
    };
    const tertutup = () => {
      const x = supabaseBrowser
        .from("perabasan_luar_wo")
        .select("*")
        .in("status", ["Diverifikasi", "Dibatalkan"])
        .gte("tgl", awal)
        .lte("tgl", akhir)
        .order("id");
      return ulp === "SEMUA" ? x : x.or(milik);
    };
    const [a, t] = await Promise.all([
      fetchAllRows<Record<string, unknown>>(aktif),
      fetchAllRows<Record<string, unknown>>(tertutup),
    ]);
    return [...a, ...t].map(petaBaris).sort((x, y) => y.tgl.localeCompare(x.tgl) || x.penyulang.localeCompare(y.penyulang));
  }, [ulp, tahun, bulan]);

  useEffect(() => {
    let hidup = true;
    tarik().then(
      (rows) => {
        if (!hidup) return;
        setSemua(rows);
        setGalat(null);
        setDimuatUntuk(kunci);
      },
      (e: Error) => {
        if (!hidup) return;
        setGalat(e.message);
        setDimuatUntuk(kunci);
      },
    );
    return () => { hidup = false; };
  }, [tarik, kunci]);

  const baris = useMemo(() => {
    const k = cari.trim().toUpperCase();
    if (!k) return semua;
    return semua.filter((b) =>
      [b.penyulang, b.regu ?? "", b.jenisPohon ?? "", b.lokasi ?? "", b.ulp, b.ulpRegu].some((v) => v.toUpperCase().includes(k)),
    );
  }, [semua, cari]);

  const menunggu = useMemo(() => semua.filter((b) => b.status === "Selesai").length, [semua]);

  /** Ambil ulang SATU baris lalu tambal di tempat (teknisaplikasi.md butir 7). */
  const segarkanSatu = async (id: string) => {
    const { data } = await supabaseBrowser.from("perabasan_luar_wo").select("*").eq("id", id).maybeSingle();
    if (data) setSemua((p) => p.map((x) => (x.id === id ? petaBaris(data as Record<string, unknown>) : x)));
  };

  const putuskan = async (id: string, terima: boolean, catatan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("putuskan_perabasan_luar_wo", {
      p_id: id,
      p_terima: terima,
      p_catatan: catatan || null,
      p_oleh: oleh,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success(terima ? "Rabas di luar WO diterima." : "Dikembalikan ke regu.");
    await segarkanSatu(id);
    return true;
  };

  const batalkan = async (id: string, alasan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_perabasan_luar_wo", {
      p_id: id,
      p_alasan: alasan,
      p_oleh: oleh,
    });
    if (error) {
      toast.error(error.message);
      return false;
    }
    toast.success("Dibatalkan — tidak dihitung.");
    await segarkanSatu(id);
    return true;
  };

  return {
    semua, baris, menunggu, loading, galat,
    muat: () => setNonce((n) => n + 1),
    putuskan, batalkan,
  };
}
