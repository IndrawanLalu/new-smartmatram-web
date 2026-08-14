"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { SLA_MENIT_BAWAAN } from "../_lib/mvod";

interface BarisSetelan {
  ulp: string;
  sla_menit: number;
}

/**
 * Ambang SLA untuk MVOD, dari tabel `mvod_settings`.
 *
 * Baris khusus ULP menang; kalau tidak ada, jatuh ke baris sentinel `'ALL'`;
 * kalau tabelnya pun belum dibuat, jatuh ke 60. Tanpa cadangan berlapis ini,
 * menyaring per ULP menghasilkan nol baris dan seluruh perhitungan MVOD mati
 * diam-diam — persis yang terjadi pada `yantek_sla` sebelum dibetulkan.
 */
export function useMvodSettings(ulp: string) {
  const [rows, setRows] = useState<BarisSetelan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ambil = useCallback(async () => {
    const { data, error: err } = await supabaseBrowser
      .from("mvod_settings")
      .select("ulp,sla_menit");
    // Tabel belum dibuat bukan kondisi gagal — UI tetap jalan dengan bawaan,
    // hanya sumbernya ditandai "bawaan" di layar.
    return { rows: err ? [] : ((data ?? []) as BarisSetelan[]), error: err?.message ?? null };
  }, []);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const hasil = await ambil();
      if (!hidup) return;
      setRows(hasil.rows);
      setError(hasil.error);
      setLoading(false);
    })();
    return () => { hidup = false; };
  }, [ambil]);

  const cocok = rows.find((r) => r.ulp?.toUpperCase() === ulp.toUpperCase());
  const semua = rows.find((r) => r.ulp?.toUpperCase() === "ALL");
  const slaMenit = cocok?.sla_menit ?? semua?.sla_menit ?? SLA_MENIT_BAWAAN;

  /** `false` = angkanya belum pernah disetel, masih bawaan kode. */
  const tersimpan = Boolean(cocok || semua);
  /** Setelan yang sedang berlaku berasal dari baris ULP, bukan 'ALL'. */
  const khususUlp = Boolean(cocok);

  const simpan = useCallback(async (nilai: number, untukUlp: string) => {
    setSaving(true);
    setError(null);
    const kunci = untukUlp || "ALL";
    const { error: err } = await supabaseBrowser
      .from("mvod_settings")
      .upsert(
        { ulp: kunci, sla_menit: nilai, updated_at: new Date().toISOString() },
        { onConflict: "ulp" },
      );
    if (err) {
      setError(err.message);
      setSaving(false);
      return err.message;
    }
    const hasil = await ambil();
    setRows(hasil.rows);
    setSaving(false);
    return null;
  }, [ambil]);

  return { slaMenit, tersimpan, khususUlp, loading, saving, error, simpan };
}
