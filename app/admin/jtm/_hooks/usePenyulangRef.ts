"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Master penyulang — daftar yang menentukan penyulang mana yang bisa dirintis
 * regu di HP (`getPenyulang(ulp)` di aplikasi petugas).
 *
 * Semua perubahan lewat fungsi database, bukan tulis langsung ke tabel.
 * Alasannya bukan kerapian: mengganti prefiks harus menomori ulang tiang di
 * DUA tabel sekaligus dan meninggalkan jejak audit, dan satu jalan masuk yang
 * melewatkan salah satunya akan membuat satu batang beton punya dua nama.
 */

export interface PenyulangBaris {
  penyulang: string;
  ulp: string | null;
  kode_singkat: string | null;
  /** Tiang yang penyulang ini miliki. */
  tiang_dimiliki: number;
  /** Semua tiang yang punya nama di penyulang ini — termasuk yang cuma dilewati. */
  tiang_bernama: number;
  segmen: number;
}

/** Hasil penggantian prefiks, untuk dilaporkan apa adanya ke admin. */
export interface HasilPrefiks {
  kode_lama: string | null;
  kode_baru: string;
  tiang: number;
  nama: number;
  berubah: boolean;
}

export function usePenyulangRef() {
  const toast = useToast();
  const [baris, setBaris] = useState<PenyulangBaris[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      const { data, error } = await supabaseBrowser
        .from("penyulang_pakai")
        .select("penyulang,ulp,kode_singkat,tiang_dimiliki,tiang_bernama,segmen")
        .order("ulp")
        .order("penyulang");
      if (error) throw new Error(error.message);
      setBaris((data ?? []) as unknown as PenyulangBaris[]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("does not exist")
          ? "View penyulang_pakai belum ada — jalankan scripts/jtm-penyulang-pengaturan.sql di Supabase."
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

  const simpan = useCallback(
    async (v: { penyulang: string; ulp: string; kodeSingkat?: string | null; oleh?: string }) => {
      const { data, error } = await supabaseBrowser.rpc("simpan_penyulang", {
        p_penyulang: v.penyulang,
        p_ulp: v.ulp,
        p_kode_singkat: v.kodeSingkat ?? null,
        p_oleh: v.oleh ?? null,
      });
      if (error) {
        // Penjaga di database sudah menerangkan sendiri kenapa ditolak —
        // teruskan apa adanya, jangan diganti "gagal menyimpan".
        toast.error(error.message);
        return null;
      }
      await muat();
      const prefiks = (data as { prefiks?: HasilPrefiks } | null)?.prefiks ?? null;
      return prefiks;
    },
    [toast, muat],
  );

  const hapus = useCallback(
    async (penyulang: string, oleh?: string) => {
      const { error } = await supabaseBrowser.rpc("hapus_penyulang", {
        p_penyulang: penyulang,
        p_oleh: oleh ?? null,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      toast.success("Penyulang dihapus.");
      await muat();
      return true;
    },
    [toast, muat],
  );

  /** ULP yang benar-benar ada isinya, untuk bilah saring. */
  const daftarUlp = useMemo(
    () => [...new Set(baris.map((b) => b.ulp ?? "—"))].sort(),
    [baris],
  );

  return { baris, daftarUlp, loading, muat, simpan, hapus };
}
