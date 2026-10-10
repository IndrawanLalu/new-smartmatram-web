"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Realisasi } from "./useWoPerabasan";

/**
 * Tiga macam pohon satu segmen WO Perabasan (Cek Perabasan C4, 10 Okt 2026):
 *
 *   inspeksi          `perabasan_pohon` — vegetasi dari inspeksi JTM
 *   perabasan         `perabasan_realisasi` — yang dirabas regu
 *   hasil pengecekan  `perabasan_cek_pohon_status` — dititik pengecek, wajib
 *                     dirabas regu (scripts/perabasan-cek.sql)
 *
 * Dimuat saat modalnya dibuka, bukan seluruh tabel tiap kunjungan.
 */

export interface PohonInspeksi {
  tiang_id: string;
  tiang_kode: string | null;
  vegetasi: string;
  jenis_pohon: string | null;
  foto_url: string | null;
  terverifikasi: boolean;
}

export interface PohonCek {
  id: string;
  putaran: number;
  lat: number;
  lng: number;
  jenis_pohon: string;
  foto_url: string;
  foto_url_2: string | null;
  foto_url_3: string | null;
  catatan: string | null;
  dicek_oleh: string | null;
  dicek_at: string;
  dirabas: boolean;
  rabas_foto_sesudah_url: string | null;
  dirabas_oleh: string | null;
}

export interface PohonSegmen {
  realisasi: (Realisasi & { cek_pohon_id: string | null })[];
  cek: PohonCek[];
  inspeksi: PohonInspeksi[];
}

export function usePohonSegmenRabas(itemId: string, segmenId: string) {
  const [isi, setIsi] = useState<PohonSegmen | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void Promise.all([
      supabaseBrowser.from("perabasan_realisasi").select("*").eq("item_id", itemId).order("dikerjakan_at"),
      supabaseBrowser
        .from("perabasan_cek_pohon_status")
        .select("id,putaran,lat,lng,jenis_pohon,foto_url,foto_url_2,foto_url_3,catatan,dicek_oleh,dicek_at,dirabas,rabas_foto_sesudah_url,dirabas_oleh")
        .eq("item_id", itemId)
        .order("dicek_at"),
      supabaseBrowser
        .from("perabasan_pohon")
        .select("tiang_id,tiang_kode,vegetasi,jenis_pohon,foto_url,terverifikasi")
        .eq("segmen_id", segmenId),
    ]).then(([r, c, p]) => {
      if (!hidup) return;
      const e = r.error ?? c.error ?? p.error;
      if (e) {
        setGalat(e.message);
        return;
      }
      setIsi({
        realisasi: (r.data ?? []) as PohonSegmen["realisasi"],
        cek: (c.data ?? []) as PohonCek[],
        inspeksi: (p.data ?? []) as PohonInspeksi[],
      });
    });
    return () => { hidup = false; };
  }, [itemId, segmenId]);

  return { isi, galat };
}
