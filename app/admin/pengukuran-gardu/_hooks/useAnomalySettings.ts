"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type AnomalySettings, DEFAULT_SETTINGS } from "../_utils/detectAnomali";

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAnomalySettings(ulp: string) {
  const [settings, setSettings] = useState<AnomalySettings>(DEFAULT_SETTINGS);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [savedAt, setSavedAt]   = useState<Date | null>(null);

  // Gunakan ULP aktif, fallback ke 'ALL' jika tidak ada (UP3 tanpa filter)
  const ulpKey = ulp || "ALL";

  const fetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseBrowser
      .from("anomali_settings")
      .select("max_beban_trafo_pct, max_arus_jurusan_a, max_unbalance_pct, max_suhu_trafo_c, min_kva_trafo, max_kva_trafo")
      .eq("ulp", ulpKey)
      .maybeSingle();

    if (!error && data) {
      setSettings({
        max_beban_trafo_pct: data.max_beban_trafo_pct ?? null,
        max_arus_jurusan_a:  data.max_arus_jurusan_a  ?? null,
        max_unbalance_pct:   data.max_unbalance_pct   ?? null,
        max_suhu_trafo_c:    data.max_suhu_trafo_c    ?? null,
        min_kva_trafo:       data.min_kva_trafo       ?? null,
        max_kva_trafo:       data.max_kva_trafo       ?? null,
      });
    } else {
      setSettings(DEFAULT_SETTINGS);
    }
    setLoading(false);
  }, [ulpKey]);

  useEffect(() => { fetch(); }, [fetch]);

  const save = useCallback(async (patch: Partial<AnomalySettings>) => {
    setSaving(true);
    const next = { ...settings, ...patch };
    const { error } = await supabaseBrowser
      .from("anomali_settings")
      .upsert({ ulp: ulpKey, ...next, updated_at: new Date().toISOString() }, { onConflict: "ulp" });

    if (!error) {
      setSettings(next);
      setSavedAt(new Date());
    }
    setSaving(false);
    return !error;
  }, [settings, ulpKey]);

  const reset = useCallback(async () => {
    await save(DEFAULT_SETTINGS);
  }, [save]);

  return { settings, loading, saving, savedAt, save, reset };
}
