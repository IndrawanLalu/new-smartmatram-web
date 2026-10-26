"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { perkecilFoto } from "@/lib/gambarSurvey/latar";

/**
 * Pemeliharaan Jaringan JTM/JTR — daftar, verifikasi, koreksi, dan acuan
 * kategorinya. Pola tampilannya sama dengan Optimasi Trafo (tabel + modal).
 *
 * Pengisiannya di HP; web memeriksa. Pengecualian (26 Okt 2026): pekerjaan
 * tim di luar aplikasi (PDKB, Yantek, kontraktor) dicatat admin lewat
 * `inputAdmin` — foto sebelum-sesudah tetap wajib, langsung Diverifikasi,
 * ditandai sumber = web (pemeliharaan-jaringan-input-admin.sql).
 */

export type JenisJaringan = "JTM" | "JTR";

/** Nama status yang tampil. `Selesai` di database = "Menunggu verifikasi"
 *  dari sisi admin — sama dengan Optimasi Trafo. */
export type StatusTabel = "Menunggu verifikasi" | "Dikembalikan" | "Diverifikasi" | "Dibatalkan";
export const STATUS_TABEL: StatusTabel[] = ["Menunggu verifikasi", "Dikembalikan", "Diverifikasi", "Dibatalkan"];
const STATUS_DB: Record<string, StatusTabel> = {
  Selesai: "Menunggu verifikasi",
  // Dikembalikan ke petugas (25 Sep 2026): muncul lagi di HP sebagai draf.
  Dikembalikan: "Dikembalikan",
  Diverifikasi: "Diverifikasi",
  Dibatalkan: "Dibatalkan",
};

export interface BarisPemeliharaan {
  id: string;
  jenis: JenisJaringan;
  penyulang: string;
  ulp: string;
  kategori: string;
  kategoriLabel: string | null;
  pekerjaan: string;
  alamat: string | null;
  lat: number | null;
  lng: number | null;
  fotoSebelum: string;
  fotoSesudah: string;
  /** Foto tambahan (paling banyak 2 per sisi) — `scripts/foto-temuan-banyak.sql`. */
  fotoSebelumLain: string[];
  fotoSesudahLain: string[];
  /** Foto proses pekerjaan, opsional (26 Okt 2026). */
  fotoProses: string | null;
  /** "web" = dicatat admin untuk tim di luar aplikasi; pelaksana = nama timnya. */
  sumber: "hp" | "web";
  pelaksana: string | null;
  diinputOleh: string | null;
  statusDb: string;
  status: StatusTabel;
  petugasNama: string | null;
  catatan: string | null;
  tgl: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  /** WO asal pekerjaan ini — tugas temuan (baris `inspeksi`) yang dikerjakan
   *  HARJAR (rencana-mobile-harjar.md). null = di luar tugas (tampil "-"). */
  inspeksiId: string | null;
  woLabel: string | null;
  woTgl: string | null;
  tugasDeskripsi: string | null;
  tugasFoto: string | null;
  dikembalikanAlasan: string | null;
  dikembalikanOleh: string | null;
}

export interface KategoriRef {
  kode: string;
  label: string;
  jenis: "JTM" | "JTR" | "SEMUA";
  urutan: number;
  aktif: boolean;
}

/** Isian yang boleh dikoreksi admin. Foto & titik tidak — bukti lapangan. */
export interface KoreksiPemeliharaan {
  jenis: JenisJaringan;
  penyulang: string;
  kategori: string;
  pekerjaan: string;
  alamat: string | null;
  catatan: string | null;
}

export type SaringStatus = "SEMUA" | StatusTabel;

/** Isian "Catat pekerjaan tim lain" — foto berupa berkas, diunggah saat simpan. */
export interface InputAdmin {
  jenis: JenisJaringan;
  penyulang: string;
  /** Satu baris tabel per kategori; foto & isian lain dipakai bersama
   *  (pemeliharaan-jaringan-input-banyak.sql, 26 Okt 2026). */
  item: { kategori: string; pekerjaan: string }[];
  pelaksana: string;
  tgl: string;
  alamat: string;
  lat: number | null;
  lng: number | null;
  catatan: string;
  fotoSebelum: File;
  fotoSesudah: File;
  fotoProses: File | null;
}

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const dua = (n: number) => String(n).padStart(2, "0");
const akhirBulan = (tahun: number, bulan: number) => new Date(tahun, bulan, 0).getDate();

