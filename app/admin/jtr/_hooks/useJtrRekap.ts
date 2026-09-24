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

interface TiangRingkas {
  kode: string;
  ulp: string;
  gardu_kode: string;
  jurusan: string | null;
  kondisi: string | null;
  arde_kondisi: string | null;
  rawan_row: string[] | null;
  andongan: string | null;
  stay_kondisi: string | null;
  underbuild_tm: boolean;
  catatan_perbaikan: string | null;
  // Kondisi kabel dan aksesoris melekat pada KABEL, bukan tiang: tiang
  // ber-underbuild memikul dua kabel dengan dua set klem, dan kerusakan di
  // kabel bawah tidak boleh tertulis seolah milik kabel atas.
  tiang_konduktor:
    | {
        kondisi: string | null;
        aks_suspension: string | null;
        aks_large_angle: string | null;
        aks_dead_end: string | null;
      }[]
    | null;
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
  const [perGardu, setPerGardu] = useState<RekapGardu[]>([]);
  const [cakupan, setCakupan] = useState<Cakupan[]>([]);
  const [tiang, setTiang] = useState<TiangRingkas[]>([]);
  const [belumBertitik, setBelumBertitik] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? (ulpPilihan !== "SEMUA" ? ulpPilihan : null) : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Semua dipaginasi (teknisaplikasi.md butir 13): `gardu_jtr_panjang`
      // berisi satu baris per gardu × jurusan dan sudah melewati 1.000 baris —
      // tanpa paginasi, gardu di urutan belakang hilang dari hitungan tanpa tanda.
      const semuaDari = <T,>(nama: string, urut: string[]) =>
        fetchAllRows<T>(() => {
          let b = supabaseBrowser.from(nama).select("*");
          if (unit) b = b.eq("ulp", unit);
          for (const k of urut) b = b.order(k);
          return b;
        });

      let qTitik = supabaseBrowser.from("gardu_tanpa_titik").select("kode", { count: "exact", head: true });
      if (unit) qTitik = qTitik.eq("ulp", unit);

      const [ulpRes, garduRes, cakupanRes, titikRes] = await Promise.all([
        semuaDari<RekapUlp>("ulp_jtr_panjang", ["ulp"]),
        semuaDari<RekapGardu>("gardu_jtr_panjang", ["gardu_kode", "ulp", "jurusan"]),
        semuaDari<Cakupan>("jtr_cakupan", ["ulp"]),
        qTitik,
      ]);

      setPerUlp(ulpRes);
      setPerGardu(garduRes);
      setCakupan(cakupanRes);
      setBelumBertitik(titikRes.count ?? 0);

      const barisTiang = await fetchAllRows<TiangRingkas>(() => {
        let b = supabaseBrowser
          .from("tiang")
          // Satu literal, bukan sambungan `+`: supabase-js membaca string ini
          // di tingkat tipe dan menyerah begitu disambung.
          .select(
            "kode,ulp,gardu_kode,jurusan,kondisi,arde_kondisi,rawan_row,andongan,stay_kondisi,underbuild_tm,catatan_perbaikan,tiang_konduktor!tiang_konduktor_tiang_id_fkey(kondisi,aks_suspension,aks_large_angle,aks_dead_end)",
          )
          .eq("status_hidup", "aktif")
          .not("gardu_kode", "is", null);
        if (unit) b = b.eq("ulp", unit);
        // Urut kolom unik supaya paginasi tidak lompat atau menggandakan baris.
        return b.order("id");
      });
      setTiang(barisTiang);
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
   * yang diisi manusia. Menambah jenis temuan cukup menambah satu baris di sini,
   * dan seluruh data yang sudah masuk ikut terhitung.
   */
  const temuan = useMemo<Temuan[]>(() => {
    const hitung = (f: (t: TiangRingkas) => boolean) => tiang.filter(f).length;
    // Satu tiang terhitung sekali walau dua kabelnya sama-sama bermasalah:
    // yang dijawab tabel ini adalah "berapa TIANG yang punya temuan ini".
    const adaKabel = (t: TiangRingkas, f: (k: NonNullable<TiangRingkas["tiang_konduktor"]>[number]) => boolean) =>
      (t.tiang_konduktor ?? []).some(f);
    const rusakAks = (v: string | null) => v === "Rusak";

    const daftar: Temuan[] = [
      // "Arde tidak ada" sengaja TIDAK dihitung sebagai temuan — sebagian besar
      // tiang JTR memang tidak berarde, dan itu keadaan biasa. Yang temuan adalah
      // arde yang PUTUS: pernah ada, lalu rusak.
      { label: "Arde putus", jumlah: hitung((t) => t.arde_kondisi === "Putus"), urgensi: "Tinggi" },
      { label: "Tiang tidak baik", jumlah: hitung((t) => !!t.kondisi && t.kondisi !== "Baik"), urgensi: "Tinggi" },
      { label: "Andongan tidak baik", jumlah: hitung((t) => !!t.andongan && t.andongan !== "Baik"), urgensi: "Sedang" },
      {
        label: "Konduktor tidak baik",
        jumlah: hitung((t) => adaKabel(t, (k) => !!k.kondisi && k.kondisi !== "Baik")),
        urgensi: "Tinggi",
      },
      {
        label: "Aksesoris rusak",
        jumlah: hitung((t) =>
          adaKabel(
            t,
            (k) =>
              rusakAks(k.aks_suspension) || rusakAks(k.aks_large_angle) || rusakAks(k.aks_dead_end),
          ),
        ),
        urgensi: "Sedang",
      },
      { label: "Stay rusak", jumlah: hitung((t) => t.stay_kondisi === "Rusak"), urgensi: "Sedang" },
      { label: "Rawan ROW", jumlah: hitung((t) => (t.rawan_row?.length ?? 0) > 0), urgensi: "Sedang" },
      { label: "Ada catatan perbaikan", jumlah: hitung((t) => !!t.catatan_perbaikan?.trim()), urgensi: "Sedang" },
    ];
    return daftar.filter((d) => d.jumlah > 0);
  }, [tiang]);

  /** Penghalang ROW dihitung terpisah — pohon dan bangunan butuh penanganan berbeda. */
  const penghalang = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tiang) for (const r of t.rawan_row ?? []) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [tiang]);

  const total = useMemo(() => {
    const jumlahTiang = perUlp.reduce((s, u) => s + Number(u.jumlah_tiang ?? 0), 0);
    const rute = perUlp.reduce((s, u) => s + Number(u.panjang_rute_km ?? 0), 0);
    const penghantar = perUlp.reduce((s, u) => s + Number(u.panjang_penghantar_km ?? 0), 0);
    const garduMaster = cakupan.reduce((s, c) => s + Number(c.gardu_master ?? 0), 0);
    const garduPunyaJaringan = new Set(perGardu.map((g) => `${g.gardu_kode}|${g.ulp}`)).size;
    return { jumlahTiang, rute, penghantar, garduMaster, garduPunyaJaringan };
  }, [perUlp, cakupan, perGardu]);

  return {
    perUlp, perGardu, cakupan, temuan, penghalang, total,
    belumBertitik, tiang, loading, error, muat,
  };
}
