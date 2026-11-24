"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { perkecilFoto } from "@/lib/gambarSurvey/latar";
import type { KategoriRef } from "@/app/admin/pemeliharaan-jaringan/_hooks/usePemeliharaanJaringan";

/**
 * Pekerjaan PDKB (scripts/pdkb.sql, 24 Nov 2026) — dicatat admin, tabel
 * sendiri, tidak dihitung realisasi Pemeliharaan Jaringan. Daftar = tabel +
 * modal (teknisaplikasi.md butir 7); periode bawaan bulan berjalan.
 */

export type JenisPdkb = "JTM" | "JTR" | "GARDU";
export const JENIS_PDKB: JenisPdkb[] = ["JTM", "JTR", "GARDU"];
export type StatusPdkb = "Tercatat" | "Dibatalkan";
export const STATUS_PDKB: StatusPdkb[] = ["Tercatat", "Dibatalkan"];
export const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export interface PekerjaanPdkb {
  id: string;
  ulp: string;
  jenis: JenisPdkb;
  penyulang: string | null;
  garduKode: string | null;
  kategori: string | null;
  kategoriLabel: string | null;
  pekerjaan: string;
  alamat: string | null;
  lat: number | null;
  lng: number | null;
  tgl: string;
  pelaksana: string;
  fotoSebelum: string;
  fotoSesudah: string;
  fotoProses: string | null;
  catatan: string | null;
  inspeksiId: string | null;
  tugasTabel: string | null;
  woLabel: string | null;
  woTgl: string | null;
  status: StatusPdkb;
  dibatalkanAlasan: string | null;
  dibatalkanOleh: string | null;
  dibatalkanAt: string | null;
  diinputOleh: string | null;
  dikoreksiAt: string | null;
  dikoreksiOleh: string | null;
}

/** Isian yang boleh dikoreksi. Foto, titik, ULP tidak — bukti / hak akses. */
export interface KoreksiPdkb {
  jenis: JenisPdkb;
  penyulang: string;
  garduKode: string;
  kategori: string;
  pekerjaan: string;
  alamat: string;
  tgl: string;
  pelaksana: string;
  catatan: string;
}

/** Isian "Catat pekerjaan PDKB" — foto berupa berkas, diunggah saat simpan. */
export interface IsianPdkb {
  ulp: string;
  jenis: JenisPdkb;
  penyulang: string;
  garduKode: string;
  kategori: string;
  pekerjaan: string;
  alamat: string;
  lat: number | null;
  lng: number | null;
  tgl: string;
  pelaksana: string;
  catatan: string;
  inspeksiId: string | null;
  tugasTabel: string | null;
  /** Boleh kosong bila ber-tugas dan tugasnya punya foto temuan. */
  fotoSebelum: File | null;
  fotoSesudah: File;
  fotoProses: File | null;
}

const teks = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const angka = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

const peta = (r: Record<string, unknown>): PekerjaanPdkb => ({
  id: r.id as string,
  ulp: (r.ulp as string) ?? "",
  jenis: (r.jenis as JenisPdkb) ?? "JTM",
  penyulang: teks(r.penyulang),
  garduKode: teks(r.gardu_kode),
  kategori: teks(r.kategori),
  kategoriLabel: teks(r.kategori_label),
  pekerjaan: (r.pekerjaan as string) ?? "",
  alamat: teks(r.alamat),
  lat: angka(r.lat),
  lng: angka(r.lng),
  tgl: (r.tgl as string) ?? "",
  pelaksana: (r.pelaksana as string) ?? "PDKB",
  fotoSebelum: (r.foto_sebelum_url as string) ?? "",
  fotoSesudah: (r.foto_sesudah_url as string) ?? "",
  fotoProses: teks(r.foto_proses_url),
  catatan: teks(r.catatan),
  inspeksiId: teks(r.inspeksi_id),
  tugasTabel: teks(r.tugas_tabel),
  woLabel: teks(r.tugas_temuan),
  woTgl: teks(r.tugas_ditugaskan),
  status: r.status === "Dibatalkan" ? "Dibatalkan" : "Tercatat",
  dibatalkanAlasan: teks(r.dibatalkan_alasan),
  dibatalkanOleh: teks(r.dibatalkan_oleh),
  dibatalkanAt: teks(r.dibatalkan_at),
  diinputOleh: teks(r.diinput_oleh),
  dikoreksiAt: teks(r.dikoreksi_at),
  dikoreksiOleh: teks(r.dikoreksi_oleh),
});

