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
  /** Asal temuan: catatan Pemeliharaan Gardu atau kunjungan Inspeksi Gardu. */
  sumber: "pemeliharaan" | "inspeksi_gardu";
  temuan_id: string | null;
  // ── hargardu-temuan-wo.sql ──
  /** 'Di-WO' · 'Belum bisa' (regu menulis alasan) · null = belum di-WO. */
  tl_status: string | null;
  /** wo_tugas (WO "Tindak Lanjut Gardu" lama) · wo_har (WO Pemeliharaan) · perbaikan (WO Perbaikan, dalam garansi). */
  jalur: string | null;
  foto_url: string | null;
  prioritas: string | null;
  petugas_nama: string | null;
  hasil_catatan: string | null;
  /** Hanya baris "Sudah dikerjakan" (gardu_temuan_dikerjakan). */
  dikerjakan?: { pada: string | null; oleh: string | null; fotoSesudah: string | null; jalur: string | null; id: string };
}

export type StatusTemuan = "belum" | "sudah" | "dikerjakan" | "semua";

export interface SaringPerbaikan {
  ulp: string;
  item: string;
  /** Kondisi (nilai) temuan dalam item terpilih, mis. "Rusak". */
  kondisi: string;
  /** "" = semua asal. */
  sumber: "" | "pemeliharaan" | "inspeksi_gardu";
  wo: StatusTemuan;
  cari: string;
}

/** Baris gardu_temuan_dikerjakan → bentuk yang sama dengan daftar tertunda. */
interface BarisDikerjakan {
  id: string; gardu_kode: string; ulp: string; gardu_nama: string | null; gardu_alamat: string | null; penyulang: string | null;
  item_kode: string; item_nama: string; kelompok: string | null; bagian: string; nilai_label: string | null; uraian: string | null;
  sumber: string | null; temuan_id: string | null; jalur: string | null; ditemukan_pada: string | null; ditugaskan_pada: string | null;
  dikerjakan_at: string | null; dikerjakan_oleh: string | null; foto_url: string | null; foto_sesudah_url: string | null;
  hasil_catatan: string | null; prioritas: string | null;
}

const dariDikerjakan = (r: BarisDikerjakan): BarisPerbaikan => ({
  gardu_kode: r.gardu_kode, ulp: r.ulp, gardu_nama: r.gardu_nama, gardu_alamat: r.gardu_alamat, penyulang: r.penyulang,
  item_kode: r.item_kode, item_nama: r.item_nama, kelompok: r.kelompok ?? "", bagian: r.bagian, nilai: null,
  nilai_label: r.nilai_label, catatan: r.uraian, ditemukan_pada: r.ditemukan_pada, pemeliharaan_id: "",
  pr_keterangan: null, catatan_perbaikan: null, sudah_di_wo: true, wo_item_id: null, ditugaskan_pada: r.ditugaskan_pada,
  sumber: r.sumber === "inspeksi_gardu" ? "inspeksi_gardu" : "pemeliharaan", temuan_id: r.temuan_id,
  tl_status: "Dikerjakan", jalur: r.jalur, foto_url: r.foto_url, prioritas: r.prioritas, petugas_nama: null,
  hasil_catatan: r.hasil_catatan,
  dikerjakan: { pada: r.dikerjakan_at, oleh: r.dikerjakan_oleh, fotoSesudah: r.foto_sesudah_url, jalur: r.jalur, id: r.id },
});

/**
 * Kunci baris. View `gardu_perlu_perbaikan` tidak punya id sendiri — dia turunan.
 * Empat kolom inilah yang membuatnya unik, dan itu pula kunci `tindak_lanjut_gardu`.
 */
export const kunciBaris = (b: BarisPerbaikan) =>
  b.dikerjakan ? `dk|${b.dikerjakan.id}` : `${b.gardu_kode}|${b.ulp}|${b.item_kode}|${b.bagian}`;

/** Keadaan satu temuan untuk chip & kolom Work Order. */
export const statusTemuan = (b: BarisPerbaikan): Exclude<StatusTemuan, "semua"> =>
  b.dikerjakan ? "dikerjakan" : b.sudah_di_wo ? "sudah" : "belum";

export function usePerluPerbaikan(user: CurrentUser, saring: SaringPerbaikan) {
  const [semua, setSemua] = useState<BarisPerbaikan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? saring.ulp || null : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, selesai] = await Promise.all([
        fetchAllRows<BarisPerbaikan>(() => {
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
        }),
        // Yang sudah dikerjakan (12 bulan) tetap terlihat — chip "Sudah dikerjakan".
        // Gagal (SQL belum dijalankan) = tanpa riwayat, daftar tertunda tetap tampil.
        fetchAllRows<BarisDikerjakan>(() => {
          const q = supabaseBrowser.from("gardu_temuan_dikerjakan").select("*").order("id");
          return unit ? q.eq("ulp", unit) : q;
        }).catch(() => [] as BarisDikerjakan[]),
      ]);
      setSemua([...rows, ...selesai.map(dariDikerjakan)]);
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
      if (saring.kondisi && (b.nilai_label ?? b.nilai ?? "") !== saring.kondisi) return false;
      if (saring.sumber && b.sumber !== saring.sumber) return false;
      if (saring.wo !== "semua" && statusTemuan(b) !== saring.wo) return false;
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
        b.hasil_catatan,
      ].some((t) => t?.toLowerCase().includes(cari));
    });
  }, [semua, saring.item, saring.kondisi, saring.sumber, saring.wo, saring.cari]);

  /** Isi dropdown item — hanya item yang benar-benar punya temuan menggantung. */
  const pilihanItem = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of semua) m.set(b.item_kode, b.item_nama);
    return [...m]
      .map(([kode, nama]) => ({ kode, nama }))
      .sort((a, b) => a.nama.localeCompare(b.nama));
  }, [semua]);

  /** Isi dropdown kondisi — nilai temuan yang ada untuk item terpilih (atau semua). */
  const pilihanKondisi = useMemo(() => {
    const s = new Set<string>();
    for (const b of semua) if (!saring.item || b.item_kode === saring.item) s.add(b.nilai_label ?? b.nilai ?? "");
    s.delete("");
    return [...s].sort((a, b) => a.localeCompare(b));
  }, [semua, saring.item]);

  /** Jumlah per status (sesudah saringan selain status) — angka di chip. */
  const hitungStatus = useMemo(() => {
    const h = { belum: 0, sudah: 0, dikerjakan: 0 };
    for (const b of semua) {
      if (saring.sumber && b.sumber !== saring.sumber) continue;
      if (saring.item && b.item_kode !== saring.item) continue;
      h[statusTemuan(b)] += 1;
    }
    return h;
  }, [semua, saring.sumber, saring.item]);

  const belumWo = hitungStatus.belum;

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

  return { daftar, semua, pilihanItem, pilihanKondisi, hitungStatus, belumWo, loading, error, muat, tandaiSudahWo };
}
