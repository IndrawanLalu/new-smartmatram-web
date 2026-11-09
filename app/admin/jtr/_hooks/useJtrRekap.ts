"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

// Semua angka panjang datang dari view, tidak dihitung ulang di sini. Menghitung
// ulang di klien berarti ada dua rumus panjang jaringan yang harus dijaga tetap
// sama — dan cepat atau lambat keduanya akan berselisih.

export interface RekapUlp {
  ulp: string;
  jumlah_gardu: number;
  jumlah_tiang: number;
  panjang_rute_km: number;
  panjang_penghantar_km: number;
}

export interface RekapGardu {
  gardu_kode: string;
  ulp: string;
  jurusan: string;
  arah_jurusan: string | null;
  jumlah_tiang: number;
  jumlah_kabel: number;
  panjang_rute_km: number;
  panjang_penghantar_km: number;
  rata_gawang_m: number | null;
  gawang_terpanjang_m: number | null;
  gawang_tanpa_titik: number;
  tiang_tanpa_kabel: number;
  /** Bentang yang kabelnya tercatat tapi hulunya belum jelas. */
  gawang_terputus: number;
}

export interface Cakupan {
  ulp: string;
  gardu_master: number;
  pernah_diinspeksi: number;
  diinspeksi_12_bulan: number;
  persen_12_bulan: number | null;
}

/**
 * Satu baris `jtr_rekap_kondisi`: jumlah tiang per (ULP, label). Aturan temuan
 * ada di view itu (scripts/jtr-rekap-ringkas.sql) — di sini cuma dijumlahkan
 * lintas ULP, tidak ada lagi tiang yang ditarik ke browser.
 */
interface BarisKondisi {
  ulp: string;
  jenis: "temuan" | "penghalang";
  urutan: number | null;
  label: string;
  urgensi: "Tinggi" | "Sedang" | null;
  jumlah: number;
}

export interface Temuan {
  label: string;
  jumlah: number;
  urgensi: "Tinggi" | "Sedang";
}

/**
 * `ulpPilihan`: "SEMUA" atau kode ULP — penyaring halaman. Role selain UP3
 * selalu terkunci ke unitnya sendiri.
 */
export function useJtrRekap(user: CurrentUser, ulpPilihan = "SEMUA") {
  const [perUlp, setPerUlp] = useState<RekapUlp[]>([]);
  const [cakupan, setCakupan] = useState<Cakupan[]>([]);
  const [kondisi, setKondisi] = useState<BarisKondisi[]>([]);
  const [belumBertitik, setBelumBertitik] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? (ulpPilihan !== "SEMUA" ? ulpPilihan : null) : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Semua dipaginasi (teknisaplikasi.md butir 13) walau barisnya sedikit:
      // jumlah baris rekap ikut tumbuh dengan jumlah ULP.
      const semuaDari = <T,>(nama: string, urut: string[]) =>
        fetchAllRows<T>(() => {
          let b = supabaseBrowser.from(nama).select("*");
          if (unit) b = b.eq("ulp", unit);
          for (const k of urut) b = b.order(k);
          return b;
        });

      let qTitik = supabaseBrowser.from("gardu_tanpa_titik").select("kode", { count: "exact", head: true });
      if (unit) qTitik = qTitik.eq("ulp", unit);

      const [ulpRes, cakupanRes, kondisiRes, titikRes] = await Promise.all([
        semuaDari<RekapUlp>("ulp_jtr_panjang", ["ulp"]),
        semuaDari<Cakupan>("jtr_cakupan", ["ulp"]),
        semuaDari<BarisKondisi>("jtr_rekap_kondisi", ["ulp", "jenis", "label"]),
        qTitik,
      ]);

      setPerUlp(ulpRes);
      setCakupan(cakupanRes);
      setKondisi(kondisiRes);
      setBelumBertitik(titikRes.count ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat data JTR");
    } finally {
      setLoading(false);
    }
  }, [unit]);

  useEffect(() => {
    void muat();
  }, [muat]);

  /**
   * Temuan DITURUNKAN dari kondisi yang tercatat, bukan dari kolom kesimpulan
   * yang diisi manusia. Menambah jenis temuan cukup menambah satu baris di
   * `jtr_rekap_kondisi`, dan seluruh data yang sudah masuk ikut terhitung.
   */
  const temuan = useMemo<Temuan[]>(() => {
    const m = new Map<string, Temuan & { urutan: number }>();
    for (const k of kondisi) {
      if (k.jenis !== "temuan") continue;
      const t = m.get(k.label) ?? { label: k.label, jumlah: 0, urgensi: k.urgensi ?? "Sedang", urutan: k.urutan ?? 0 };
      t.jumlah += Number(k.jumlah);
      m.set(k.label, t);
    }
    return [...m.values()]
      .filter((t) => t.jumlah > 0)
      .sort((a, b) => a.urutan - b.urutan)
      .map(({ label, jumlah, urgensi }) => ({ label, jumlah, urgensi }));
  }, [kondisi]);

  /** Penghalang ROW dihitung terpisah — pohon dan bangunan butuh penanganan berbeda. */
  const penghalang = useMemo(() => {
    const m = new Map<string, number>();
    for (const k of kondisi) if (k.jenis === "penghalang") m.set(k.label, (m.get(k.label) ?? 0) + Number(k.jumlah));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [kondisi]);

  const total = useMemo(() => {
    const jumlahTiang = perUlp.reduce((s, u) => s + Number(u.jumlah_tiang ?? 0), 0);
    const rute = perUlp.reduce((s, u) => s + Number(u.panjang_rute_km ?? 0), 0);
    const penghantar = perUlp.reduce((s, u) => s + Number(u.panjang_penghantar_km ?? 0), 0);
    const garduMaster = cakupan.reduce((s, c) => s + Number(c.gardu_master ?? 0), 0);
    return { jumlahTiang, rute, penghantar, garduMaster };
  }, [perUlp, cakupan]);

  return {
    perUlp, cakupan, temuan, penghalang, total,
    belumBertitik, loading, error, muat,
  };
}
