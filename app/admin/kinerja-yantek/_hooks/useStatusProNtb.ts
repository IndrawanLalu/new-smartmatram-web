"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { RingkasKunci } from "../_lib/cekProNtb";

/**
 * Status PRO NTB untuk Rekap Kinerja (scripts/pro-ntb-cek.sql): hasil cek
 * TERSIMPAN — dibaca dari database, bukan dari spreadsheet, supaya membuka
 * halaman tetap ringan. Dicek ulang tiap malam, sesudah kirim, atau lewat
 * tombol "Cek PRO NTB sekarang".
 */

export interface CekUlp {
  ulp: string;
  sampai: string | null;
  dicek_at: string;
  sumber: string;
  galat: string | null;
}

export interface StatusProNtb {
  /** ULP yang tampil (satu, atau semua untuk UP3). */
  ulp: string[];
  cek: Map<string, CekUlp>;
  /** ulp → kunci → ringkasan. */
  ringkas: Map<string, Map<string, RingkasKunci>>;
}

export function useStatusProNtb(ulp: string, tahun: number, bulan: number) {
  const kodeBulan = bulan ? `${tahun}-${String(bulan).padStart(2, "0")}` : null;
  const [status, setStatus] = useState<StatusProNtb | null>(null);
  const [mengecek, setMengecek] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!kodeBulan) return;
    let hidup = true;
    (async () => {
      let qu = supabaseBrowser.from("pro_ntb_cek_ulp").select("ulp,sampai,dicek_at,sumber,galat").eq("bulan", kodeBulan);
      let qk = supabaseBrowser.from("pro_ntb_cek").select("*").eq("bulan", kodeBulan);
      if (ulp !== "SEMUA") { qu = qu.eq("ulp", ulp); qk = qk.eq("ulp", ulp); }
      const [u, k, s] = await Promise.all([qu, qk, supabaseBrowser.from("pro_ntb_sheet").select("ulp")]);
      if (!hidup) return;
      // Tabel belum dibuat (SQL belum dijalankan) = kolom PRO NTB kosong, bukan galat halaman.
      if (u.error || k.error) { setStatus(null); return; }
      const ringkas = new Map<string, Map<string, RingkasKunci>>();
      for (const r of (k.data ?? []) as (RingkasKunci & { ulp: string })[]) {
        (ringkas.get(r.ulp) ?? ringkas.set(r.ulp, new Map()).get(r.ulp)!).set(r.kunci, {
          ...r, smart_jumlah: Number(r.smart_jumlah), sheet_jumlah: Number(r.sheet_jumlah),
          smart_wo: r.smart_wo === null ? null : Number(r.smart_wo), sheet_wo: r.sheet_wo === null ? null : Number(r.sheet_wo),
        });
      }
      const berSheet = (s.data ?? []).map((x) => x.ulp as string);
      setStatus({
        ulp: ulp === "SEMUA" ? berSheet.sort() : [ulp],
        cek: new Map(((u.data ?? []) as CekUlp[]).map((c) => [c.ulp, c])),
        ringkas,
      });
    })();
    return () => { hidup = false; };
  }, [ulp, kodeBulan, nonce]);

  const cekSekarang = useCallback(async () => {
    if (!kodeBulan) return;
    setMengecek(true);
    setGalat(null);
    try {
      const r = await fetch("/api/pro-ntb/cek", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ulp, bulan: kodeBulan }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
      setNonce((n) => n + 1);
    } catch (e) {
      setGalat((e as Error).message);
    } finally {
      setMengecek(false);
    }
  }, [ulp, kodeBulan]);

  return { status: kodeBulan ? status : null, mengecek, galat, cekSekarang, adaBulan: !!kodeBulan };
}