const dua = (n: number) => String(n).padStart(2, "0");
/** bulan 0 = setahun. Batas atas eksklusif. */
const rentang = (tahun: number, bulan: number) =>
  bulan === 0
    ? { awal: `${tahun}-01-01`, akhir: `${tahun + 1}-01-01` }
    : { awal: `${tahun}-${dua(bulan)}-01`, akhir: bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${dua(bulan + 1)}-01` };

export function usePdkb(user: CurrentUser) {
  const bolehSemua = canSeeAllUnits(user.role);
  const sekarang = new Date();
  const tahunIni = sekarang.getFullYear();

  const [semua, setSemua] = useState<PekerjaanPdkb[]>([]);
  const [kategori, setKategori] = useState<KategoriRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [jenis, setJenis] = useState<"SEMUA" | JenisPdkb>("SEMUA");
  const [status, setStatus] = useState<"SEMUA" | StatusPdkb>("Tercatat");
  const [cari, setCari] = useState("");
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, gantiTahun] = useState(tahunIni);
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(() => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]), [bolehSemua, user.unit]);
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  const mulai = () => { setLoading(true); setGalat(null); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };

  const tarik = useCallback(async () => {
    const { awal, akhir } = rentang(tahun, bulan);
    return fetchAllRows<Record<string, unknown>>(() => {
      let x = supabaseBrowser
        .from("pdkb_pekerjaan_daftar")
        .select("*")
        .gte("tgl", awal).lt("tgl", akhir)
        .order("tgl", { ascending: false })
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
        setGalat(/pdkb_pekerjaan_daftar/.test(e.message) ? "Jalankan scripts/pdkb.sql di Supabase dulu." : e.message);
        setLoading(false);
      },
    );
    return () => { hidup = false; };
  }, [tarik, nonce]);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser.from("pemeliharaan_jaringan_ref").select("kode,label,jenis,urutan,aktif").order("urutan")
      .then(({ data }) => { if (hidup) setKategori((data ?? []) as KategoriRef[]); });
    return () => { hidup = false; };
  }, []);

  /** Tersaring cari + jenis, BELUM status — dasar hitungan chip. */
  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    return semua.filter((b) =>
      (jenis === "SEMUA" || b.jenis === jenis) &&
      (!k || [b.penyulang, b.garduKode, b.pekerjaan, b.alamat, b.pelaksana, b.kategoriLabel].some((v) => v?.toUpperCase().includes(k))),
    );
  }, [semua, cari, jenis]);
  const baris = useMemo(() => dasarChip.filter((b) => status === "SEMUA" || b.status === status), [dasarChip, status]);
  const hitung = useMemo(() => {
    const h: Record<StatusPdkb, number> = { Tercatat: 0, Dibatalkan: 0 };
    for (const b of dasarChip) h[b.status] += 1;
    return h;
  }, [dasarChip]);

  /** Mutasi satu baris → ambil ulang baris itu saja, tambal di tempat (butir 7). */
  const segarkanSatu = async (id: string) => {
    const { data } = await supabaseBrowser.from("pdkb_pekerjaan_daftar").select("*").eq("id", id).maybeSingle();
    if (!data) return;
    const b = peta(data);
    setSemua((p) => (p.some((x) => x.id === id) ? p.map((x) => (x.id === id ? b : x)) : [b, ...p]));
  };

  /** Foto diunggah dulu, baru satu RPC; id dibuat di sini supaya klik ganda tidak dobel. */
  const simpan = async (v: IsianPdkb, oleh: string) => {
    const id = crypto.randomUUID();
    const unggah = async (f: File, nama: string) => {
      const jalur = `pdkb/${id}/${Date.now()}-${nama}.jpg`;
      const { error } = await supabaseBrowser.storage
        .from("inspections")
        // Foto bukti: 1024 px / mutu 0,60 — teknisaplikasi.md butir 4.
        .upload(jalur, await perkecilFoto(f, 1024, 0.6), { contentType: "image/jpeg" });
      if (error) throw new Error(`Foto ${nama} gagal diunggah: ${error.message}`);
      return supabaseBrowser.storage.from("inspections").getPublicUrl(jalur).data.publicUrl;
    };
    const [sebelum, sesudah, proses] = await Promise.all([
      v.fotoSebelum ? unggah(v.fotoSebelum, "sebelum") : Promise.resolve(null),
      unggah(v.fotoSesudah, "sesudah"),
      v.fotoProses ? unggah(v.fotoProses, "proses") : Promise.resolve(null),
    ]);
    const { error } = await supabaseBrowser.rpc("simpan_pekerjaan_pdkb", {
      p_isi: {
        id, ulp: v.ulp, jenis: v.jenis,
        penyulang: v.jenis === "GARDU" ? null : v.penyulang,
        gardu_kode: v.jenis === "GARDU" ? v.garduKode : null,
        kategori: v.kategori || null, pekerjaan: v.pekerjaan,
        alamat: v.alamat || null, lat: v.lat, lng: v.lng, tgl: v.tgl,
        pelaksana: v.pelaksana || "PDKB", catatan: v.catatan || null,
        inspeksi_id: v.inspeksiId,
        tugas_tabel: v.tugasTabel,
        foto_sebelum_url: sebelum, foto_sesudah_url: sesudah, foto_proses_url: proses,
        oleh,
      },
    });
    if (error) throw new Error(error.message);
    // Hanya masuk daftar bila tanggalnya di periode yang tampil.
    const { awal, akhir } = rentang(tahun, bulan);
    if (v.tgl >= awal && v.tgl < akhir && (ulp === "SEMUA" || ulp === v.ulp)) await segarkanSatu(id);
  };

  const batalkan = async (id: string, alasan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_pekerjaan_pdkb", { p_id: id, p_alasan: alasan, p_oleh: oleh });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  const koreksi = async (id: string, v: KoreksiPdkb, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("koreksi_pekerjaan_pdkb", {
      p_id: id,
      p_isi: {
        jenis: v.jenis,
        penyulang: v.penyulang || null,
        gardu_kode: v.jenis === "GARDU" ? v.garduKode : null,
        kategori: v.kategori || null,
        pekerjaan: v.pekerjaan,
        alamat: v.alamat || null,
        tgl: v.tgl,
        pelaksana: v.pelaksana,
        catatan: v.catatan || null,
      },
      p_oleh: oleh,
    });
    if (error) throw new Error(/koreksi_pekerjaan_pdkb/.test(error.message) ? "Jalankan scripts/pdkb-2.sql di Supabase dulu." : error.message);
    await segarkanSatu(id);
  };

  return {
    koreksi,
    semua, baris, hitung, kategori, loading, galat, muat,
    ulp, setUlp, daftarUlp, tahun, setTahun, daftarTahun, bulan, setBulan,
    jenis, setJenis, status, setStatus, cari, setCari, simpan, batalkan,
  };
}
