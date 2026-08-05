"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/** Dipakai kalau tabel `yantek_sla` belum dibuat atau barisnya belum ada.
 *  Angka nol tidak boleh jadi default — semua WO akan terhitung melanggar. */
export const SLA_DEFAULT = { response: 45, recovery: 90 };

export interface SlaRow {
  ulp: string;
  target_response_menit: number;
  target_recovery_menit: number;
}

export interface SlaAktif {
  response: number;
  recovery: number;
  /** Dari mana angkanya: baris ULP sendiri, baris 'ALL', atau default kode.
   *  Ditampilkan di UI supaya jelas ambangnya memang disetel atau cuma bawaan. */
  sumber: "ulp" | "all" | "default";
}

/**
 * Ambang SLA yantek dengan pembacaan berjenjang: baris ULP → 'ALL' → default.
 *
 * Seluruh baris ditarik sekali (tabelnya paling banyak 5 baris) supaya ganti
 * filter ULP tidak memicu query baru.
 */
export function useYantekSla(ulp: string | null) {
  const [rows, setRows] = useState<SlaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Ambil saja, tanpa menyentuh state — supaya effect di bawah tidak
   *  memanggil setState secara sinkron (pemicu render berantai). */
  const ambil = useCallback(async () => {
    const { data, error: err } = await supabaseBrowser
      .from("yantek_sla")
      .select("ulp,target_response_menit,target_recovery_menit");
    // Tabel belum dibuat bukan kondisi gagal — UI tetap jalan dengan default,
    // hanya sumbernya ditandai "default".
    return { rows: err ? [] : ((data ?? []) as SlaRow[]), error: err?.message ?? null };
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

  const load = useCallback(async () => {
    setLoading(true);
    const hasil = await ambil();
    setRows(hasil.rows);
    setError(hasil.error);
    setLoading(false);
  }, [ambil]);

  const sla = useMemo<SlaAktif>(() => {
    const perUlp = ulp ? rows.find((r) => r.ulp === ulp) : undefined;
    if (perUlp) {
      return { response: perUlp.target_response_menit, recovery: perUlp.target_recovery_menit, sumber: "ulp" };
    }
    const all = rows.find((r) => r.ulp === "ALL");
    if (all) {
      return { response: all.target_response_menit, recovery: all.target_recovery_menit, sumber: "all" };
    }
    return { ...SLA_DEFAULT, sumber: "default" };
  }, [rows, ulp]);

  const simpan = useCallback(
    async (target: string, response: number, recovery: number) => {
      setSaving(true);
      const { error: err } = await supabaseBrowser
        .from("yantek_sla")
        .upsert(
          {
            ulp: target,
            target_response_menit: response,
            target_recovery_menit: recovery,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ulp" },
        );
      setSaving(false);
      if (err) { setError(err.message); return false; }
      await load();
      return true;
    },
    [load],
  );

  return { sla, rows, loading, saving, error, simpan, refresh: load };
}
