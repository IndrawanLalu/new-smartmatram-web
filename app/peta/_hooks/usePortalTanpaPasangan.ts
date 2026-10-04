"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Gardu portal yang masih tercatat SATU tiang (`jtm_portal_tanpa_pasangan`,
 * scripts/jtm-hak-akses-portal.sql). Admin memeriksanya satu per satu di peta
 * lalu membuatkan tiang keduanya — bukan diubah massal (keputusan user 2 Okt
 * 2026), karena letak dan arah tiang kedua perlu dilihat orang.
 */

export interface PortalTanpaPasangan {
  tiangId: string;
  kode: string;
  penyulang: string;
  ulp: string;
  lat: number;
  lng: number;
  nomorGardu: string | null;
}

export function usePortalTanpaPasangan(ulp: string, aktif: boolean) {
  const [daftar, setDaftar] = useState<PortalTanpaPasangan[]>([]);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!aktif) return;
    let hidup = true;
    void (async () => {
      let q = supabaseBrowser
        .from("jtm_portal_tanpa_pasangan")
        .select("tiang_id,kode,penyulang,ulp,lat,lng,nomor_gardu")
        .order("penyulang")
        .order("kode");
      if (ulp) q = q.eq("ulp", ulp);
      const { data } = await q;
      if (!hidup) return;
      setDaftar(
        (data ?? [])
          .filter((x) => x.lat !== null && x.lng !== null)
          .map((x) => ({
            tiangId: x.tiang_id as string,
            kode: x.kode as string,
            penyulang: x.penyulang as string,
            ulp: x.ulp as string,
            lat: Number(x.lat),
            lng: Number(x.lng),
            nomorGardu: (x.nomor_gardu as string) ?? null,
          })),
      );
    })();
    return () => { hidup = false; };
  }, [ulp, aktif, nonce]);

  const muatUlang = useCallback(() => setNonce((n) => n + 1), []);
  return { daftar, muatUlang };
}
