"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { isoTgl, jumlahHari, PENGATURAN_KOSONG, type ObjekWo, type PengaturanSurat } from "../_lib/woSurat";

/**
 * Bahan surat WO satu ULP satu bulan: angka (= WO terbit Rekap Kinerja),
 * objek lampiran, pengaturan surat, hari libur, dan surat yang pernah terbit.
 * Semua diambil sekaligus; yang gagal membuat seluruhnya gagal — surat yang
 * setengah terisi lebih berbahaya daripada surat yang tidak jadi.
 */

export interface SuratTerbit {
  nomor: string;
  tgl_surat: string;
  oleh: string | null;
  updated_at: string;
}

export interface DataSurat {
  angka: Record<string, number | null>;
  objek: ObjekWo[];
  set: PengaturanSurat;
  libur: { tanggal: string; keterangan: string }[];
  terbit: SuratTerbit | null;
  /** Jenis yang WO-nya dari tempelan bulan ini. */
  manual: Set<string>;
}

interface RekapRpc {
  kunci: string;
  wo_terbit: number | string | null;
}

async function muat(ulp: string, tahun: number, bulan: number): Promise<DataSurat> {
  const awal = isoTgl(tahun, bulan, 1);
  const akhir = isoTgl(tahun, bulan, jumlahHari(tahun, bulan));
  const [rekap, objek, set, libur, terbit, manual] = await Promise.all([
    supabaseBrowser.rpc("rekap_kinerja", { p_ulp: ulp, p_tahun: tahun, p_bulan: bulan }),
    // Pengukuran saja bisa ratusan gardu sebulan — jangan terpotong di 1000.
    fetchAllRows<ObjekWo>(() =>
      supabaseBrowser
        .rpc("wo_surat_objek", { p_ulp: ulp, p_tahun: tahun, p_bulan: bulan })
        .order("kunci")
        .order("urutan"),
    ),
    supabaseBrowser.from("wo_surat_pengaturan").select("*").eq("ulp", ulp).maybeSingle(),
    supabaseBrowser.from("hari_libur").select("tanggal,keterangan").gte("tanggal", awal).lte("tanggal", akhir),
    supabaseBrowser
      .from("wo_surat")
      .select("nomor,tgl_surat,oleh,updated_at")
      .eq("ulp", ulp).eq("tahun", tahun).eq("bulan", bulan)
      .maybeSingle(),
    supabaseBrowser.from("wo_manual").select("jenis").eq("ulp", ulp).eq("tahun", tahun).eq("bulan", bulan),
  ]);
  const gagal = rekap.error ?? set.error ?? libur.error ?? terbit.error ?? manual.error;
  if (gagal) throw new Error(gagal.message);

  return {
    angka: Object.fromEntries(
      ((rekap.data ?? []) as RekapRpc[]).map((r) => [r.kunci, r.wo_terbit === null ? null : Number(r.wo_terbit)]),
    ),
    objek: objek.map((o) => ({
      ...o,
      km: o.km === null ? null : Number(o.km),
      kva: o.kva === null ? null : Number(o.kva),
    })),
    set: (set.data as PengaturanSurat | null) ?? PENGATURAN_KOSONG(ulp),
    libur: (libur.data ?? []) as DataSurat["libur"],
    terbit: (terbit.data as SuratTerbit | null) ?? null,
    manual: new Set((manual.data ?? []).map((m: { jenis: string }) => m.jenis)),
  };
}

export function useWoSurat(ulp: string, tahun: number, bulan: number) {
  const [nonce, setNonce] = useState(0);
  const kunci = `${ulp}|${tahun}|${bulan}|${nonce}`;
  // Hasil disimpan bersama kuncinya: "memuat" = hasil yang ada bukan milik
  // pilihan yang sekarang — tanpa setState tambahan di tiap pemicu.
  const [hasil, setHasil] = useState<{ kunci: string; data: DataSurat | null; galat: string | null } | null>(null);

  useEffect(() => {
    let hidup = true;
    muat(ulp, tahun, bulan)
      .then((data) => { if (hidup) setHasil({ kunci, data, galat: null }); })
      .catch((e: Error) => { if (hidup) setHasil({ kunci, data: null, galat: e.message }); });
    return () => { hidup = false; };
  }, [kunci, ulp, tahun, bulan]);

  const kini = hasil?.kunci === kunci ? hasil : null;
  return {
    data: kini?.data ?? null,
    galat: kini?.galat ?? null,
    loading: kini === null,
    muatUlang: () => setNonce((n) => n + 1),
  };
}
