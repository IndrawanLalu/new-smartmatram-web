"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

export interface Usulan {
  id: string;
  entitas: string;
  entitas_kode: string;
  ulp: string;
  field: string;
  nilai_lama: { lat?: number; lng?: number; nilai?: unknown } | null;
  nilai_baru: { lat?: number; lng?: number; nilai?: unknown };
  bukti_akurasi: number | null;
  bukti_selisih: number | null;
  bukti_foto: string[];
  catatan: string | null;
  pengusul_nama: string | null;
  diusulkan_at: string;
  /** true = master SUDAH berubah; menolak berarti mengembalikannya. */
  diterapkan_langsung: boolean;
  gardu_nama: string | null;
  gardu_alamat: string | null;
  penyulang: string | null;
}

export function useUsulanKoreksi(user: CurrentUser) {
  const [usulan, setUsulan] = useState<Usulan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memproses, setMemproses] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? null : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabaseBrowser.from("master_usulan_menunggu").select("*");
      if (unit) q = q.eq("ulp", unit);
      const { data, error: e } = await q;
      if (e) throw new Error(e.message);
      setUsulan((data ?? []) as Usulan[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat usulan");
    } finally {
      setLoading(false);
    }
  }, [unit]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /**
   * Setujui atau tolak.
   *
   * Menolak koreksi yang sudah terlanjur diterapkan akan MENGEMBALIKAN master ke
   * nilai lamanya — itu dikerjakan fungsi di database, bukan di sini, supaya
   * pengembalian dan pencatatannya tidak pernah terpisah.
   *
   * Baris dibuang dari daftar secara lokal, tanpa memuat ulang semuanya: daftar
   * ini pendek dan admin biasanya memutuskan beberapa berturut-turut.
   */
  const putuskan = useCallback(
    async (id: string, setuju: boolean, alasan?: string) => {
      setMemproses(id);
      try {
        const { error: e } = await supabaseBrowser.rpc("putuskan_usulan", {
          p_id: id,
          p_setuju: setuju,
          p_nama: user.name ?? user.email ?? null,
          p_alasan: alasan ?? null,
        });
        if (e) throw new Error(e.message);
        setUsulan((s) => s.filter((u) => u.id !== id));
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Gagal menyimpan keputusan");
        return false;
      } finally {
        setMemproses(null);
      }
    },
    [user.name, user.email],
  );

  return { usulan, loading, error, memproses, putuskan, muat, setError };
}
