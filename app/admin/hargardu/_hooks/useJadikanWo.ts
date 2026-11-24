"use client";

import { useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { BarisPerbaikan } from "./usePerluPerbaikan";

/**
 * Temuan tertunda → Work Order (scripts/hargardu-temuan-wo.sql, 10 Nov 2026).
 *
 * Jalurnya dipilih SERVER per gardu (`jadikan_wo_temuan_gardu`):
 *   • dalam masa garansi Pemeliharaan Gardu → WO Perbaikan: isiannya hanya
 *     temuan itu, tidak dihitung realisasi;
 *   • luar garansi → gardu masuk WO Pemeliharaan Gardu bulan itu (formulir
 *     lengkap, dihitung realisasi).
 * Dulu semuanya masuk WO tugas "Tindak Lanjut Gardu" (wo_batch) — yang sudah
 * terlanjur terbit dibiarkan (jalur 'wo_tugas').
 */

export interface OpsiWo {
  bulan: number;
  tahun: number;
  regu: string;
  catatan: string;
  oleh: string;
}

export interface HasilJadikanWo {
  /** Gardu yang masuk WO Perbaikan (dalam garansi). */
  perbaikan: number;
  /** Gardu yang masuk WO Pemeliharaan Gardu (luar garansi). */
  woPemeliharaan: number;
  temuan: number;
  ditolak: { objek: string; sebab: string }[];
}

export interface HasilTeruskan {
  tugas: number;
  temuan: number;
  /** Ejaan regu tersimpan, mis. "PERABASAN · RABAS 1". */
  regu: string;
  ditolak: { objek: string; sebab: string }[];
}

const keTemuan = (baris: BarisPerbaikan[]) =>
  baris.map((b) => ({
    gardu_kode: b.gardu_kode,
    ulp: b.ulp,
    item_kode: b.item_kode,
    bagian: b.bagian,
    sumber: b.sumber,
    temuan_id: b.temuan_id,
    item_nama: b.item_nama,
    nilai_label: b.nilai_label ?? b.nilai,
    catatan: [b.catatan, b.pr_keterangan].filter((t) => t && t.trim()).join(" · ") || null,
    ditemukan_pada: b.ditemukan_pada,
    foto_url: b.foto_url,
    prioritas: b.prioritas,
  }));

export function useJadikanWo() {
  const [memproses, setMemproses] = useState(false);

  const kirim = useCallback(async (baris: BarisPerbaikan[], o: OpsiWo): Promise<HasilJadikanWo> => {
    setMemproses(true);
    try {
      const { data, error } = await supabaseBrowser.rpc("jadikan_wo_temuan_gardu", {
        p_temuan: keTemuan(baris),
        p_tahun: o.tahun,
        p_bulan: o.bulan,
        p_regu: o.regu,
        p_catatan: o.catatan || null,
        p_oleh: o.oleh,
      });
      if (error) {
        throw new Error(/jadikan_wo_temuan_gardu/.test(error.message) ? "Jalankan scripts/hargardu-temuan-wo.sql di Supabase dulu." : error.message);
      }
      const h = data as { perbaikan: number; wo_pemeliharaan: number; temuan: number; ditolak: { objek: string; sebab: string }[] };
      return { perbaikan: h.perbaikan, woPemeliharaan: h.wo_pemeliharaan, temuan: h.temuan, ditolak: h.ditolak ?? [] };
    } finally {
      setMemproses(false);
    }
  }, []);

  /**
   * Regu selain HARGAR (24 Nov 2026, scripts/hargardu-temuan-ke-regu.sql):
   * PERABASAN → tugas pohon (inspeksi_pohon), lainnya → tugas regu (inspeksi).
   * Satu tugas per gardu; tidak masuk WO bulanan Pemeliharaan Gardu.
   */
  const teruskan = useCallback(async (baris: BarisPerbaikan[], peran: string, regu: string, catatan: string, oleh: string): Promise<HasilTeruskan> => {
    setMemproses(true);
    try {
      const { data, error } = await supabaseBrowser.rpc("teruskan_temuan_gardu", {
        p_temuan: keTemuan(baris), p_peran: peran, p_regu: regu || null, p_catatan: catatan || null, p_oleh: oleh,
      });
      if (error) {
        throw new Error(/teruskan_temuan_gardu/.test(error.message) ? "Jalankan scripts/hargardu-temuan-ke-regu.sql di Supabase dulu." : error.message);
      }
      const h = data as HasilTeruskan;
      return { ...h, ditolak: h.ditolak ?? [] };
    } finally {
      setMemproses(false);
    }
  }, []);

  return { kirim, teruskan, memproses };
}
