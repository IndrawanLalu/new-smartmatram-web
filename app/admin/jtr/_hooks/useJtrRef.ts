"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Tiga belas daftar pilihan isian tiang JTR dalam satu tabel.
 *
 * Bentuknya sama persis — kode, label, normal, urutan, aktif — jadi
 * memisahkannya jadi tiga belas tabel berarti menulis tiga belas kali kode CRUD
 * yang sama, dan tiga belas kali pula halaman pengaturannya.
 *
 * Satu kategori dipakai bersama beberapa isian: `kondisi_aksesoris` melayani
 * suspension, large angle, dan dead end sekaligus. Itu bedanya dari
 * `jtm_opsi_ref` yang selalu milik satu item.
 */

export type KategoriJtr =
  | "jenis_tiang"
  | "ukuran_tiang"
  | "kondisi_tiang"
  | "jenis_kabel"
  | "ukuran_kabel"
  | "kondisi_kabel"
  | "kondisi_aksesoris"
  | "kondisi_andongan"
  | "kondisi_arde"
  | "jenis_stay"
  | "kondisi_stay"
  | "jenis_jamperan"
  | "kondisi_jamperan"
  | "rawan_row";

export interface RefJtr {
  kategori: KategoriJtr;
  kode: string;
  label: string;
  /** false = jawaban ini sebuah temuan. */
  normal: boolean;
  urutan: number;
  aktif: boolean;
}

export function useJtrRef() {
  const toast = useToast();
  const [baris, setBaris] = useState<RefJtr[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    // `finally` bukan basa-basi: tanpa itu, satu kegagalan jaringan membuat
    // `loading` tinggal true selamanya dan tabnya berputar tanpa pernah
    // mengatakan apa yang salah.
    try {
      const { data, error } = await supabaseBrowser
        .from("jtr_ref")
        .select("kategori,kode,label,normal,urutan,aktif")
        .order("kategori")
        .order("urutan");
      if (error) throw new Error(error.message);
      setBaris((data ?? []) as unknown as RefJtr[]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("does not exist")
          ? "Tabel jtr_ref belum ada — jalankan scripts/jtr-baik.sql di Supabase."
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
    async (v: RefJtr) => {
      const { error } = await supabaseBrowser.from("jtr_ref").upsert(
        {
          kategori: v.kategori,
          // Kodenya TIDAK dijadikan huruf kecil seperti di JTM: kode JTR adalah
          // teks yang benar-benar tersimpan di kolom `tiang` ('Baik', 'Tidak Ada
          // TUI'), jadi mengubah hurufnya di sini akan memutus sambungannya
          // dengan data lapangan yang sudah terkumpul.
          kode: v.kode.trim(),
          label: v.label.trim(),
          normal: v.normal,
          urutan: v.urutan,
          aktif: v.aktif,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "kategori,kode" },
      );
      if (error) {
        toast.error(error.message);
        return false;
      }
      await muat();
      return true;
    },
    [toast, muat],
  );

  const hapus = useCallback(
    async (kategori: KategoriJtr, kode: string) => {
      const { error } = await supabaseBrowser
        .from("jtr_ref")
        .delete()
        .eq("kategori", kategori)
        .eq("kode", kode);
      if (error) {
        // Pesan penjaga dari database sudah menjelaskan sendiri — teruskan apa
        // adanya, jangan diganti "gagal menghapus" yang tidak menerangkan apa pun.
        toast.error(error.message);
        return false;
      }
      toast.success("Dihapus.");
      await muat();
      return true;
    },
    [toast, muat],
  );

  const per = useCallback(
    (kategori: KategoriJtr, hanyaAktif = false) =>
      baris.filter((b) => b.kategori === kategori && (!hanyaAktif || b.aktif)),
    [baris],
  );

  return { baris, per, loading, muat, simpan, hapus };
}
