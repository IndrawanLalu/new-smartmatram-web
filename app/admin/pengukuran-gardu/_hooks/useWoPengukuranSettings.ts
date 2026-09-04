"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { DEFAULT_WO_SETTINGS, type WoSettings } from "../_lib/kandidatWo";

const KOLOM =
  "ulp,ambang_beban_pct,bulan_beban_tinggi,bulan_beban_rendah,kuota_per_bulan,sertakan_belum_pernah,hanya_gardu_aktif";

/**
 * Pengaturan WO Pengukuran.
 *
 * SELURUH baris ditarik, bukan hanya milik ULP yang sedang aktif. Sebabnya UP3
 * tanpa filter menerbitkan satu WO untuk tiap ULP sekaligus, dan tiap ULP harus
 * memakai kuota serta ambangnya sendiri — bukan angka 'ALL' yang kebetulan
 * sedang tampil di panel. Barisnya lima, jadi menariknya sekalian tidak
 * menambah beban yang berarti.
 */
export function useWoPengukuranSettings(ulp: string) {
  const [peta, setPeta] = useState<Map<string, WoSettings>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  /** ULP yang sedang disunting di panel. UP3 tanpa filter menyunting 'ALL'. */
  const ulpKey = ulp || "ALL";

  const muat = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseBrowser.from("wo_pengukuran_settings").select(KOLOM);

    const baru = new Map<string, WoSettings>();
    if (!error && data) {
      for (const r of data as (WoSettings & { ulp: string })[]) {
        baru.set(r.ulp, {
          ambang_beban_pct: Number(r.ambang_beban_pct),
          bulan_beban_tinggi: Number(r.bulan_beban_tinggi),
          bulan_beban_rendah: Number(r.bulan_beban_rendah),
          kuota_per_bulan: Number(r.kuota_per_bulan),
          sertakan_belum_pernah: r.sertakan_belum_pernah,
          hanya_gardu_aktif: r.hanya_gardu_aktif,
        });
      }
    }
    setPeta(baru);
    setLoading(false);
  }, []);

  useEffect(() => { muat(); }, [muat]);

  /** Kriteria yang berlaku untuk satu ULP: miliknya sendiri, kalau belum ada
   *  jatuh ke 'ALL', kalau itu pun belum ada ke bawaan kode. */
  const settingsUntuk = useCallback(
    (u: string): WoSettings => peta.get(u) ?? peta.get("ALL") ?? DEFAULT_WO_SETTINGS,
    [peta],
  );

  const settings = useMemo(() => settingsUntuk(ulpKey), [settingsUntuk, ulpKey]);

  const simpan = useCallback(
    async (patch: Partial<WoSettings>) => {
      setSaving(true);
      const next = { ...settings, ...patch };
      const { error } = await supabaseBrowser
        .from("wo_pengukuran_settings")
        .upsert({ ulp: ulpKey, ...next, updated_at: new Date().toISOString() }, { onConflict: "ulp" });

      if (!error) {
        setPeta((lama) => new Map(lama).set(ulpKey, next));
        setSavedAt(new Date());
      }
      setSaving(false);
      return !error;
    },
    [settings, ulpKey],
  );

  const reset = useCallback(() => simpan(DEFAULT_WO_SETTINGS), [simpan]);

  return { settings, settingsUntuk, ulpKey, loading, saving, savedAt, simpan, reset };
}
