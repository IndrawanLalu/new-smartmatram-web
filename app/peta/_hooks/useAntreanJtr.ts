"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { InspeksiMenunggu } from "@/app/admin/jtr/_hooks/useApprovalJtr";

/**
 * Antrean persetujuan inspeksi JTR untuk peta — inspeksi yang sudah dikirim
 * regu (status 'Selesai') beserta titik gardunya. Sumbernya sama dengan tabel
 * di /admin/jtr (`jtr_inspeksi`), keputusannya lewat fungsi yang sama.
 */

export interface AntreanJtr extends InspeksiMenunggu {
  lat: number | null;
  lng: number | null;
}

export function useAntreanJtr(ulp: string) {
  const [antrean, setAntrean] = useState<AntreanJtr[]>([]);
  /** Sudah pernah terbaca — membedakan "antrean kosong" dari "belum dimuat". */
  const [siap, setSiap] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      let q = supabaseBrowser.from("jtr_inspeksi").select("*").eq("status", "Selesai").order("tgl_selesai");
      if (ulp) q = q.eq("ulp", ulp);
      const { data } = await q;
      const isi = (data ?? []) as InspeksiMenunggu[];
      const kode = [...new Set(isi.map((d) => d.gardu_kode))];
      const titik = new Map<string, { lat: number; lng: number }>();
      if (kode.length > 0) {
        const { data: g } = await supabaseBrowser.from("peta_gardu").select("kode,ulp,lat,lng").in("kode", kode);
        for (const x of g ?? []) {
          titik.set(`${String(x.kode).toUpperCase()}|${String(x.ulp).toUpperCase()}`, { lat: Number(x.lat), lng: Number(x.lng) });
        }
      }
      if (!hidup) return;
      setAntrean(
        isi.map((d) => {
          const t = titik.get(`${d.gardu_kode.toUpperCase()}|${d.ulp.toUpperCase()}`);
          return { ...d, lat: t?.lat ?? null, lng: t?.lng ?? null };
        }),
      );
      setSiap(true);
    })();
    return () => { hidup = false; };
  }, [ulp, nonce]);

  const muatUlang = useCallback(() => setNonce((n) => n + 1), []);
  return { antrean, siap, muatUlang };
}
