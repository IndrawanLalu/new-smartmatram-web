"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import { fetchAllRows } from "@/lib/supabasePaginate";

/**
 * Pemeliharaan Jaringan JTM/JTR — daftar dan acuan kategorinya.
 *
 * Pengisiannya di HP; web memantau dan memverifikasi. Jadi hook ini tidak
 * punya "tambah catatan" sama sekali — yang ada cuma membaca, memverifikasi,
 * dan membatalkan yang salah input.
 */

export type JenisJaringan = "JTM" | "JTR";

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
  status: string;
  petugasNama: string | null;
  catatan: string | null;
  tgl: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

export interface KategoriRef {
  kode: string;
  label: string;
  jenis: "JTM" | "JTR" | "SEMUA";
  urutan: number;
  aktif: boolean;
}

interface Hasil {
  baris: BarisPemeliharaan[];
  kategori: KategoriRef[];
  loading: boolean;
  /** Daftar gagal dibaca — bukan daftar yang kosong. */
  galat: string | null;
  ulp: string;
  setUlp: (u: string) => void;
  daftarUlp: string[];
  jenis: "SEMUA" | JenisJaringan;
  setJenis: (j: "SEMUA" | JenisJaringan) => void;
  /** 0 = sepanjang tahun. */
  bulan: number;
  setBulan: (b: number) => void;
  tahun: number;
  setTahun: (t: number) => void;
  daftarTahun: number[];
  muat: () => Promise<void>;
  verifikasi: (id: string, oleh: string) => Promise<void>;
  batalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
  simpanKategori: (k: KategoriRef, baru: boolean) => Promise<void>;
}

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const dua = (n: number) => String(n).padStart(2, "0");
const akhirBulan = (tahun: number, bulan: number) => new Date(tahun, bulan, 0).getDate();

