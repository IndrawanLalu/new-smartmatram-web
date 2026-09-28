"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Tab Tegangan Ujung — titik ukur di ujung JTR + persetujuannya
 * (`scripts/tegangan-ujung-persetujuan.sql`). Satu bulan (tanggal ukur), satu
 * ULP atau semua. Setujui/kembalikan/batalkan ditambal di tempat.
 */

export type StatusUjung = "Menunggu verifikasi" | "Disetujui" | "Dikembalikan" | "Dibatalkan";
export const STATUS_UJUNG: StatusUjung[] = ["Menunggu verifikasi", "Disetujui", "Dikembalikan", "Dibatalkan"];

export interface TitikUjung {
  id: string;
  pengukuran_id: string;
  gardu_kode: string;
  gardu_nama: string | null;
  penyulang: string | null;
  ulp: string;
  jurusan: string;
  v_rn: number;
  v_sn: number;
  v_tn: number;
  v_min: number;
  di_bawah_standar: boolean;
  lat: number;
  lng: number;
  akurasi_m: number | null;
  foto_url: string;
  tgl_ukur: string;
  jam_ukur: string | null;
  petugas_nama: string | null;
  status: "Terkirim" | "Dikembalikan" | "Dibatalkan";
  status_tampil: StatusUjung;
  alasan: string | null;
  verified_at: string | null;
  verified_by: string | null;
  gardu_lat: number | null;
  gardu_lng: number | null;
  jarak_gardu_m: number | null;
  tiang_rekomendasi_kode: string | null;
  tiang_lat: number | null;
  tiang_lng: number | null;
  jarak_rekomendasi_m: number | null;
  panjang_jaringan_m: number | null;
  tgl_beban: string | null;
  amg_sent_at: string | null;
  amg_queued_at: string | null;
}

export interface BebanTanpaUjung {
  id: string;
  no_gardu: string;
  gardu_nama: string | null;
  ulp: string;
  penyulang: string | null;
  tanggal_pengukuran: string;
  petugas_nama: string | null;
}

const dua = (n: number) => String(n).padStart(2, "0");
const rentang = (tahun: number, bulan: number) => ({
  awal: `${tahun}-${dua(bulan)}-01`,
  akhir: bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${dua(bulan + 1)}-01`,
});

export function useTeganganUjung(ulp: string, oleh: string) {
  const toast = useToast();
  // Bulan berjalan menurut WITA (UTC+8).
  const [tahun, setTahun] = useState(() => new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear());
  const [bulan, setBulan] = useState(() => new Date(Date.now() + 8 * 3600 * 1000).getUTCMonth() + 1);
  const [titik, setTitik] = useState<TitikUjung[]>([]);
  const [tanpa, setTanpa] = useState<BebanTanpaUjung[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const muat = () => { setLoading(true); setGalat(null); setNonce((n) => n + 1); };

  useEffect(() => {
    let hidup = true;
    const { awal, akhir } = rentang(tahun, bulan);
    Promise.all([
      fetchAllRows<TitikUjung>(() => {
        let q = supabaseBrowser.from("tegangan_ujung_daftar").select("*").gte("tgl_ukur", awal).lt("tgl_ukur", akhir);
        if (ulp !== "ALL") q = q.eq("ulp", ulp);
        return q.order("tgl_ukur", { ascending: false }).order("id");
      }),
      fetchAllRows<BebanTanpaUjung>(() => {
        let q = supabaseBrowser.from("pengukuran_tanpa_ujung").select("*").gte("tanggal_pengukuran", awal).lt("tanggal_pengukuran", akhir);
        if (ulp !== "ALL") q = q.eq("ulp", ulp);
        return q.order("tanggal_pengukuran", { ascending: false }).order("id");
      }),
    ]).then(
      ([t, b]) => {
        if (!hidup) return;
        setTitik(t);
        setTanpa(b);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        setTitik([]);
        setTanpa([]);
        setGalat(
          e.message.includes("schema cache") || e.message.includes("does not exist")
            ? "View tegangan ujung belum ada — jalankan scripts/tegangan-ujung-persetujuan.sql di Supabase."
            : e.message,
        );
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [ulp, tahun, bulan, nonce]);

  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_UJUNG.map((s) => [s, 0])) as Record<StatusUjung, number>;
    for (const t of titik) h[t.status_tampil] += 1;
    return { ...h, bawah: titik.filter((t) => t.di_bawah_standar && t.status !== "Dibatalkan").length };
  }, [titik]);

  const tambal = (id: string, p: Partial<TitikUjung>) => setTitik((d) => d.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const setujui = async (t: TitikUjung) => {
    const { error } = await supabaseBrowser.rpc("setujui_tegangan_ujung", { p_id: t.id, p_nama: oleh });
    if (error) {
      toast.error(error.message);
      return false;
    }
    tambal(t.id, { verified_at: new Date().toISOString(), verified_by: oleh, status_tampil: "Disetujui" });
    toast.success(`Tegangan ujung ${t.gardu_kode} jurusan ${t.jurusan} disetujui.`);
    return true;
  };

  const kembalikan = async (t: TitikUjung, alasan: string) => {
    const { error } = await supabaseBrowser.rpc("kembalikan_tegangan_ujung", { p_id: t.id, p_alasan: alasan, p_nama: oleh });
    if (error) {
      toast.error(error.message);
      return false;
    }
    tambal(t.id, { status: "Dikembalikan", status_tampil: "Dikembalikan", alasan, verified_at: null, verified_by: null });
    toast.success("Dikembalikan ke petugas.");
    return true;
  };

  const batalkan = async (t: TitikUjung, alasan: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_tegangan_ujung", { p_id: t.id, p_alasan: alasan, p_nama: oleh });
    if (error) {
      toast.error(error.message);
      return false;
    }
    tambal(t.id, { status: "Dibatalkan", status_tampil: "Dibatalkan", alasan });
    toast.success("Tegangan ujung dibatalkan.");
    return true;
  };

  return { titik, tanpa, hitung, loading, galat, muat, tahun, setTahun, bulan, setBulan, setujui, kembalikan, batalkan };
}
