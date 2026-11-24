"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { JenisPdkb } from "./usePdkb";
import { hariIniWita } from "@/app/admin/_components/KepalaUrut";

/**
 * Tab "Temuan ditugaskan" — semua tugas ke PDKB (`pdkb_tugas`): temuan JTM/JTR
 * (Tugaskan di Temuan JTM/JTR) dan temuan gardu (Jadikan WO → PDKB).
 * Yang belum dikerjakan SELALU tampil (tunggakan, teknisaplikasi.md butir 7);
 * yang selesai/dibatalkan ikut bulan ditugaskan.
 */

/** Status penutup. Selain ini = BELUM SELESAI — termasuk status Monitoring
 *  Inspeksi lama (Temuan, Perlu Tindakan) pada tugas yang ditugaskan ke PDKB. */
export const STATUS_TUTUP = ["Selesai", "Dibatalkan", "Batal"];
export const belumSelesai = (status: string) => !STATUS_TUTUP.includes(status);

const SUMBER: Record<string, string> = {
  inspeksi_jtm: "Temuan JTM",
  inspeksi_jtr: "Temuan JTR",
  temuan_gardu: "Temuan gardu",
  tugas_manual: "Manual",
};

export interface TugasPdkb {
  id: string;
  /** Tabel tugas: temuan ROW (pohon) JTM tersimpan di inspeksi_pohon. */
  tabel: "inspeksi" | "inspeksi_pohon";
  sumberKode: string;
  sumber: string;
  jenis: JenisPdkb | null;
  /** Kode gardu untuk temuan gardu (lokasi "Gardu XXX · …"). */
  garduKode: string | null;
  uraian: string;
  catatan: string | null;
  lokasi: string | null;
  ulp: string;
  penyulang: string;
  koordinat: string | null;
  prioritas: string | null;
  status: string;
  ditugaskan: string | null;
  /** Tanggal untuk tabel & urutan: ditugaskan → dibuat → tanggal temuan. */
  tanggal: string | null;
  /** Tanggal temuan (inspeksi.tgl_inspeksi). */
  ditemukan: string | null;
  penemu: string | null;
  foto: string | null;
  fotoSesudah: string | null;
  dibatalkanAlasan: string | null;
  dibatalkanOleh: string | null;
  catatanId: string | null;
  catatanTgl: string | null;
  dikerjakanTgl: string | null;
}

const teks = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

const peta = (r: Record<string, unknown>): TugasPdkb => {
  const source = (r.source as string) ?? "";
  const lokasi = teks(r.lokasi);
  const gardu = source === "temuan_gardu" ? (lokasi?.match(/^Gardu (\S+)/)?.[1] ?? null) : null;
  const jj = teks(r.jenis_jaringan);
  return {
    id: r.id as string,
    tabel: r.tabel === "inspeksi_pohon" ? "inspeksi_pohon" : "inspeksi",
    sumberKode: source,
    sumber: SUMBER[source] ?? "Temuan",
    jenis: source === "temuan_gardu" ? "GARDU"
      : jj === "JTM" || jj === "JTR" ? jj
      : source === "inspeksi_jtr" ? "JTR" : source === "inspeksi_jtm" ? "JTM" : null,
    garduKode: gardu,
    uraian: (r.temuan as string) || "Tugas",
    catatan: teks(r.deskripsi),
    lokasi,
    ulp: (r.ulp as string) ?? "",
    penyulang: (r.penyulang as string) ?? "",
    koordinat: teks(r.koordinat),
    prioritas: teks(r.prioritas),
    status: (r.status as string) ?? "",
    ditugaskan: teks(r.assigned_at),
    tanggal: teks(r.assigned_at) ?? teks(r.created_at) ?? teks(r.tgl_inspeksi),
    ditemukan: teks(r.tgl_inspeksi),
    penemu: teks(r.nama_inspektor),
    foto: teks(r.foto_sebelum_url),
    fotoSesudah: teks(r.foto_sesudah_url),
    dibatalkanAlasan: teks(r.dibatalkan_alasan),
    dibatalkanOleh: teks(r.dibatalkan_oleh),
    catatanId: teks(r.catatan_id),
    catatanTgl: teks(r.catatan_tgl),
    dikerjakanTgl: teks(r.tgl_eksekusi),
  };
};