export function usePemeliharaanJaringan(user: CurrentUser): Hasil {
  const bolehSemua = canSeeAllUnits(user.role);

  const [baris, setBaris] = useState<BarisPemeliharaan[]>([]);
  const [kategori, setKategori] = useState<KategoriRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);
  const [ulp, setUlp] = useState(bolehSemua ? "SEMUA" : (user.unit ?? ""));
  const [jenis, setJenis] = useState<"SEMUA" | JenisJaringan>("SEMUA");
  // Bawaan bulan berjalan — teknisaplikasi.md butir 13. Dulu tanpa periode dan
  // dipotong `.limit(500)`: catatan ke-501 ada di database tapi tidak tampil.
  const sekarang = new Date();
  const [bulan, setBulan] = useState(sekarang.getMonth() + 1);
  const [tahun, setTahun] = useState(sekarang.getFullYear());
  const tahunIni = sekarang.getFullYear();
  const daftarTahun = useMemo(() => [tahunIni, tahunIni - 1, tahunIni - 2], [tahunIni]);

  const daftarUlp = useMemo(
    () => (bolehSemua ? ["SEMUA", ...UNIT] : [user.unit ?? ""]),
    [bolehSemua, user.unit],
  );

  const muat = useCallback(async () => {
    setLoading(true);
    setGalat(null);

    const awal = bulan === 0 ? `${tahun}-01-01` : `${tahun}-${dua(bulan)}-01`;
    const akhir = bulan === 0 ? `${tahun}-12-31` : `${tahun}-${dua(bulan)}-${dua(akhirBulan(tahun, bulan))}`;

    // Kueri dibangun baru tiap halaman, diurutkan sampai kolom unik supaya
    // baris bertanggal sama tidak tertukar antarhalaman.
    const q = () => {
      let x = supabaseBrowser
        .from("pemeliharaan_jaringan_daftar")
        .select("*")
        .gte("tgl", awal)
        .lte("tgl", akhir)
        .order("tgl", { ascending: false })
        .order("id");
      if (ulp !== "SEMUA") x = x.eq("ulp", ulp);
      if (jenis !== "SEMUA") x = x.eq("jenis", jenis);
      return x;
    };

    const [dat, ref] = await Promise.all([
      fetchAllRows<Record<string, unknown>>(q).then(
        (data) => ({ data, error: null as { message: string } | null }),
        (e: Error) => ({ data: null as Record<string, unknown>[] | null, error: { message: e.message } }),
      ),
      supabaseBrowser
        .from("pemeliharaan_jaringan_ref")
        .select("kode,label,jenis,urutan,aktif")
        .order("urutan"),
    ]);

    // Daftar kosong karena server tidak terbaca TIDAK boleh terlihat sama
    // dengan daftar yang memang belum berisi apa-apa — lihat
    // `teknisaplikasi.md` butir 6.
    if (dat.error) {
      setBaris([]);
      setGalat(dat.error.message);
      setLoading(false);
      return;
    }

    setBaris(
      (dat.data ?? []).map((r) => ({
        id: r.id as string,
        jenis: r.jenis as JenisJaringan,
        penyulang: (r.penyulang as string) ?? "",
        ulp: (r.ulp as string) ?? "",
        kategori: (r.kategori as string) ?? "",
        kategoriLabel: (r.kategori_label as string) ?? null,
        pekerjaan: (r.pekerjaan as string) ?? "",
        alamat: (r.alamat as string) ?? null,
        lat: r.lat === null ? null : Number(r.lat),
        lng: r.lng === null ? null : Number(r.lng),
        fotoSebelum: (r.foto_sebelum_url as string) ?? "",
        fotoSesudah: (r.foto_sesudah_url as string) ?? "",
        status: (r.status as string) ?? "Selesai",
        petugasNama: (r.petugas_nama as string) ?? null,
        catatan: (r.catatan as string) ?? null,
        tgl: (r.tgl as string) ?? "",
        verifiedAt: (r.verified_at as string) ?? null,
        verifiedBy: (r.verified_by as string) ?? null,
      })),
    );
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
  }, [ulp, jenis, bulan, tahun]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const verifikasi = async (id: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("verifikasi_pemeliharaan_jaringan", {
      p_id: id,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    // Ditambal di tempat: yang berubah satu baris, dan memuat ulang 500 baris
    // untuk satu tombol membuat urutan tabel melompat di bawah jari admin.
    setBaris((p) =>
      p.map((b) =>
        b.id === id
          ? { ...b, status: "Diverifikasi", verifiedBy: oleh, verifiedAt: new Date().toISOString() }
          : b,
      ),
    );
  };

  const batalkan = async (id: string, alasan: string, oleh: string) => {
    const { error } = await supabaseBrowser.rpc("batalkan_pemeliharaan_jaringan", {
      p_id: id,
      p_alasan: alasan,
      p_nama: oleh,
    });
    if (error) throw new Error(error.message);
    setBaris((p) => p.map((b) => (b.id === id ? { ...b, status: "Dibatalkan" } : b)));
  };

  const simpanKategori = async (k: KategoriRef, baru: boolean) => {
    const isi = {
      kode: k.kode,
      label: k.label,
      jenis: k.jenis,
      urutan: k.urutan,
      aktif: k.aktif,
      updated_at: new Date().toISOString(),
    };
    const { error } = baru
      ? await supabaseBrowser.from("pemeliharaan_jaringan_ref").insert(isi)
      : await supabaseBrowser.from("pemeliharaan_jaringan_ref").update(isi).eq("kode", k.kode);
    if (error) throw new Error(error.message);

    setKategori((p) => {
      const lain = p.filter((x) => x.kode !== k.kode);
      return [...lain, k].sort((a, b) => a.urutan - b.urutan);
    });
  };

  return {
    baris, kategori, loading, galat, ulp, setUlp, daftarUlp, jenis, setJenis,
    bulan, setBulan, tahun, setTahun, daftarTahun,
    muat, verifikasi, batalkan, simpanKategori,
  };
}
