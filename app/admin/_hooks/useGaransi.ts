"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Masa garansi pekerjaan (`scripts/wo-daftar-garansi.sql`, 12 Okt 2026).
 * Objek yang di-WO-kan lagi selagi pekerjaan terakhirnya masih bergaransi
 * diberi PERINGATAN — tidak ditolak. Masa garansi diatur di Atur SLA per ULP
 * (kosong = 1 bulan), dihitung sejak pekerjaan selesai; yang belum selesai
 * sejak bulan WO-nya.
 *
 *   useGaransiObjek  layar Susun WO — objek yang masih bergaransi di bulan WO
 *   useGaransiItem   tabel WO       — item yang di-WO-kan dalam masa garansi
 *
 * Kunci objek: segmen_id (perabasan, jtm, jtm2) atau "ULP|KODE" (jtr,
 * hargardu, pengukuran).
 */

export type KunciGaransi = "perabasan" | "jtm" | "jtm2" | "jtr" | "hargardu" | "pengukuran";

export interface InfoGaransi {
  /** Nama WO pekerjaan sebelumnya; null = di luar WO, atau WO gardu (tanpa nama). */
  wo_nama: string | null;
  tgl_wo: string | null;
  /** Tanggal awal garansi: tanggal selesai, atau bulan WO kalau belum selesai. */
  dasar: string;
  selesai: boolean;
  garansi_sampai: string;
}

interface Keadaan {
  kunci: string;
  peta: Map<string, InfoGaransi>;
}

/** Galat diam: peringatan garansi tidak boleh membuat layar WO gagal dibuka
 *  (mis. SQL belum dijalankan) — tanpa peringatan pun WO tetap bisa disusun. */
function useMuat(kunci: string | null, ambil: () => PromiseLike<{ data: unknown; error: unknown }>, kolom: string) {
  const [isi, setIsi] = useState<Keadaan | null>(null);
  useEffect(() => {
    if (!kunci) return;
    let hidup = true;
    void Promise.resolve(ambil()).then(({ data, error }) => {
      if (!hidup) return;
      const baris = error ? [] : ((data ?? []) as (InfoGaransi & Record<string, string>)[]);
      setIsi({ kunci, peta: new Map(baris.map((b) => [b[kolom], b])) });
    });
    return () => { hidup = false; };
    // `ambil` dibuat ulang tiap render; kuncinya yang menentukan kapan dimuat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kunci]);
  return kunci && isi?.kunci === kunci ? isi.peta : KOSONG;
}

const KOSONG = new Map<string, InfoGaransi>();

/** Objek yang masih bergaransi pada bulan WO `tglWo` (YYYY-MM-DD). */
export function useGaransiObjek(jenis: KunciGaransi | null, ulp: string, tglWo: string) {
  const kunci = jenis && ulp ? `${jenis}|${ulp}|${tglWo.slice(0, 7)}` : null;
  return useMuat(
    kunci,
    () => supabaseBrowser.rpc("garansi_objek", { p_kunci: jenis, p_ulp: ulp, p_tgl_wo: `${tglWo.slice(0, 7)}-01` }),
    "objek",
  );
}

/** Item WO (id item) yang di-WO-kan selagi pekerjaan sebelumnya masih bergaransi.
 *  `ulp` kosong = semua ULP. `versi` dinaikkan untuk memuat ulang. */
export function useGaransiItem(jenis: KunciGaransi | null, ulp: string, versi = 0) {
  const kunci = jenis ? `${jenis}|${ulp}|${versi}` : null;
  return useMuat(kunci, () => supabaseBrowser.rpc("garansi_item", { p_kunci: jenis, p_ulp: ulp || null }), "item_id");
}

const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const tgl = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m, d };
};
/** "Okt 2026" */
export const bulanTahun = (iso: string) => {
  const { y, m } = tgl(iso);
  return `${BULAN_PENDEK[m - 1]} ${y}`;
};
/** "20 Okt" */
const hariBulan = (iso: string) => {
  const { m, d } = tgl(iso);
  return `${d} ${BULAN_PENDEK[m - 1]}`;
};

/** "WO Perabasan Sep 2026, selesai 25 Sep" — asal masa garansinya. */
export function asalGaransi(g: InfoGaransi, namaWoGardu?: string) {
  const wo = g.wo_nama ?? (g.tgl_wo ? namaWoGardu : null);
  const di = wo ? `${wo}${g.tgl_wo ? ` ${bulanTahun(g.tgl_wo)}` : ""}` : "Di luar WO";
  return `${di}, ${g.selesai ? `selesai ${hariBulan(g.dasar)}` : "belum selesai"}`;
}
