"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";

/**
 * Optimasi Trafo — daftar, verifikasi, dan acuan alasannya.
 *
 * Pengisiannya di HP; web memeriksa dan memutuskan. Memverifikasi di sini
 * SEKALIGUS menerapkan usulan master yang lahir dari catatan itu (kVA, nomor
 * seri, merk, tahun) — satu keputusan, satu tombol. Lihat
 * `scripts/optimasi-trafo.sql` §9.
 */

/** Apakah perpindahan trafo sudah tersambung ke catatan di gardu seberang
 *  lewat nomor seri. null = tidak melibatkan gardu lain. */
export type Jejak = "bersambung" | "dipastikan" | "terbuka" | null;

export interface BarisOptimasi {
  id: string;
  pengukuranId: string | null;
  kodeGardu: string;
  ulp: string;
  penyulang: string | null;
  alamat: string | null;
  kvaLama: number;
  kvaBaru: number;
  kvaLamaMaster: number | null;
  noSeriLama: string | null;
  seriLamaTakTerbaca: boolean;
  noSeriLamaMaster: string | null;
  noSeriBaru: string;
  merkBaru: string | null;
  tahunBaru: number | null;
  asal: "GUDANG" | "GARDU";
  asalKode: string | null;
  asalUlp: string | null;
  tujuan: "GUDANG" | "GARDU" | "PERBAIKAN";
  tujuanKode: string | null;
  tujuanUlp: string | null;
  alasanLabel: string | null;
  tglMutasi: string;
  tglOperasi: string;
  fotoLama: string;
  fotoBaru: string;
  lat: number | null;
  lng: number | null;
  status: string;
  petugasNama: string | null;
  catatan: string | null;
  verifiedBy: string | null;
  usulanMenunggu: number;
  usulanDisetujui: number;
  jejakAsal: Jejak;
  jejakTujuan: Jejak;
}

export interface AlasanRef {
  kode: string;
  label: string;
  urutan: number;
  aktif: boolean;
}

export type SaringStatus = "SEMUA" | "Selesai" | "Diverifikasi" | "Dibatalkan";

interface Hasil {
  baris: BarisOptimasi[];
  alasan: AlasanRef[];
  /** WO optimasi yang terbit dan belum punya catatan terkirim. */
  woTerbuka: number | null;
  loading: boolean;
  /** Daftar gagal dibaca — bukan daftar yang kosong. */
  galat: string | null;
  ulp: string;
  setUlp: (u: string) => void;
  daftarUlp: string[];
  status: SaringStatus;
  setStatus: (s: SaringStatus) => void;
  muat: () => Promise<void>;
  verifikasi: (id: string, oleh: string) => Promise<number>;
  batalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
  pastikanJejak: (id: string, oleh: string) => Promise<void>;
  simpanAlasan: (a: AlasanRef, baru: boolean) => Promise<void>;
}

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

