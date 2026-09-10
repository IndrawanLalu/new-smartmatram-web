"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

/** Satu temuan yang masih menggantung — satu item, satu bagian, satu gardu. */
export interface BarisPerbaikan {
  gardu_kode: string;
  ulp: string;
  gardu_nama: string | null;
  gardu_alamat: string | null;
  penyulang: string | null;
  item_kode: string;
  item_nama: string;
  kelompok: string;
  bagian: string;
  nilai: string | null;
  nilai_label: string | null;
  catatan: string | null;
  ditemukan_pada: string | null;
  pemeliharaan_id: string;
  pr_keterangan: string | null;
  catatan_perbaikan: string | null;
  sudah_di_wo: boolean;
  wo_item_id: string | null;
  ditugaskan_pada: string | null;
}

export interface SaringPerbaikan {
  ulp: string;
  item: string;
  wo: "semua" | "belum" | "sudah";
  cari: string;
}

/**
 * Kunci baris. View `gardu_perlu_perbaikan` tidak punya id sendiri — dia turunan.
 * Empat kolom inilah yang membuatnya unik, dan itu pula kunci `tindak_lanjut_gardu`.
 */
export const kunciBaris = (b: BarisPerbaikan) =>
  `${b.gardu_kode}|${b.ulp}|${b.item_kode}|${b.bagian}`;

export function usePerluPerbaikan(user: CurrentUser, saring: SaringPerbaikan) {
  const [semua, setSemua] = useState<BarisPerbaikan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? saring.ulp || null : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAllRows<BarisPerbaikan>(() => {
        // Urutannya ikut kunci baris SELURUHNYA — termasuk `ulp`. Paginasi
        // PostgREST memotong per 1000 baris, dan urutan yang tidak unik membuat
        // baris lompat atau terhitung dua kali di batas halaman.
        const q = supabaseBrowser
          .from("gardu_perlu_perbaikan")
          .select("*")
          .order("ulp", { ascending: true })
          .order("gardu_kode", { ascending: true })
          .order("item_kode", { ascending: true })
          .order("bagian", { ascending: true });
        return unit ? q.eq("ulp", unit) : q;
      });
      setSemua(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat pekerjaan tertunda");
      setSemua([]);
    } finally {
      setLoading(false);
    }
  }, [unit]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /**
   * Dua cara mencari, dua-duanya dipakai: saringan per item untuk yang sudah
   * dibakukan, pencarian teks untuk yang tidak akan pernah bisa dibakukan —
   * keterangan PR dan catatan regu.
   */
  const daftar = useMemo(() => {
    const cari = saring.cari.trim().toLowerCase();
    return semua.filter((b) => {
      if (saring.item && b.item_kode !== saring.item) return false;
      if (saring.wo === "belum" && b.sudah_di_wo) return false;
      if (saring.wo === "sudah" && !b.sudah_di_wo) return false;
      if (!cari) return true;
      return [
        b.gardu_kode,
        b.gardu_nama,
        b.gardu_alamat,
        b.penyulang,
        b.item_nama,
        b.nilai_label,
        b.catatan,
        b.pr_keterangan,
        b.catatan_perbaikan,
      ].some((t) => t?.toLowerCase().includes(cari));
    });
  }, [semua, saring.item, saring.wo, saring.cari]);

  /** Isi dropdown item — hanya item yang benar-benar punya temuan menggantung. */
  const pilihanItem = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of semua) m.set(b.item_kode, b.item_nama);
    return [...m]
      .map(([kode, nama]) => ({ kode, nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }, [semua]);

  const belumWo = useMemo(() => semua.filter((b) => !b.sudah_di_wo).length, [semua]);

  /**
   * Tandai baris-baris ini sudah di-WO tanpa memuat ulang seluruh daftar —
   * satu penugasan tidak mengubah baris yang lain.
   */
  const tandaiSudahWo = useCallback((kunci: string[], pada: string) => {
    const set = new Set(kunci);
    setSemua((prev) =>
      prev.map((b) =>
        set.has(kunciBaris(b)) ? { ...b, sudah_di_wo: true, ditugaskan_pada: pada } : b,
      ),
    );
  }, []);

  return { daftar, semua, pilihanItem, belumWo, loading, error, muat, tandaiSudahWo };
}
