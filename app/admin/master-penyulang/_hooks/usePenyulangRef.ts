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
  /** Gardu yang memakai penyulang ini. Bobot sebenarnya dari sebuah penggantian nama. */
  gardu: number;
  /**
   * Gardu yang memakai nama ini TAPI berada di ULP lain.
   *
   * Nilai > 0 berarti nama ini dipakai DUA penyulang berbeda yang kebetulan
   * senama — kekeliruan sejak awal. Penggantian namanya harus MEMISAH, bukan
   * merambat ke seluruh database.
   */
  gardu_ulp_lain: number;
  /** Sebaran gardu per ULP, untuk pratinjau penggantian nama. */
  gardu_per_ulp: Record<string, number> | null;
}

/** Penyulang yang dipakai gardu tapi belum ada di master — daftar kerja. */
export interface PenyulangBelum {
  penyulang: string;
  ulp: string;
  gardu: number;
}

/** Satu tabel yang ikut — atau tidak ikut — berganti nama. */
export interface BarisDampak {
  tabel: string;
  kolom?: string;
  baris: number;
  alasan?: string;
}

/**
 * Pratinjau penggantian nama, apa adanya dari database.
 *
 * Dihitung di sana, bukan di sini. Layar yang menghitung sendiri akan memakai
 * aturan pencocokan yang sedikit berbeda dari yang dipakai fungsi penggantinya,
 * dan selisihnya baru ketahuan setelah tombolnya ditekan.
 */
export interface PratinjauGanti {
  nama_lama: string;
  nama_baru: string | null;
  ulp: string;
  terdaftar: boolean;
  ulp_master: string | null;
  /** ganti = nama milik ULP ini sendirian · pisah = dipakai ULP lain juga · daftar_baru = belum ada di master */
  tindakan: "ganti" | "pisah" | "daftar_baru";
  berubah: BarisDampak[];
  /** Ikut berganti, tapi tabelnya tidak menyimpan ULP → tidak bisa dilingkupi saat memisah. */
  tidak_terlingkup: BarisDampak[];
  /** Sengaja dibiarkan memakai nama lama, beserta alasannya. */
  tidak_ikut: BarisDampak[];
  /** ULP lain yang TETAP memakai nama lama. Inilah yang paling perlu dibaca. */
  tetap_ulp_lain: { ulp: string; baris: number }[];
  peringatan: string[];
  selesai?: boolean;
  prefiks_baru?: string | null;
  ulp_master_sisa?: string | null;
}

export type HasilPratinjau =
  | { ok: true; data: PratinjauGanti }
  | { ok: false; pesan: string };

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
  const [belum, setBelum] = useState<PenyulangBelum[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      const { data, error } = await supabaseBrowser
        .from("penyulang_pakai")
        .select(
          "penyulang,ulp,kode_singkat,tiang_dimiliki,tiang_bernama,segmen,gardu,gardu_ulp_lain,gardu_per_ulp",
        )
        .order("ulp")
        .order("penyulang");
      if (error) throw new Error(error.message);
      setBaris((data ?? []) as unknown as PenyulangBaris[]);

      // Dibaca bersamaan, bukan saat bagiannya dibuka: daftar ini justru yang
      // paling perlu terlihat lebih dulu — selama masih berisi, kunci asing
      // ke master tidak bisa dipasang sama sekali.
      const b = await supabaseBrowser
        .from("penyulang_belum_terdaftar")
        .select("penyulang,ulp,gardu")
        .order("gardu", { ascending: false });
      if (b.error) throw new Error(b.error.message);
      setBelum((b.data ?? []) as unknown as PenyulangBelum[]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("does not exist")
          ? "View penyulang_pakai / penyulang_belum_terdaftar belum lengkap — jalankan scripts/master-penyulang.sql di Supabase."
          : pesan,
      );
      setBaris([]);
      setBelum([]);
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

  /**
   * Pratinjau — TIDAK mengubah apa pun, aman dipanggil tiap ketikan.
   *
   * Galatnya dikembalikan, bukan di-toast: sebagian di antaranya lahir dari
   * nama yang baru diketik separuh, dan notifikasi yang muncul tiap huruf
   * membuat admin berhenti membacanya justru saat pesannya penting.
   */
  const pratinjau = useCallback(
    async (lama: string, ulp: string, baru: string): Promise<HasilPratinjau> => {
      const { data, error } = await supabaseBrowser.rpc("pratinjau_ganti_nama_penyulang", {
        p_lama: lama,
        p_ulp: ulp,
        p_baru: baru || null,
      });
      if (error) return { ok: false, pesan: error.message };
      return { ok: true, data: data as unknown as PratinjauGanti };
    },
    [],
  );

  const gantiNama = useCallback(
    async (lama: string, ulp: string, baru: string, oleh?: string) => {
      const { data, error } = await supabaseBrowser.rpc("ganti_nama_penyulang", {
        p_lama: lama,
        p_ulp: ulp,
        p_baru: baru,
        p_oleh: oleh ?? null,
      });
      if (error) {
        // Penjaga di database menerangkan sendiri kenapa ditolak, lengkap
        // dengan ULP mana yang bentrok. Diteruskan apa adanya.
        toast.error(error.message);
        return null;
      }
      await muat();
      return data as unknown as PratinjauGanti;
    },
    [toast, muat],
  );

  /** ULP yang benar-benar ada isinya, untuk bilah saring. */
  const daftarUlp = useMemo(
    () => [...new Set(baris.map((b) => b.ulp ?? "—"))].sort(),
    [baris],
  );

  return { baris, belum, daftarUlp, loading, muat, simpan, hapus, pratinjau, gantiNama };
}