const angka = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const teks = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function useOptimasiTrafo(user: CurrentUser): Hasil {
  const bolehSemua = canSeeAllUnits(user.role);

  const [baris, setBaris] = useState<BarisOptimasi[]>([]);
  const [alasan, setAlasan] = useState<AlasanRef[]>([]);
  const [woTerbuka, setWoTerbuka] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [status, gantiStatus] = useState<SaringStatus>("SEMUA");
  const [nonce, setNonce] = useState(0);

  // Keadaan "memuat" dinyalakan oleh PEMICUNYA, bukan di dalam efek — efek
  // yang langsung mengubah state memicu render berantai.
  const mulaiMuat = () => {
    setLoading(true);
    setGalat(null);
  };
  const setUlp = (u: string) => { mulaiMuat(); gantiUlp(u); };
  const setStatus = (s: SaringStatus) => { mulaiMuat(); gantiStatus(s); };
  const muat = async () => { mulaiMuat(); setNonce((n) => n + 1); };

  const daftarUlp = useMemo(
    () => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]),
    [bolehSemua, user.unit],
  );

  const tarik = useCallback(async () => {
    let q = supabaseBrowser
      .from("optimasi_trafo_daftar")
      .select("*")
      .order("tgl_operasi", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (ulp !== "SEMUA") q = q.eq("ulp", ulp);
    if (status !== "SEMUA") q = q.eq("status", status);

    let qWo = supabaseBrowser
      .from("v_wo_optimasi_terbuka")
      .select("pengukuran_id", { count: "exact", head: true });
    if (ulp !== "SEMUA") qWo = qWo.eq("ulp", ulp);

    const [dat, ref, wo] = await Promise.all([
      q,
      supabaseBrowser.from("optimasi_alasan_ref").select("kode,label,urutan,aktif").order("urutan"),
      qWo,
    ]);
    return { dat, ref, wo };
  }, [ulp, status]);

  /** State diisi di sini, dari callback — bukan di dalam badan efek. */
  const terapkan = useCallback(({ dat, ref, wo }: Awaited<ReturnType<typeof tarik>>) => {
    // Daftar kosong karena server tidak terbaca TIDAK boleh terlihat sama
    // dengan daftar yang memang belum berisi — `teknisaplikasi.md` butir 6.
    if (dat.error) {
      setBaris([]);
      setGalat(dat.error.message);
      setLoading(false);
      return;
    }

    setBaris(
      (dat.data ?? []).map((r) => ({
        id: r.id as string,
        pengukuranId: teks(r.pengukuran_id),
        kodeGardu: r.kode_gardu as string,
        ulp: r.ulp as string,
        penyulang: teks(r.penyulang),
        alamat: teks(r.alamat),
        kvaLama: Number(r.kva_lama),
        kvaBaru: Number(r.kva_baru),
        kvaLamaMaster: angka(r.kva_lama_master),
        noSeriLama: teks(r.no_seri_lama),
        seriLamaTakTerbaca: !!r.seri_lama_tak_terbaca,
        noSeriLamaMaster: teks(r.no_seri_lama_master),
        noSeriBaru: r.no_seri_baru as string,
        merkBaru: teks(r.merk_baru),
        tahunBaru: angka(r.tahun_baru),
        asal: r.asal_trafo as BarisOptimasi["asal"],
        asalKode: teks(r.asal_kode_gardu),
        asalUlp: teks(r.asal_ulp),
        tujuan: r.tujuan_trafo_lama as BarisOptimasi["tujuan"],
        tujuanKode: teks(r.tujuan_kode_gardu),
        tujuanUlp: teks(r.tujuan_ulp),
        alasanLabel: teks(r.alasan_label) ?? teks(r.alasan),
        tglMutasi: (r.tgl_mutasi as string) ?? "",
        tglOperasi: (r.tgl_operasi as string) ?? "",
        fotoLama: (r.foto_nameplate_lama_url as string) ?? "",
        fotoBaru: (r.foto_nameplate_baru_url as string) ?? "",
        lat: angka(r.lat),
        lng: angka(r.lng),
        status: (r.status as string) ?? "Selesai",
        petugasNama: teks(r.petugas_nama),
        catatan: teks(r.catatan),
        verifiedBy: teks(r.verified_by),
        usulanMenunggu: Number(r.usulan_menunggu ?? 0),
        usulanDisetujui: Number(r.usulan_disetujui ?? 0),
        jejakAsal: (r.jejak_asal as Jejak) ?? null,
        jejakTujuan: (r.jejak_tujuan as Jejak) ?? null,
      })),
    );
    setAlasan(
      (ref.data ?? []).map((r) => ({
        kode: r.kode as string,
        label: r.label as string,
        urutan: Number(r.urutan ?? 100),
        aktif: !!r.aktif,
      })),
    );
    // Hitungan WO yang gagal dibaca dikosongkan, bukan dijadikan nol.
    setWoTerbuka(wo.error ? null : (wo.count ?? 0));
    setLoading(false);
  }, []);

  useEffect(() => {
    // Saringan bisa diganti sebelum jawaban lama datang — jangan biarkan
    // jawaban ULP sebelumnya menimpa yang baru.
    let hidup = true;
    tarik().then((h) => {
      if (hidup) terapkan(h);
    });
    return () => {
      hidup = false;
    };
  }, [tarik, terapkan, nonce]);

  // Semua mutasi di bawah menambal satu baris di tempat — memuat ulang 500
  // baris untuk satu tombol membuat urutan melompat di bawah jari admin.
  const tambal = (id: string, p: Partial<BarisOptimasi>) =>
    setBaris((x) => x.map((b) => (b.id === id ? { ...b, ...p } : b)));

  const verifikasi = async (id: string, oleh: string) => {
    const { data, error } = await supabaseBrowser.rpc("verifikasi_optimasi_trafo", {
      p_id: id,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    const n = Number(data ?? 0);
    const b = baris.find((x) => x.id === id);
    tambal(id, {
      status: "Diverifikasi",
      verifiedBy: oleh,
      usulanMenunggu: 0,
      usulanDisetujui: (b?.usulanDisetujui ?? 0) + n,
    });
    return n;
  };

  const batalkan = async (id: string, alasanBatal: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_optimasi_trafo", {
      p_id: id,
      p_alasan: alasanBatal,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    tambal(id, { status: "Dibatalkan", usulanMenunggu: 0 });
  };

  const pastikanJejak = async (id: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("pastikan_jejak_optimasi", {
      p_id: id,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    const b = baris.find((x) => x.id === id);
    tambal(id, {
      jejakAsal: b?.jejakAsal === "terbuka" ? "dipastikan" : (b?.jejakAsal ?? null),
      jejakTujuan: b?.jejakTujuan === "terbuka" ? "dipastikan" : (b?.jejakTujuan ?? null),
    });
  };

  const simpanAlasan = async (a: AlasanRef, baru: boolean) => {
    const isi = { ...a, updated_at: new Date().toISOString() };
    const { error } = baru
      ? await supabaseBrowser.from("optimasi_alasan_ref").insert(isi)
      : await supabaseBrowser.from("optimasi_alasan_ref").update(isi).eq("kode", a.kode);
    if (error) throw new Error(error.message);
    setAlasan((p) => [...p.filter((x) => x.kode !== a.kode), a].sort((x, y) => x.urutan - y.urutan));
  };

  return {
    baris, alasan, woTerbuka, loading, galat, ulp, setUlp, daftarUlp, status, setStatus,
    muat, verifikasi, batalkan, pastikanJejak, simpanAlasan,
  };
}
