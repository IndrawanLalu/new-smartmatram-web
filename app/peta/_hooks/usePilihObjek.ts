"use client";

import { useCallback, useState } from "react";
import type { GarduPeta, TiangPeta } from "./usePetaIsi";
import type { KesehatanGardu } from "./useKesehatanPeta";
import type { Terpilih } from "./useObjekPeta";

/**
 * Benda yang diklik di peta dan mode sunting yang sedang menunggu klik
 * berikutnya: geser titik, ganti induk (batang / di penyulang yang menumpang),
 * gabungkan tiang kembar, balik arah JTM, tambah tiang & sambung hilir JTM.
 * Klik ditujukan ke mode yang aktif lebih dulu — geser banyak, pecah segmen, koreksi isian,
 * induk tiang yang dipulihkan, gabung, induk, hilir — baru memilih benda.
 */

interface Deps {
  /** Mode geser titik banyak tiang: klik = tambahkan tiang. */
  geserBanyak: { aktif: boolean; pilih: (t: TiangPeta) => void };
  /** Pecah segmen (Section X3): klik = titik potong. */
  pecah: { aktif: boolean; pilih: (t: TiangPeta) => void };
  /** Koreksi isian JTM: klik = tiang awal / akhir rentang. */
  koreksi: { aktif: boolean; pilih: (t: TiangPeta) => void };
  /** Pulihkan tiang dibatalkan: klik = induknya (useTiangBatal). */
  pulihInduk: { aktif: boolean; pilih: (t: TiangPeta) => void };
  /** Dipanggil saat panel benda ditutup (mis. menutup simulasi). */
  onTutup: () => void;
}

