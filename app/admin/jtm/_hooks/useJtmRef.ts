"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Tiga daftar pilihan JTM dalam satu tabel: penanda tiang, jenis penghantar,
 * ukuran penghantar.
 *
 * Bentuknya sama persis — kode, label, urutan, aktif — jadi memisahkannya jadi
 * tiga tabel berarti menulis tiga kali kode yang sama. Yang membedakan cuma dua
 * kolom milik penanda: bentuk ikon dan warnanya di peta.
 */

export type Kategori = "penanda" | "penghantar" | "ukuran";
export type Bentuk = "kotak" | "segitiga" | "belah" | "bulat";

export interface RefBaris {
  kategori: Kategori;
  kode: string;
  label: string;
  bentuk: Bentuk | null;
  warna: string | null;
  urutan: number;
  aktif: boolean;
}

export const BENTUK: { kode: Bentuk; label: string }[] = [
  { kode: "kotak", label: "Kotak" },
  { kode: "segitiga", label: "Segitiga" },
  { kode: "belah", label: "Belah ketupat" },
  { kode: "bulat", label: "Bulat" },
];

export function useJtmRef() {
  const toast = useToast();
  const [baris, setBaris] = useState<RefBaris[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    // `finally` bukan basa-basi: tanpa itu, satu kegagalan jaringan membuat
    // `loading` tinggal true selamanya dan tabnya berputar tanpa pernah
    // mengatakan apa yang salah.
    try {
      const { data, error } = await supabaseBrowser
        .from("jtm_ref")
        .select("kategori,kode,label,bentuk,warna,urutan,aktif")
        .order("kategori")
        .order("urutan");
      if (error) throw new Error(error.message);
      setBaris((data ?? []) as unknown as RefBaris[]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      // Tabelnya baru — kalau skripnya belum dijalankan, katakan apa adanya
      // daripada membiarkan layar kosong tanpa sebab.
      toast.error(
        pesan.includes("does not exist")
          ? "Tabel jtm_ref belum ada — jalankan scripts/jtm-pengaturan.sql di Supabase."
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
    async (v: RefBaris) => {
      const { error } = await supabaseBrowser.from("jtm_ref").upsert(
        {
          kategori: v.kategori,
          kode: v.kode.trim().toLowerCase(),
          label: v.label.trim(),
          bentuk: v.bentuk,
          warna: v.warna,
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
    async (kategori: Kategori, kode: string) => {
      const { error } = await supabaseBrowser
        .from("jtm_ref")
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
    (kategori: Kategori, hanyaAktif = false) =>
      baris.filter((b) => b.kategori === kategori && (!hanyaAktif || b.aktif)),
    [baris],
  );

  /** Kode → label, untuk menampilkan nilai yang tersimpan. Nilai lama yang
   *  tidak ada di daftar dikembalikan apa adanya — bukan dikosongkan. */
  const label = useCallback(
    (kategori: Kategori, kode: string | null) => {
      if (!kode) return null;
      return baris.find((b) => b.kategori === kategori && b.kode === kode)?.label ?? kode;
    },
    [baris],
  );

  const penanda = useMemo(() => {
    const m = new Map<string, RefBaris>();
    for (const b of baris) if (b.kategori === "penanda") m.set(b.kode, b);
    return m;
  }, [baris]);

  return { baris, per, label, penanda, loading, muat, simpan, hapus };
}
