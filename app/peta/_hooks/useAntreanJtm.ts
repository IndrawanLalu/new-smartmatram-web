"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { InspeksiJtm } from "@/app/admin/jtm/_hooks/useDaftarJtm";

/**
 * Antrean persetujuan inspeksi JTM untuk peta — inspeksi segmen yang sudah
 * dikirim regu (status 'Selesai'). Sumbernya sama dengan tabel di /admin/jtm
 * (`inspeksi_jtm_ringkas`), keputusannya lewat fungsi yang sama.
 *
 * Titiknya TIDAK ditarik di sini: satu segmen = puluhan tiang, dan antrean bisa
 * berisi banyak segmen. Tiang segmen dibaca saat satu inspeksi dibuka.
 */

const KOLOM =
  "id,segmen_id,segmen_nama,penyulang,ulp,tier,status,tgl_mulai,tgl_selesai,petugas_nama,catatan,verified_at,verified_by,verified_note,tiang_segmen,tiang_dinilai,jawaban,temuan,jumlah_foto";
const TERBUKA = ["Dijadwalkan", "Dalam Proses", "Selesai", "Ditolak"];

export interface AntreanJtm extends InspeksiJtm {
  /** Catatan terbuka lain di segmen & tier yang sama (sama dengan tabel). */
  kembar: number;
}

export function useAntreanJtm(ulp: string) {
  const [antrean, setAntrean] = useState<AntreanJtm[]>([]);
  const [siap, setSiap] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    void (async () => {
      const isi = await fetchAllRows<InspeksiJtm>(() => {
        let q = supabaseBrowser.from("inspeksi_jtm_ringkas").select(KOLOM).eq("status", "Selesai").order("tgl_selesai").order("id");
        if (ulp) q = q.eq("ulp", ulp);
        return q;
      }).catch(() => [] as InspeksiJtm[]);
      const segmen = [...new Set(isi.map((d) => d.segmen_id).filter((x): x is string => !!x))];
      const terbuka = new Map<string, number>();
      for (let i = 0; i < segmen.length; i += 100) {
        const { data } = await supabaseBrowser
          .from("inspeksi_jtm_ringkas")
          .select("segmen_id,tier")
          .in("segmen_id", segmen.slice(i, i + 100))
          .in("status", TERBUKA);
        for (const r of data ?? []) {
          const k = `${r.segmen_id}|${r.tier}`;
          terbuka.set(k, (terbuka.get(k) ?? 0) + 1);
        }
      }
      if (!hidup) return;
      setAntrean(isi.map((d) => ({ ...d, kembar: Math.max(0, (terbuka.get(`${d.segmen_id}|${d.tier}`) ?? 1) - 1) })));
      setSiap(true);
    })();
    return () => { hidup = false; };
  }, [ulp, nonce]);

  const muatUlang = useCallback(() => setNonce((n) => n + 1), []);
  return { antrean, siap, muatUlang };
}
