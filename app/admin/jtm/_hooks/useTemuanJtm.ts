"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Temuan inspeksi JTM + status penugasannya (view `jtm_temuan`,
 * `scripts/jtm-temuan-tugas.sql`). Keadaan TERKINI, jadi tidak disaring
 * periode — temuan yang belum ditangani tetap temuan, setua apa pun.
 *
 * Menugaskan = membuat baris `inspeksi` Ditugaskan ("cara A"), yang lalu
 * muncul di Monitoring Inspeksi dan tugas HP eksekutornya.
 */

export type StatusTugas = "Belum ditugaskan" | "Ditugaskan" | "Selesai";
export const STATUS_TUGAS: StatusTugas[] = ["Belum ditugaskan", "Ditugaskan", "Selesai"];
export type Jenis = "SEMUA" | "Jaringan" | "ROW";

export interface TemuanJtm {
  tiang_id: string;
  tiang_kode: string;
  penyulang: string | null;
  ulp: string;
  item_kode: string;
  item_nama: string;
  jenis: "Jaringan" | "ROW";
  bagian: string | null;
  sirkit_segmen_id: string | null;
  sirkit_nama: string | null;
  nilai: string | null;
  nilai_label: string | null;
  catatan: string | null;
  foto_url: string | null;
  ditemukan_pada: string;
  penemu: string | null;
  segmen_nama: string | null;
  lat: number | null;
  lng: number | null;
  tugas_id: string | null;
  tugas_status: string | null;
  eksekutor: string | null;
  prioritas: string | null;
  assigned_at: string | null;
  team_name: string | null;
  foto_sesudah_url: string | null;
  status_tugas: StatusTugas;
  wo_perabasan_aktif: string | null;
}

export interface Penugasan { eksekutor: string; prioritas: string; catatan: string }

/** Alamat satu temuan — sama dengan kunci partisi `tiang_kondisi_terakhir`. */
export const kunciTemuan = (t: Pick<TemuanJtm, "tiang_id" | "item_kode" | "bagian" | "sirkit_segmen_id">) =>
  `${t.tiang_id}|${t.item_kode}|${t.bagian ?? ""}|${t.sirkit_segmen_id ?? ""}`;

export function useTemuanJtm(ulp: string, oleh: string) {
  const [data, setData] = useState<TemuanJtm[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [jenis, setJenis] = useState<Jenis>("SEMUA");
  const [status, setStatus] = useState<"SEMUA" | StatusTugas>("Belum ditugaskan");
  const [cari, setCari] = useState("");

  const muat = () => { setLoading(true); setGalat(null); setNonce((n) => n + 1); };

  useEffect(() => {
    let hidup = true;
    fetchAllRows<TemuanJtm>(() => {
      let q = supabaseBrowser.from("jtm_temuan").select("*");
      if (ulp !== "SEMUA") q = q.eq("ulp", ulp);
      return q.order("tiang_id").order("item_kode").order("bagian").order("sirkit_segmen_id");
    }).then(
      (rows) => {
        if (!hidup) return;
        setData(rows);
        setLoading(false);
      },
      (e: Error) => {
        if (!hidup) return;
        setData([]);
        setGalat(e.message);
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [ulp, nonce]);

  // Diurutkan per penyulang → segmen → tiang, supaya temuan yang berdekatan
  // di lapangan juga berdekatan di layar (enak dipilih sekaligus).
  const semua = useMemo(
    () =>
      [...data].sort((a, b) =>
        (a.penyulang ?? "").localeCompare(b.penyulang ?? "") ||
        (a.segmen_nama ?? "").localeCompare(b.segmen_nama ?? "") ||
        a.tiang_kode.localeCompare(b.tiang_kode, "id", { numeric: true }) ||
        a.item_nama.localeCompare(b.item_nama),
      ),
    [data],
  );

  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    return semua.filter(
      (t) =>
        (jenis === "SEMUA" || t.jenis === jenis) &&
        (!k || [t.tiang_kode, t.segmen_nama ?? "", t.penyulang ?? "", t.item_nama].some((v) => v.toUpperCase().includes(k))),
    );
  }, [semua, jenis, cari]);

  const baris = useMemo(
    () => dasarChip.filter((t) => status === "SEMUA" || t.status_tugas === status),
    [dasarChip, status],
  );

  const hitung = useMemo(() => {
    const h = { "Belum ditugaskan": 0, Ditugaskan: 0, Selesai: 0 } as Record<StatusTugas, number>;
    for (const t of dasarChip) h[t.status_tugas] += 1;
    return h;
  }, [dasarChip]);

  const hitungJenis = useMemo(() => {
    const k = cari.trim().toUpperCase();
    const h = { Jaringan: 0, ROW: 0 };
    for (const t of semua) {
      if (k && ![t.tiang_kode, t.segmen_nama ?? "", t.penyulang ?? "", t.item_nama].some((v) => v.toUpperCase().includes(k))) continue;
      h[t.jenis] += 1;
    }
    return h;
  }, [semua, cari]);

  /**
   * Menugaskan beberapa temuan ke satu eksekutor. Tiap temuan satu panggilan
   * (masing-masing atomik di database), jadi yang gagal tidak menggagalkan yang
   * lain. Yang berhasil ditambal di tempat; kalau ada yang gagal, daftar dimuat
   * ulang dari database — menebak dari sisi klien bisa menawarkan tombol yang
   * melahirkan tugas kembar.
   */
  const tugaskan = async (pilih: TemuanJtm[], p: Penugasan) => {
    const berhasil = new Set<string>();
    const gagal: string[] = [];
    for (const t of pilih) {
      const { error } = await supabaseBrowser.rpc("tugaskan_temuan_jtm", {
        p_tiang_id: t.tiang_id,
        p_item: t.item_kode,
        p_bagian: t.bagian,
        p_sirkit: t.sirkit_segmen_id,
        p_eksekutor: p.eksekutor,
        p_prioritas: p.prioritas,
        p_catatan: p.catatan || null,
        p_nama: oleh || null,
      });
      if (error) gagal.push(`${t.tiang_kode} ${t.item_nama}: ${error.message}`);
      else berhasil.add(kunciTemuan(t));
    }
    if (gagal.length > 0) {
      muat();
    } else {
      const pada = new Date().toISOString();
      setData((d) =>
        d.map((t) =>
          berhasil.has(kunciTemuan(t))
            ? { ...t, status_tugas: "Ditugaskan", tugas_status: "Ditugaskan", eksekutor: p.eksekutor, prioritas: p.prioritas, assigned_at: pada }
            : t,
        ),
      );
    }
    return { berhasil: berhasil.size, gagal };
  };

  return {
    semua, baris, hitung, hitungJenis, loading, galat, muat,
    jenis, setJenis, status, setStatus, cari, setCari, tugaskan,
  };
}