/** Batas bulan WITA sebagai ISO UTC. bulan 0 = setahun. */
const batasWita = (tahun: number, bulan: number) => {
  const iso = (t: number, b: number) => new Date(Date.UTC(t, b - 1, 1) - 8 * 3600 * 1000).toISOString();
  return bulan === 0
    ? { awal: iso(tahun, 1), akhir: iso(tahun + 1, 1) }
    : { awal: iso(tahun, bulan), akhir: bulan === 12 ? iso(tahun + 1, 1) : iso(tahun, bulan + 1) };
};

export function useTugasPdkb(ulp: string, tahun: number, bulan: number) {
  const [semua, setSemua] = useState<TugasPdkb[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("SEMUA");
  const [cari, setCari] = useState("");
  const [nonce, setNonce] = useState(0);

  const tarik = useCallback(async () => {
    const { awal, akhir } = batasWita(tahun, bulan);
    return fetchAllRows<Record<string, unknown>>(() => {
      let x = supabaseBrowser
        .from("pdkb_tugas")
        .select("*")
        // Belum selesai SELALU ikut (apa pun statusnya, juga tanpa assigned_at).
        // Tanpa assigned_at (tugas lama) → bulan dibuatnya.
        .or(`status.is.null,status.not.in.("Selesai","Dibatalkan","Batal"),and(assigned_at.gte.${awal},assigned_at.lt.${akhir}),and(assigned_at.is.null,created_at.gte.${awal},created_at.lt.${akhir}),tgl_eksekusi.eq.${hariIniWita()}`)
        .order("assigned_at", { ascending: false })
        .order("tabel")
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    });
  }, [ulp, tahun, bulan]);

  useEffect(() => {
    let hidup = true;
    tarik().then(
      (d) => { if (hidup) { setSemua(d.map(peta)); setGalat(null); setLoading(false); } },
      (e: Error) => {
        if (!hidup) return;
        setSemua([]);
        setGalat(/pdkb_tugas/.test(e.message) ? "Jalankan scripts/pdkb.sql di Supabase dulu." : e.message);
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [tarik, nonce]);

  const muat = () => { setLoading(true); setGalat(null); setNonce((n) => n + 1); };

  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    if (!k) return semua;
    return semua.filter((t) =>
      [t.penyulang, t.uraian, t.lokasi ?? "", t.penemu ?? "", t.garduKode ?? ""].some((v) => v.toUpperCase().includes(k)),
    );
  }, [semua, cari]);
  const baris = useMemo(() => dasarChip.filter((t) => status === "SEMUA" || t.status === status), [dasarChip, status]);
  /** Chip status = status yang memang ADA di data (status lama ikut terlihat). */
  const hitung = useMemo(() => {
    const h = new Map<string, number>();
    for (const t of dasarChip) h.set(t.status || "—", (h.get(t.status || "—") ?? 0) + 1);
    return [...h].sort((a, b) => Number(!belumSelesai(a[0])) - Number(!belumSelesai(b[0])) || b[1] - a[1]);
  }, [dasarChip]);
  const belum = useMemo(() => semua.filter((t) => belumSelesai(t.status)), [semua]);

  /** Sesudah hasil dicatat / catatan dibatalkan: ambil ulang satu tugas itu. */
  const segarkanSatu = async (id: string, tabel: string) => {
    const { data } = await supabaseBrowser.from("pdkb_tugas").select("*").eq("id", id).eq("tabel", tabel).maybeSingle();
    if (data) setSemua((p) => p.map((x) => (x.id === id && x.tabel === tabel ? peta(data) : x)));
  };

  return { semua, baris, belum, hitung, loading, galat, status, setStatus, cari, setCari, muat, segarkanSatu };
}
