"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Bentuk } from "@/lib/penandaJtm";

/**
 * Bentuk dan warna tiap penanda tiang, dari tabel `jtm_ref`.
 *
 * Peta TIDAK BOLEH punya daftarnya sendiri. Orang mengatur ini di tab
 * Pengaturan JTM — menambah penanda baru, mengganti bentuk atau warnanya — dan
 * salinan apa pun di sisi peta pasti melenceng cepat atau lambat. Sebelumnya
 * halaman ini memang tidak membacanya sama sekali: semua tiang bertanda
 * digambar bulat kuning, sehingga gardu dan FCO tak terbedakan.
 *
 * Dibaca sekali saat halaman dibuka; isinya beberapa baris dan jarang berubah.
 */

export interface Penanda {
  kode: string;
  label: string;
  bentuk: Bentuk | null;
  warna: string | null;
}

export function usePenandaJtm() {
  const [penanda, setPenanda] = useState<Map<string, Penanda>>(new Map());

  useEffect(() => {
    let batal = false;
    void (async () => {
      const { data } = await supabaseBrowser
        .from("jtm_ref")
        .select("kode,label,bentuk,warna")
        .eq("kategori", "penanda")
        .order("urutan");
      if (batal) return;
      const m = new Map<string, Penanda>();
      for (const b of data ?? []) {
        m.set(b.kode as string, {
          kode: b.kode as string,
          label: (b.label as string) ?? (b.kode as string),
          bentuk: (b.bentuk as Bentuk) ?? null,
          warna: (b.warna as string) ?? null,
        });
      }
      setPenanda(m);
    })();
    return () => { batal = true; };
  }, []);

  return penanda;
}
