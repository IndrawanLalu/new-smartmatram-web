"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { TitikUjungPeta } from "./useUjungPeta";

/**
 * Jarak gardu → titik ukur lewat kabel JTR (`jarak_jtr_ujung`, SQL
 * tegangan-ujung-jarak-jtr.sql). Diminta per titik saat dibuka, disimpan di
 * tembolok halaman supaya kembali ke titik yang sama tidak bertanya lagi.
 * null = JTR gardunya belum lengkap; undefined = sedang dihitung.
 */

const TEMBOLOK = new Map<string, number | null>();
const SEDANG = new Map<string, Promise<number | null>>();

export function ambilJarakJtr(t: TitikUjungPeta): Promise<number | null> {
  if (TEMBOLOK.has(t.id)) return Promise.resolve(TEMBOLOK.get(t.id) ?? null);
  const ada = SEDANG.get(t.id);
  if (ada) return ada;
  const janji = (async () => {
    const { data, error } = await supabaseBrowser.rpc("jarak_jtr_ujung", {
      p_ulp: t.ulp, p_gardu: t.gardu_kode, p_lat: t.lat, p_lng: t.lng,
    });
    // Galat (mis. SQL belum dijalankan) dianggap "belum ada" tanpa ditembolok.
    const v = error || data === null ? null : Number(data);
    if (!error) TEMBOLOK.set(t.id, v);
    SEDANG.delete(t.id);
    return v;
  })();
  SEDANG.set(t.id, janji);
  return janji;
}

export function useJarakJtr(t: TitikUjungPeta | undefined) {
  const [hasil, setHasil] = useState<{ id: string; m: number | null } | null>(null);
  useEffect(() => {
    if (!t) return;
    let hidup = true;
    void ambilJarakJtr(t).then((m) => {
      if (hidup) setHasil({ id: t.id, m });
    });
    return () => {
      hidup = false;
    };
  }, [t]);
  if (!t) return undefined;
  if (hasil?.id === t.id) return hasil.m;
  return TEMBOLOK.has(t.id) ? (TEMBOLOK.get(t.id) ?? null) : undefined;
}
