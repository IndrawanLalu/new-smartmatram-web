"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * SLA bulanan satu jenis pekerjaan (`sla_kinerja`, diisi lewat Atur SLA di
 * Rekap Kinerja) — dipakai layar Susun WO supaya admin melihat target
 * bulanannya SAAT menyusun WO, bukan sesudahnya di rekap.
 *
 * Tabelnya kecil (ULP × jenis × perubahan), jadi ditarik utuh sekali.
 * Mengembalikan fungsi: SLA yang berlaku untuk ULP itu di bulan tanggal itu,
 * null = belum ada SLA.
 */
export function useSlaBulanan(kunci: string) {
  const [baris, setBaris] = useState<{ ulp: string; berlaku_mulai: string; target: number | string | null }[]>([]);

  useEffect(() => {
    let hidup = true;
    supabaseBrowser
      .from("sla_kinerja")
      .select("ulp,berlaku_mulai,target")
      .eq("kunci", kunci)
      .order("berlaku_mulai", { ascending: false })
      .then(({ data }) => {
        if (hidup) setBaris(data ?? []);
      });
    return () => { hidup = false; };
  }, [kunci]);

  return useCallback(
    (ulp: string, tgl: string): number | null => {
      const awal = `${tgl.slice(0, 7)}-01`;
      const r = baris.find((x) => x.ulp === ulp.toUpperCase() && x.berlaku_mulai <= awal);
      return r?.target === null || r?.target === undefined ? null : Number(r.target);
    },
    [baris],
  );
}
