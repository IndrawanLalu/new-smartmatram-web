"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Master Segmen — daftar acuan ruas jaringan, melayani inspeksi JTM DAN
 * perabasan.
 *
 * Yang membuatnya berguna bukan daftarnya, melainkan UMURNYA: ruas yang paling
 * lama tidak disentuh naik sendiri ke atas, dan WO berikutnya tinggal
 * mencentang dari situ alih-alih diingat-ingat orang.
 */

export interface SegmenBaris {
  segmen_id: string;
  nama: string;
  penyulang: string;
  ulp: string;
  status: string;
  /** 'lapangan' = dirintis regu · 'impor' = tempelan Excel · 'manual' = warisan */
  sumber: string;
  jumlah_tiang: number;
  jumlah_gawang: number;
  /** Dihitung dari bentang tiang. 0 kalau tiangnya belum tertelusuri. */
  panjang_km: number;
  /** Yang diketik admin. */
  panjang_manual_km: number | null;
  /** Yang benar-benar dipakai — hitungan kalau ada, ketikan kalau belum. */
  panjang_pakai_km: number | null;
  panjang_dari: "hitungan" | "ketikan" | "kosong";
  tiang_bersama: number;
  catatan: string | null;
  terakhir_inspeksi: string | null;
  umur_inspeksi_bulan: number | null;
  inspeksi_berjalan: boolean;
}

export interface BarisImpor {
  awal: string;
  akhir: string;
  km: number | null;
}

export interface HasilImpor {
  penyulang: string;
  ulp: string;
  dibuat: number;
  dilewati: { baris: BarisImpor; sebab: string }[];
}

const KOLOM =
  "segmen_id,nama,penyulang,ulp,status,sumber,jumlah_tiang,jumlah_gawang,panjang_km,panjang_manual_km,panjang_pakai_km,panjang_dari,tiang_bersama,catatan,terakhir_inspeksi,umur_inspeksi_bulan,inspeksi_berjalan";

export function useMasterSegmen() {
  const toast = useToast();
  const [baris, setBaris] = useState<SegmenBaris[]>([]);
  const [penyulang, setPenyulang] = useState<{ penyulang: string; ulp: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      const { data, error } = await supabaseBrowser
        .from("master_segmen")
        .select(KOLOM)
        .order("penyulang")
        .order("nama");
      if (error) throw new Error(error.message);
      setBaris((data ?? []) as unknown as SegmenBaris[]);

      // Daftar penyulang dibaca dari MASTER, bukan dari segmen yang sudah ada.
      // Impor harus bisa menunjuk penyulang yang belum punya satu segmen pun —
      // justru merekalah yang paling perlu diimpor.
      const p = await supabaseBrowser
        .from("penyulang_ref")
        .select("penyulang,ulp")
        .order("penyulang");
      if (p.error) throw new Error(p.error.message);
      setPenyulang((p.data ?? []) as { penyulang: string; ulp: string | null }[]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("does not exist")
          ? "View master_segmen belum ada — jalankan scripts/master-segmen.sql di Supabase."
          : pesan,
      );
      setBaris([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const impor = useCallback(
    async (namaPenyulang: string, isi: BarisImpor[], oleh?: string) => {
      const { data, error } = await supabaseBrowser.rpc("impor_segmen", {
        p_penyulang: namaPenyulang,
        p_baris: isi,
        p_oleh: oleh ?? null,
      });
      if (error) {
        // Penjaga di database menerangkan sendiri kenapa ditolak — termasuk
        // menunjuk ke Master Penyulang saat penyulangnya belum terdaftar.
        toast.error(error.message);
        return null;
      }
      await muat();
      return data as unknown as HasilImpor;
    },
    [toast, muat],
  );

  const ubahPanjang = useCallback(
    async (segmenId: string, km: number | null, oleh?: string) => {
      const { data, error } = await supabaseBrowser.rpc("ubah_panjang_manual_segmen", {
        p_segmen_id: segmenId,
        p_km: km,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return null;
      }
      const h = data as unknown as { dipakai: boolean };
      // Angka yang tersimpan tapi TIDAK dipakai harus dikatakan. Kalau tidak,
      // orang mengira sudah membetulkan panjangnya, padahal hitungan dari
      // tiang tetap yang menang dan angkanya cuma mengendap.
      if (!h.dipakai) {
        toast.success(
          "Tersimpan, tapi belum dipakai — segmen ini panjangnya sudah dihitung dari tiang.",
        );
      }
      await muat();
      return h;
    },
    [toast, muat],
  );

  const daftarUlp = useMemo(
    () => [...new Set(baris.map((b) => b.ulp))].filter(Boolean).sort(),
    [baris],
  );

  return { baris, penyulang, daftarUlp, loading, muat, impor, ubahPanjang };
}