export function usePilihObjek({ geserBanyak, pecah, koreksi, pulihInduk, onTutup }: Deps) {
  const [terpilih, setTerpilih] = useState<Terpilih | null>(null);
  const [geser, setGeser] = useState<{ lat: number; lng: number } | null>(null);
  const [modeInduk, setModeInduk] = useState(false);
  /** Ganti induk DI PENYULANG YANG MENUMPANG (titik pertemuan); null = induk batang. */
  const [indukPenyulang, setIndukPenyulang] = useState<string | null>(null);
  /** Gabungkan tiang kembar: menunggu klik batang aslinya. */
  const [modeGabung, setModeGabung] = useState(false);
  const [calonGabung, setCalonGabung] = useState<TiangPeta | null>(null);
  const [calonInduk, setCalonInduk] = useState<TiangPeta | null>(null);
  /** Balik arah JTM: tiang terpilih = pangkal yang salah; menunggu klik pangkal
   *  sebenarnya (`ke`), lalu tiang hulunya → `calonBalik` membuka pratinjau. */
  const [balik, setBalik] = useState<{ ke: TiangPeta | null } | null>(null);
  const [calonBalik, setCalonBalik] = useState<{ ke: TiangPeta; hulu: TiangPeta | null } | null>(null);
  /** Tambah tiang JTM dari tiang terpilih: letaknya = `geser` (penggeser yang sama). */
  const [tambah, setTambah] = useState(false);
  /** Sambung hilir: tiang yang diklik menjadi anak tiang terpilih. */
  const [modeHilir, setModeHilir] = useState(false);
  const [calonHilir, setCalonHilir] = useState<TiangPeta | null>(null);
  /** Ganti induk JTR wajib beralasan — diisi di panel, dipakai saat tiang diklik. */
  const [alasanInduk, setAlasanInduk] = useState("");

  // Stabil — `Isi` di peta di-memo, dan ribuan objeknya tidak boleh digambar
  // ulang hanya karena panel berubah.
  const { aktif: geserBanyakAktif, pilih: pilihGeserBanyak } = geserBanyak;
  const { aktif: pecahAktif, pilih: pilihPecah } = pecah;
  const { aktif: koreksiAktif, pilih: pilihKoreksi } = koreksi;
  const { aktif: pulihAktif, pilih: pilihPulih } = pulihInduk;
  const pilihTiang = useCallback(
    (t: TiangPeta) => {
      if (geser) return;
      if (geserBanyakAktif) {
        pilihGeserBanyak(t);
        return;
      }
      if (pecahAktif) {
        pilihPecah(t);
        return;
      }
      if (koreksiAktif) {
        pilihKoreksi(t);
        return;
      }
      if (pulihAktif) {
        pilihPulih(t);
        return;
      }
      if (modeHilir) {
        if (terpilih?.jenis !== "tiang" || t.jaringan !== "jtm" || t.id === terpilih.id) return;
        setCalonHilir(t);
        return;
      }
      if (modeGabung) {
        // Batang asli = batang LAIN, di jaringan lain (JTM, atau JTR gardu lain).
        if (terpilih?.jenis !== "tiang" || t.id === terpilih.id) return;
        if (t.jaringan === "jtr" && t.kelompok === terpilih.kelompok) return;
        setCalonGabung(t);
        return;
      }
      if (modeInduk) {
        if (terpilih?.jenis !== "tiang" || t.id === terpilih.id) return;
        // Induk JTR harus tiang JTR gardu yang sama.
        if (terpilih.jaringan === "jtr" && (t.jaringan !== "jtr" || t.kelompok !== terpilih.kelompok)) return;
        // Induk di penyulang yang menumpang: tiang dari lapisan penyulang itu.
        if (indukPenyulang && (t.jaringan !== "jtm" || t.kelompok.toUpperCase() !== indukPenyulang.toUpperCase())) return;
        setCalonInduk(t);
        return;
      }
      if (balik) {
        if (terpilih?.jenis !== "tiang" || t.jaringan !== "jtm" || t.id === terpilih.id) return;
        if (!balik.ke) setBalik({ ke: t });
        else if (t.id !== balik.ke.id) setCalonBalik({ ke: balik.ke, hulu: t });
        return;
      }
      setTerpilih({ jenis: "tiang", id: t.id, kelompok: t.kelompok, lat: t.lat, lng: t.lng, kode: t.kode, jaringan: t.jaringan === "jtr" ? "jtr" : "jtm" });
    },
    [geser, modeInduk, modeGabung, modeHilir, balik, terpilih, geserBanyakAktif, pilihGeserBanyak, pecahAktif, pilihPecah, koreksiAktif, pilihKoreksi, pulihAktif, pilihPulih, indukPenyulang],
  );
  const pilihGardu = useCallback(
    (g: GarduPeta) => {
      if (geser || modeInduk || modeHilir || balik || geserBanyakAktif || pecahAktif || koreksiAktif || pulihAktif) return;
      setTerpilih({ jenis: "gardu", kode: g.kode, ulp: g.ulp, lat: g.lat, lng: g.lng });
    },
    [geser, modeInduk, modeHilir, balik, geserBanyakAktif, pecahAktif, koreksiAktif, pulihAktif],
  );
  const pilihKesehatan = useCallback(
    (g: KesehatanGardu) => {
      if (geser || modeInduk) return;
      setTerpilih({ jenis: "gardu", kode: g.kode, ulp: g.ulp, lat: g.lat, lng: g.lng });
    },
    [geser, modeInduk],
  );
  const aturGeser = useCallback((lat: number, lng: number) => setGeser({ lat, lng }), []);

  const tutup = () => {
    onTutup();
    setTerpilih(null);
    setGeser(null);
    setModeInduk(false);
    setIndukPenyulang(null);
    setModeGabung(false);
    setBalik(null);
    setCalonBalik(null);
    setTambah(false);
    setModeHilir(false);
    setCalonHilir(null);
    setAlasanInduk("");
  };

  return {
    terpilih, setTerpilih, geser, setGeser, aturGeser,
    modeInduk, setModeInduk, indukPenyulang, setIndukPenyulang,
    modeGabung, setModeGabung, calonGabung, setCalonGabung, calonInduk, setCalonInduk,
    balik, setBalik, calonBalik, setCalonBalik,
    tambah, setTambah, modeHilir, setModeHilir, calonHilir, setCalonHilir,
    alasanInduk, setAlasanInduk,
    pilihTiang, pilihGardu, pilihKesehatan, tutup,
  };
}

export type PilihObjek = ReturnType<typeof usePilihObjek>;
