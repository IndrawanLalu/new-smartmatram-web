"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Panduan istilah satu modul (`scripts/panduan.sql`) — dibaca semua pengguna,
 * disunting UP3/admin. Yang sama tampil di HP (tombol Panduan).
 */

export interface ItemPanduan {
  id: string;
  modul: string;
  kelompok: string;
  istilah: string;
  maksud: string;
  kapan: string | null;
  contoh: string | null;
  urutan: number;
  aktif: boolean;
  diubah_oleh: string | null;
  updated_at: string;
}

export type IsianPanduan = Pick<ItemPanduan, "kelompok" | "istilah" | "maksud" | "kapan" | "contoh" | "urutan" | "aktif">;

const KOLOM = "id,modul,kelompok,istilah,maksud,kapan,contoh,urutan,aktif,diubah_oleh,updated_at";

export function usePanduan(modul: string) {
  const [daftar, setDaftar] = useState<ItemPanduan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const [kunci, setKunci] = useState(0);
  const muatUlang = useCallback(() => setKunci((n) => n + 1), []);

  useEffect(() => {
    let hidup = true;
    supabaseBrowser
      .from("panduan")
      .select(KOLOM)
      .eq("modul", modul)
      .order("urutan")
      .order("istilah")
      .then(({ data, error }) => {
        if (!hidup) return;
        setGalat(error?.message ?? null);
        if (!error) setDaftar((data ?? []) as ItemPanduan[]);
      });
    return () => { hidup = false; };
  }, [modul, kunci]);

  /** Tambah (tanpa id) atau ubah. Mengembalikan pesan galat, atau null. */
  const simpan = async (isi: IsianPanduan, oleh: string, id?: string): Promise<string | null> => {
    const baris = {
      ...isi,
      kelompok: isi.kelompok.trim(),
      istilah: isi.istilah.trim(),
      maksud: isi.maksud.trim(),
      kapan: isi.kapan?.trim() || null,
      contoh: isi.contoh?.trim() || null,
      diubah_oleh: oleh,
    };
    const { data, error } = id
      ? await supabaseBrowser.from("panduan").update(baris).eq("id", id).select(KOLOM).single()
      : await supabaseBrowser.from("panduan").insert({ ...baris, modul }).select(KOLOM).single();
    if (error) {
      return error.code === "23505" ? `Istilah "${baris.istilah}" sudah ada.` : error.message;
    }
    const b = data as ItemPanduan;
    setDaftar((d) => {
      const lain = (d ?? []).filter((x) => x.id !== b.id);
      return [...lain, b].sort((x, y) => x.urutan - y.urutan || x.istilah.localeCompare(y.istilah));
    });
    return null;
  };

  const hapus = async (id: string): Promise<string | null> => {
    const { error } = await supabaseBrowser.from("panduan").delete().eq("id", id);
    if (error) return error.message;
    setDaftar((d) => (d ?? []).filter((x) => x.id !== id));
    return null;
  };

  return { daftar, galat, simpan, hapus, muatUlang };
}
