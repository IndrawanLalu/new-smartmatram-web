"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { META } from "./useKinerjaYantek";
import { hariIniWita, kelompokkan, type ItemHarian } from "../_lib/realisasiHarian";

/**
 * Realisasi harian satu tanggal — `realisasi_harian` (scripts/realisasi-harian.sql).
 * Satu hari satu ULP paling banyak ratusan baris, di bawah batas 1.000 PostgREST;
 * "Semua ULP" dijaga tetap utuh dengan memeriksa jumlahnya.
 */

export function useRealisasiHarian(ulpAwal: string) {
  const [ulp, gantiUlp] = useState(ulpAwal);
  const [tgl, gantiTgl] = useState(hariIniWita);
  const [item, setItem] = useState<ItemHarian[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    supabaseBrowser
      .rpc("realisasi_harian", { p_ulp: ulp, p_tgl: tgl }, { count: "exact" })
      .then(({ data, error, count }) => {
        if (!hidup) return;
        if (error) {
          setItem([]);
          setGalat(error.message);
        } else {
          const rows = (data ?? []) as Record<string, unknown>[];
          setItem(
            rows.map((r) => ({
              kunci: r.kunci as string,
              bagian: (r.bagian as string | null) ?? null,
              ulp: (r.ulp as string) ?? "",
              objek: (r.objek as string) || "—",
              rincian: (r.rincian as string | null) ?? null,
              petugas: (r.petugas as string | null) ?? null,
              waktu: r.waktu ? String(r.waktu).slice(0, 5) : null,
              km: r.km === null || r.km === undefined ? null : Number(r.km),
              disetujui: !!r.disetujui,
            })),
          );
          // Butir 13: jangan biarkan daftar terpotong diam-diam.
          setGalat(count !== null && count > rows.length ? `Hanya ${rows.length} dari ${count} pekerjaan terbaca — pilih satu ULP.` : null);
        }
        setLoading(false);
      });
    return () => { hidup = false; };
  }, [ulp, tgl, nonce]);

  // "Memuat" dinyalakan oleh PEMICUNYA, bukan di dalam efek.
  const mulai = () => { setLoading(true); setGalat(null); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setTgl = (t: string) => { if (t) { mulai(); gantiTgl(t); } };

  const kelompok = useMemo(() => kelompokkan(item, META), [item]);
  const daftarUlpAda = useMemo(() => [...new Set(item.map((x) => x.ulp))].sort(), [item]);

  return { ulp, setUlp, tgl, setTgl, item, kelompok, daftarUlpAda, loading, galat, muat };
}
