"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { Penugasan } from "@/app/admin/_components/TugaskanTemuanModal";

/**
 * Temuan inspeksi JTR + status penugasannya (view `jtr_temuan`,
 * `scripts/jtr-temuan-tugas.sql`). Keadaan TERKINI — inspeksi terakhir yang
 * disetujui per gardu — jadi tidak disaring periode.
 *
 * Menugaskan = membuat baris `inspeksi` Ditugaskan (cara A, sepola JTM), yang
 * lalu muncul di Monitoring Inspeksi dan tugas HP eksekutornya (HARJAR).
 */

export type StatusTugasJtr = "Belum ditugaskan" | "Ditugaskan" | "Selesai";
export const STATUS_TUGAS_JTR: StatusTugasJtr[] = ["Belum ditugaskan", "Ditugaskan", "Selesai"];

export interface TemuanJtr {
  tiang_id: string;
  /** Label tiang / kabel ("AM001-A3.2"). */
  tiang_kode: string;
  gardu_kode: string;
  gardu_nama: string | null;
  ulp: string;
  penyulang: string | null;
  jurusan: string | null;
  temuan: string;
  urgensi: string | null;
  foto_url: string | null;
  ditemukan_pada: string | null;
  penemu: string | null;
  tugas_status: string | null;
  eksekutor: string | null;
  assigned_at: string | null;
  status_tugas: StatusTugasJtr;
}

export const kunciTemuanJtr = (t: Pick<TemuanJtr, "tiang_id" | "tiang_kode" | "temuan">) =>
  `${t.tiang_id}|${t.tiang_kode}|${t.temuan}`;

const KOLOM =
  "tiang_id,tiang_kode,gardu_kode,gardu_nama,ulp,penyulang,jurusan,temuan,urgensi,foto_url,ditemukan_pada,penemu,tugas_status,eksekutor,assigned_at,status_tugas";

export function useTemuanJtr(ulp: string, oleh: string) {
  const [data, setData] = useState<TemuanJtr[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [status, setStatus] = useState<"SEMUA" | StatusTugasJtr>("Belum ditugaskan");
  const [cari, setCari] = useState("");

  const muat = () => { setLoading(true); setGalat(null); setNonce((n) => n + 1); };

  useEffect(() => {
    let hidup = true;
    fetchAllRows<TemuanJtr>(() => {
      let q = supabaseBrowser.from("jtr_temuan").select(KOLOM);
      if (ulp !== "SEMUA") q = q.eq("ulp", ulp);
      return q.order("tiang_id").order("tiang_kode").order("temuan");
    }).then(
      (rows) => {
        if (!hidup) return;
        setData(rows);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        setData([]);
        setGalat(
          e.message.includes("schema cache") || e.message.includes("does not exist")
            ? "View jtr_temuan belum ada — jalankan scripts/jtr-temuan-tugas.sql di Supabase."
            : e.message,
        );
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [ulp, nonce]);

  // Per gardu → jurusan → tiang, supaya temuan yang berdekatan di lapangan
  // juga berdekatan di layar (enak dipilih sekaligus).
  const semua = useMemo(
    () =>
      [...data].sort((a, b) =>
        a.gardu_kode.localeCompare(b.gardu_kode) ||
        a.tiang_kode.localeCompare(b.tiang_kode, "id", { numeric: true }) ||
        a.temuan.localeCompare(b.temuan),
      ),
    [data],
  );

  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    return k
      ? semua.filter((t) => [t.tiang_kode, t.gardu_kode, t.gardu_nama ?? "", t.penyulang ?? "", t.temuan].some((v) => v.toUpperCase().includes(k)))
      : semua;
  }, [semua, cari]);

  const baris = useMemo(
    () => dasarChip.filter((t) => status === "SEMUA" || t.status_tugas === status),
    [dasarChip, status],
  );

  const hitung = useMemo(() => {
    const h = { "Belum ditugaskan": 0, Ditugaskan: 0, Selesai: 0 } as Record<StatusTugasJtr, number>;
    for (const t of dasarChip) h[t.status_tugas] += 1;
    return h;
  }, [dasarChip]);

  /** Satu panggilan per temuan (masing-masing atomik) — yang gagal tidak
   *  menggagalkan yang lain; kalau ada yang gagal, daftar dimuat ulang. */
  const tugaskan = async (pilih: TemuanJtr[], p: Penugasan) => {
    const berhasil = new Set<string>();
    const gagal: string[] = [];
    for (const t of pilih) {
      const { error } = await supabaseBrowser.rpc("tugaskan_temuan_jtr", {
        p_tiang_id: t.tiang_id,
        p_tiang_kode: t.tiang_kode,
        p_temuan: t.temuan,
        p_eksekutor: p.eksekutor,
        p_prioritas: p.prioritas,
        p_catatan: p.catatan || null,
        p_nama: oleh || null,
      });
      if (error) gagal.push(`${t.tiang_kode} ${t.temuan}: ${error.message}`);
      else berhasil.add(kunciTemuanJtr(t));
    }
    if (gagal.length > 0) {
      muat();
    } else {
      const pada = new Date().toISOString();
      setData((d) =>
        d.map((t) =>
          berhasil.has(kunciTemuanJtr(t))
            ? { ...t, status_tugas: "Ditugaskan", tugas_status: "Ditugaskan", eksekutor: p.eksekutor, assigned_at: pada }
            : t,
        ),
      );
    }
    return { berhasil: berhasil.size, gagal };
  };

  return { semua, baris, hitung, loading, galat, muat, status, setStatus, cari, setCari, tugaskan };
}
