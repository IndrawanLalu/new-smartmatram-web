"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { JenisJaringan } from "./usePemeliharaanJaringan";

/**
 * Tab "Tugas" — semua tugas regu HARJAR: yang lahir dari temuan inspeksi dan
 * yang dibuat manual dari web (`scripts/harjar-tugas-manual.sql`).
 *
 * Tugas yang belum dikerjakan SELALU tampil, apa pun bulan yang dipilih
 * (teknisaplikasi.md butir 7: tunggakan tidak boleh hilang karena bulan
 * berganti). Yang sudah selesai/dibatalkan mengikuti bulan tugas dibuat.
 */

export type StatusTugas = "Ditugaskan" | "Dalam Proses" | "Selesai" | "Dibatalkan";
export const STATUS_TUGAS: StatusTugas[] = ["Ditugaskan", "Dalam Proses", "Selesai", "Dibatalkan"];
export const PRIORITAS_TUGAS = ["Normal", "Scheduled", "Urgent", "Emergency"];

export const NADA_STATUS_TUGAS: Record<string, string> = {
  Ditugaskan: "bg-sky-50 text-sky-700 border-sky-200",
  "Dalam Proses": "bg-amber-50 text-amber-700 border-amber-200",
  Selesai: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

const SUMBER: Record<string, string> = {
  tugas_manual: "Manual",
  inspeksi_jtm: "Temuan JTM",
  inspeksi_jtr: "Temuan JTR",
};

export interface TugasHarjar {
  id: string;
  manual: boolean;
  sumber: string;
  jenis: JenisJaringan | null;
  uraian: string;
  catatan: string | null;
  lokasi: string | null;
  ulp: string;
  penyulang: string;
  koordinat: string | null;
  prioritas: string | null;
  status: string;
  ditugaskan: string | null;
  pembuat: string | null;
  tim: string | null;
  foto: string | null;
  dibatalkanAlasan: string | null;
  dibatalkanOleh: string | null;
  dibatalkanAt: string | null;
  catatanId: string | null;
  catatanPetugas: string | null;
  catatanTgl: string | null;
}

export interface IsianTugas {
  jenis: JenisJaringan;
  penyulang: string;
  uraian: string;
  lokasi: string;
  koordinat: string;
  prioritas: string;
  catatan: string;
}

const teks = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

const petaTugas = (r: Record<string, unknown>): TugasHarjar => {
  const source = (r.source as string) ?? "";
  return {
    id: r.id as string,
    manual: source === "tugas_manual",
    sumber: SUMBER[source] ?? "Temuan",
    jenis: (r.jenis_jaringan as JenisJaringan | null) ?? (source === "inspeksi_jtr" ? "JTR" : source === "inspeksi_jtm" ? "JTM" : null),
    uraian: (r.temuan as string) || "Tugas",
    catatan: teks(r.deskripsi),
    lokasi: teks(r.lokasi),
    ulp: (r.ulp as string) ?? "",
    penyulang: (r.penyulang as string) ?? "",
    koordinat: teks(r.koordinat),
    prioritas: teks(r.prioritas),
    status: (r.status as string) ?? "",
    ditugaskan: teks(r.assigned_at),
    pembuat: teks(r.nama_inspektor),
    tim: teks(r.team_name),
    foto: teks(r.foto_sebelum_url),
    dibatalkanAlasan: teks(r.dibatalkan_alasan),
    dibatalkanOleh: teks(r.dibatalkan_oleh),
    dibatalkanAt: teks(r.dibatalkan_at),
    catatanId: teks(r.catatan_id),
    catatanPetugas: teks(r.catatan_petugas),
    catatanTgl: teks(r.catatan_tgl),
  };
};

/** Batas bulan dalam WITA, sebagai ISO UTC. bulan 0 = sepanjang tahun. */
const batasWita = (tahun: number, bulan: number) => {
  const iso = (t: number, b: number) => new Date(Date.UTC(t, b - 1, 1) - 8 * 3600 * 1000).toISOString();
  return bulan === 0
    ? { awal: iso(tahun, 1), akhir: iso(tahun + 1, 1) }
    : { awal: iso(tahun, bulan), akhir: bulan === 12 ? iso(tahun + 1, 1) : iso(tahun, bulan + 1) };
};

export function useTugasHarjar(ulp: string, tahun: number, bulan: number) {
  const [semua, setSemua] = useState<TugasHarjar[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [status, setStatus] = useState<"SEMUA" | StatusTugas>("SEMUA");
  const [cari, setCari] = useState("");
  const [nonce, setNonce] = useState(0);

  const tarik = useCallback(async () => {
    const { awal, akhir } = batasWita(tahun, bulan);
    return fetchAllRows<Record<string, unknown>>(() => {
      let x = supabaseBrowser
        .from("harjar_tugas")
        .select("*")
        .or(`status.in.("Ditugaskan","Dalam Proses"),and(assigned_at.gte.${awal},assigned_at.lt.${akhir})`)
        .order("assigned_at", { ascending: false })
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    });
  }, [ulp, tahun, bulan]);

  useEffect(() => {
    let hidup = true;
    tarik().then(
      (data) => {
        if (!hidup) return;
        setSemua(data.map(petaTugas));
        setGalat(null);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        setSemua([]);
        setGalat(e.message);
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [tarik, nonce]);

  const muat = () => { setLoading(true); setGalat(null); setNonce((n) => n + 1); };

  /** Tersaring cari, BELUM status — dasar hitungan chip. */
  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    if (!k) return semua;
    return semua.filter((t) =>
      [t.penyulang, t.uraian, t.lokasi ?? "", t.catatanPetugas ?? "", t.pembuat ?? ""].some((v) => v.toUpperCase().includes(k)),
    );
  }, [semua, cari]);

  const baris = useMemo(
    () => dasarChip.filter((t) => status === "SEMUA" || t.status === status),
    [dasarChip, status],
  );

  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_TUGAS.map((s) => [s, 0])) as Record<StatusTugas, number>;
    for (const t of dasarChip) if (t.status in h) h[t.status as StatusTugas] += 1;
    return h;
  }, [dasarChip]);

  const ambilSatu = async (id: string) => {
    const { data } = await supabaseBrowser.from("harjar_tugas").select("*").eq("id", id).maybeSingle();
    return data ? petaTugas(data) : null;
  };

  const buat = async (v: IsianTugas, oleh: string) => {
    const { data, error } = await supabaseBrowser.rpc("buat_tugas_harjar", {
      p_jenis: v.jenis,
      p_penyulang: v.penyulang,
      p_uraian: v.uraian,
      p_lokasi: v.lokasi,
      p_koordinat: v.koordinat || null,
      p_prioritas: v.prioritas,
      p_catatan: v.catatan || null,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    const baru = await ambilSatu(String(data));
    if (baru) setSemua((p) => [baru, ...p]);
  };

  const batalkan = async (id: string, alasan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_tugas_harjar", { p_id: id, p_alasan: alasan, p_nama: oleh });
    if (error) throw new Error(error.message);
    const t = await ambilSatu(id);
    if (t) setSemua((p) => p.map((x) => (x.id === id ? t : x)));
  };

  return { semua, baris, hitung, loading, galat, status, setStatus, cari, setCari, muat, buat, batalkan };
}
