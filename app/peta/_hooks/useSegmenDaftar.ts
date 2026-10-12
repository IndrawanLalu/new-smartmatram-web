"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Segmen JTM per penyulang untuk pohon di folder JTM (12 Okt 2026).
 *
 * Dibaca sekali per ULP, dan baru saat folder JTM dibuka — 1.000+ segmen
 * hanya beberapa puluh bita per baris, tetapi tidak ada gunanya menariknya
 * untuk orang yang membuka peta demi JTR.
 *
 * Hanya segmen yang sudah bertiang. Segmen tersusun induk → cabang
 * (`induk_segmen_id`), jadi pohonnya bertingkat: penyulang → segmen utama →
 * cabangnya.
 */

export interface SegmenSimpul {
  id: string;
  nama: string;
  penyulang: string;
  jumlahTiang: number;
  panjangKm: number;
  cabang: SegmenSimpul[];
}

interface BarisSegmen {
  segmen_id: string;
  nama: string;
  penyulang: string;
  induk_segmen_id: string | null;
  jumlah_tiang: number;
  panjang_km: number;
}

function susun(baris: BarisSegmen[]): Map<string, SegmenSimpul[]> {
  const simpul = new Map<string, SegmenSimpul>(
    baris.map((b) => [
      b.segmen_id,
      { id: b.segmen_id, nama: b.nama, penyulang: b.penyulang, jumlahTiang: Number(b.jumlah_tiang), panjangKm: Number(b.panjang_km), cabang: [] },
    ]),
  );
  const akar = new Map<string, SegmenSimpul[]>();
  for (const b of baris) {
    const s = simpul.get(b.segmen_id)!;
    const induk = b.induk_segmen_id ? simpul.get(b.induk_segmen_id) : undefined;
    // Induk di penyulang lain (atau sudah nonaktif) → segmen ini jadi akar di
    // penyulangnya sendiri, bukan hilang dari pohon.
    if (induk && induk.penyulang === s.penyulang) induk.cabang.push(s);
    else {
      const a = akar.get(s.penyulang);
      if (a) a.push(s); else akar.set(s.penyulang, [s]);
    }
  }
  return akar;
}

export function useSegmenDaftar(ulp: string, aktif: boolean) {
  // Disimpan bersama ULP-nya: daftar ULP lain tidak boleh tampil sesaat
  // sesudah ULP diganti.
  const [isi, setIsi] = useState<{ ulp: string; baris: BarisSegmen[] } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const sudah = isi?.ulp === ulp;

  useEffect(() => {
    if (!aktif || sudah) return;
    let hidup = true;
    fetchAllRows<BarisSegmen>(() => {
      const q = supabaseBrowser
        .from("segmen_ringkas")
        .select("segmen_id,nama,penyulang,induk_segmen_id,jumlah_tiang,panjang_km")
        .eq("status", "aktif")
        // Segmen tanpa tiang (hasil impor/tempel yang belum dikerjakan) tidak
        // ada yang bisa digambar — 1.188 dari 1.291 segmen per 12 Okt 2026.
        .gt("jumlah_tiang", 0)
        .order("penyulang")
        .order("nama")
        .order("segmen_id");
      return ulp ? q.eq("ulp", ulp) : q;
    }).then(
      (baris) => {
        if (!hidup) return;
        setIsi({ ulp, baris });
        setGalat(null);
      },
      (e: Error) => hidup && setGalat(e.message),
    );
    return () => { hidup = false; };
  }, [ulp, aktif, sudah]);

  const perPenyulang = useMemo(() => (sudah && isi ? susun(isi.baris) : null), [sudah, isi]);
  return { perPenyulang, galat };
}
