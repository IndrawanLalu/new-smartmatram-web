"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";

/**
 * Persetujuan pengukuran gardu.
 *
 * Tiga kelompok, dua di antaranya MENAHAN realisasi dan satu tidak:
 *
 *   titik diperbarui — menahan · master SUDAH berubah, ditolak = dikembalikan
 *   beda kVA         — menahan · master BELUM berubah, menunggu disetujui
 *   anomali hasil ukur — TIDAK menahan · tidak ada master yang perlu diubah
 *
 * Yang dua pertama datang dari `master_usulan` lewat view
 * `pengukuran_persetujuan`; yang ketiga dihitung di layar dari ambang per ULP,
 * karena memang tidak melahirkan usulan apa pun.
 */

export interface UsulanUkur {
  usulan_id: string;
  kode_gardu: string;
  ulp: string;
  field: "koordinat" | "daya" | string;
  nilai_lama: { lat?: number; lng?: number; nilai?: number } | null;
  nilai_baru: { lat?: number; lng?: number; nilai?: number };
  bukti_lat: number | null;
  bukti_lng: number | null;
  bukti_akurasi: number | null;
  /** Meter dari titik lama. NULL = master memang belum punya titik. */
  bukti_selisih: number | null;
  bukti_foto: string[];
  catatan: string | null;
  pengusul_nama: string | null;
  diusulkan_at: string;
  diterapkan_langsung: boolean;
  pengukuran_id: string | null;

  nama_gardu: string | null;
  alamat: string | null;
  penyulang: string | null;
  kva_master: number | null;
  lat_master: number | null;
  lng_master: number | null;

  tanggal_pengukuran: string | null;
  jam_pengukuran: string | null;
  kva_ukur: number | null;
  persen_beban: number | null;
  beban_kva: number | null;
  suhu_trafo: number | null;
  total_arus_r: number | null;
  total_arus_s: number | null;
  total_arus_t: number | null;
  petugas_nama: string | null;
  foto_arus: string | null;
  foto_tegangan: string | null;
}

const KOLOM =
  "usulan_id,kode_gardu,ulp,field,nilai_lama,nilai_baru,bukti_lat,bukti_lng,bukti_akurasi,bukti_selisih,bukti_foto,catatan,pengusul_nama,diusulkan_at,diterapkan_langsung,pengukuran_id,nama_gardu,alamat,penyulang,kva_master,lat_master,lng_master,tanggal_pengukuran,jam_pengukuran,kva_ukur,persen_beban,beban_kva,suhu_trafo,total_arus_r,total_arus_s,total_arus_t,petugas_nama,foto_arus,foto_tegangan";

export function usePersetujuanUkur(user: CurrentUser) {
  const toast = useToast();
  const [usulan, setUsulan] = useState<UsulanUkur[]>([]);
  const [loading, setLoading] = useState(true);

  const muat = useCallback(async () => {
    try {
      let q = supabaseBrowser
        .from("pengukuran_persetujuan")
        .select(KOLOM)
        .order("diusulkan_at", { ascending: false });
      if (!canSeeAllUnits(user.role) && user.unit) q = q.eq("ulp", user.unit);

      const { data, error } = await q;
      if (error) throw new Error(error.message);
      setUsulan((data ?? []) as unknown as UsulanUkur[]);
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(
        pesan.includes("does not exist") || pesan.includes("schema cache")
          ? "View pengukuran_persetujuan belum ada — jalankan scripts/pengukuran-kunci-titik.sql di Supabase."
          : pesan,
      );
    } finally {
      setLoading(false);
    }
  }, [toast, user]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const putuskan = useCallback(
    async (usulanId: string, setuju: boolean, alasan: string, oleh?: string) => {
      const { error } = await supabaseBrowser.rpc("putuskan_usulan", {
        p_id: usulanId,
        p_setuju: setuju,
        p_nama: oleh ?? null,
        p_alasan: alasan || null,
      });
      if (error) {
        toast.error(error.message);
        return false;
      }
      // Dikeluarkan dari daftar di tempat, bukan dengan memuat ulang semuanya —
      // admin memutuskan berturut-turut, dan daftar yang berkedip tiap kali
      // membuat baris berikutnya meloncat dari bawah telunjuknya.
      setUsulan((prev) => prev.filter((u) => u.usulan_id !== usulanId));
      toast.success(
        setuju
          ? "Disetujui — pengukurannya kini terhitung realisasi."
          : "Ditolak. Master dikembalikan ke nilai sebelumnya.",
      );
      return true;
    },
    [toast],
  );

  const titik = useMemo(() => usulan.filter((u) => u.field === "koordinat"), [usulan]);
  const kva = useMemo(() => usulan.filter((u) => u.field === "daya"), [usulan]);

  return { usulan, titik, kva, loading, muat, putuskan };
}