/** Rentang tanggal sebuah periode. bulan 0 = sepanjang tahun. */
export const rentangPeriode = (tahun: number, bulan: number) => ({
  awal: bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`,
  akhir: bulan === 0 ? `${tahun}-12-31` : `${tahun}-${dua(bulan)}-${dua(akhirBulan(tahun, bulan))}`,
});

const angka = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const teks = (v: unknown) => (v === null || v === undefined ? null : String(v));

export const petaBaris = (r: Record<string, unknown>): BarisPemeliharaan => {
  const statusDb = (r.status as string) ?? "Selesai";
  return {
    id: r.id as string,
    jenis: r.jenis as JenisJaringan,
    penyulang: (r.penyulang as string) ?? "",
    ulp: (r.ulp as string) ?? "",
    kategori: (r.kategori as string) ?? "",
    kategoriLabel: teks(r.kategori_label),
    pekerjaan: (r.pekerjaan as string) ?? "",
    alamat: teks(r.alamat),
    lat: angka(r.lat),
    lng: angka(r.lng),
    fotoSebelum: (r.foto_sebelum_url as string) ?? "",
    fotoSesudah: (r.foto_sesudah_url as string) ?? "",
    fotoSebelumLain: (r.foto_sebelum_lain as string[] | null) ?? [],
    fotoSesudahLain: (r.foto_sesudah_lain as string[] | null) ?? [],
    fotoProses: teks(r.foto_proses_url),
    sumber: r.sumber === "web" ? "web" : "hp",
    pelaksana: teks(r.pelaksana),
    diinputOleh: teks(r.diinput_oleh),
    statusDb,
    status: STATUS_DB[statusDb] ?? "Menunggu verifikasi",
    petugasNama: teks(r.petugas_nama),
    catatan: teks(r.catatan),
    tgl: (r.tgl as string) ?? "",
    verifiedAt: teks(r.verified_at),
    verifiedBy: teks(r.verified_by),
    inspeksiId: teks(r.inspeksi_id),
    woLabel: teks(r.tugas_temuan),
    woTgl: teks(r.tugas_ditugaskan),
    tugasDeskripsi: teks(r.tugas_deskripsi),
    tugasFoto: teks(r.tugas_foto),
    dikembalikanAlasan: teks(r.dikembalikan_alasan),
    dikembalikanOleh: teks(r.dikembalikan_oleh),
  };
};

export function usePemeliharaanJaringan(user: CurrentUser) {
  const bolehSemua = canSeeAllUnits(user.role);
  const sekarang = new Date();
  const tahunIni = sekarang.getFullYear();

  const [semua, setSemua] = useState<BarisPemeliharaan[]>([]);
  const [kategori, setKategori] = useState<KategoriRef[]>([]);
  const [loading, setLoading] = useState(true);
  /** Daftar gagal dibaca — bukan daftar yang kosong (teknisaplikasi.md butir 6). */
  const [galat, setGalat] = useState<string | null>(null);
  const [ulp, gantiUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [jenis, setJenis] = useState<"SEMUA" | JenisJaringan>("SEMUA");
  const [status, setStatus] = useState<SaringStatus>("SEMUA");
  const [cari, setCari] = useState("");
  // Bawaan bulan berjalan — teknisaplikasi.md butir 13.
  const [bulan, gantiBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, gantiTahun] = useState(tahunIni);
  const [nonce, setNonce] = useState(0);

  const daftarUlp = useMemo(
    () => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]),
    [bolehSemua, user.unit],
  );
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  // "Memuat" dinyalakan oleh PEMICUNYA, bukan di dalam efek.
  const mulai = () => { setLoading(true); setGalat(null); };
  const setUlp = (u: string) => { mulai(); gantiUlp(u); };
  const setBulan = (b: number) => { mulai(); gantiBulan(b); };
  const setTahun = (t: number) => { mulai(); gantiTahun(t); };
  const muat = () => { mulai(); setNonce((n) => n + 1); };

  // Jenis, status, dan cari disaring di peramban: datanya sudah di tangan
  // untuk periode itu, dan mengganti chip tidak boleh memuat ulang dari server.
  const tarik = useCallback(async () => {
    const { awal, akhir } = rentangPeriode(tahun, bulan);
    const q = () => {
      let x = supabaseBrowser
        .from("pemeliharaan_jaringan_daftar")
        .select("*")
        .gte("tgl", awal)
        .lte("tgl", akhir)
        .order("tgl", { ascending: false })
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      return x;
    };
    const [dat, ref] = await Promise.all([
      fetchAllRows<Record<string, unknown>>(q).then(
        (data) => ({ data, error: null as string | null }),
        (e: Error) => ({ data: [] as Record<string, unknown>[], error: e.message }),
      ),
      supabaseBrowser.from("pemeliharaan_jaringan_ref").select("kode,label,jenis,urutan,aktif").order("urutan"),
    ]);
    return { dat, ref };
  }, [ulp, bulan, tahun]);

  useEffect(() => {
    let hidup = true;
    // State diisi di callback, bukan di badan efek; jawaban lama yang datang
    // belakangan (penyaring sudah diganti) dibuang.
    tarik().then(({ dat, ref }) => {
      if (!hidup) return;
      setGalat(dat.error);
      setSemua(dat.data.map(petaBaris));
      setKategori(
        (ref.data ?? []).map((r) => ({
          kode: r.kode as string,
          label: r.label as string,
          jenis: r.jenis as KategoriRef["jenis"],
          urutan: Number(r.urutan ?? 100),
          aktif: !!r.aktif,
        })),
      );
      setLoading(false);
    });
    return () => { hidup = false; };
  }, [tarik, nonce]);

  /** Tersaring jenis + cari, BELUM status — dasar hitungan chip status. */
  const dasarChip = useMemo(() => {
    const k = cari.trim().toUpperCase();
    return semua.filter(
      (b) =>
        (jenis === "SEMUA" || b.jenis === jenis) &&
        (!k ||
          [b.penyulang, b.pekerjaan, b.alamat ?? "", b.petugasNama ?? "", b.kategoriLabel ?? ""]
            .some((v) => v.toUpperCase().includes(k))),
    );
  }, [semua, jenis, cari]);

  const baris = useMemo(
    () => dasarChip.filter((b) => status === "SEMUA" || b.status === status),
    [dasarChip, status],
  );

  const hitung = useMemo(() => {
    const h = Object.fromEntries(STATUS_TABEL.map((s) => [s, 0])) as Record<StatusTabel, number>;
    for (const b of dasarChip) h[b.status] += 1;
    return h;
  }, [dasarChip]);

  /** Ambil ulang SATU baris dari view lalu tambal di tempat. */
  const segarkanSatu = async (id: string) => {
    const { data } = await supabaseBrowser
      .from("pemeliharaan_jaringan_daftar")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (data) setSemua((p) => p.map((x) => (x.id === id ? petaBaris(data) : x)));
  };

  const verifikasi = async (id: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("verifikasi_pemeliharaan_jaringan", { p_id: id, p_nama: oleh });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  const batalkan = async (id: string, alasan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_pemeliharaan_jaringan", {
      p_id: id,
      p_alasan: alasan,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  /** Kembalikan ke petugas (teknisaplikasi.md butir 2): catatan muncul lagi
   *  di HP sebagai draf berisi isian lama; tugasnya kembali "Dalam Proses". */
  const kembalikan = async (id: string, alasan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("kembalikan_pemeliharaan_jaringan", {
      p_id: id,
      p_alasan: alasan,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  /** Koreksi admin — hanya selama menunggu verifikasi (dijaga server juga). */
  const koreksi = async (id: string, v: KoreksiPemeliharaan) => {
    const { error } = await supabaseBrowser.rpc("ubah_pemeliharaan_jaringan", {
      p_id: id,
      p_jenis: v.jenis,
      p_penyulang: v.penyulang,
      p_kategori: v.kategori,
      p_pekerjaan: v.pekerjaan,
      p_alamat: v.alamat,
      p_catatan: v.catatan,
    });
    if (error) throw new Error(error.message);
    await segarkanSatu(id);
  };

  /** Catat pekerjaan tim di luar aplikasi. Foto diunggah dulu (folder sama
   *  dengan kiriman HP), baru RPC; id dibuat di sini supaya klik ganda tidak dobel. */
  const inputAdmin = async (v: InputAdmin, oleh: string) => {
    const id = crypto.randomUUID();
    const unggah = async (f: File, nama: string) => {
      const jalur = `harjar/${id}/${Date.now()}-${nama}.jpg`;
      const { error } = await supabaseBrowser.storage
        .from("inspections")
        .upload(jalur, await perkecilFoto(f, 1600), { contentType: "image/jpeg" });
      if (error) throw new Error(`Foto ${nama} gagal diunggah: ${error.message}`);
      return supabaseBrowser.storage.from("inspections").getPublicUrl(jalur).data.publicUrl;
    };
    const [sebelum, sesudah, proses] = await Promise.all([
      unggah(v.fotoSebelum, "sebelum"),
      unggah(v.fotoSesudah, "sesudah"),
      v.fotoProses ? unggah(v.fotoProses, "proses") : Promise.resolve(null),
    ]);
    const { error } = await supabaseBrowser.rpc("input_pemeliharaan_jaringan_admin", {
      p_isi: {
        id,
        jenis: v.jenis,
        penyulang: v.penyulang,
        item: v.item,
        pelaksana: v.pelaksana,
        tgl: v.tgl,
        alamat: v.alamat || null,
        lat: v.lat,
        lng: v.lng,
        catatan: v.catatan || null,
        foto_sebelum_url: sebelum,
        foto_sesudah_url: sesudah,
        foto_proses_url: proses,
        oleh,
      },
    });
    if (error) throw new Error(error.message);
    muat();
  };

  const simpanKategori = async (k: KategoriRef, baru: boolean) => {
    const isi = { ...k, updated_at: new Date().toISOString() };
    const { error } = baru
      ? await supabaseBrowser.from("pemeliharaan_jaringan_ref").insert(isi)
      : await supabaseBrowser.from("pemeliharaan_jaringan_ref").update(isi).eq("kode", k.kode);
    if (error) throw new Error(error.message);
    setKategori((p) => [...p.filter((x) => x.kode !== k.kode), k].sort((a, b) => a.urutan - b.urutan));
  };

  return {
    semua, baris, hitung, kategori, loading, galat,
    ulp, setUlp, daftarUlp, jenis, setJenis, status, setStatus, cari, setCari,
    bulan, setBulan, tahun, setTahun, daftarTahun,
    muat, verifikasi, batalkan, kembalikan, koreksi, inputAdmin, simpanKategori,
  };
}
