"use client";

import { useCallback, useState } from "react";
import type { GarduPeta, TiangPeta } from "./usePetaIsi";
import type { KesehatanGardu } from "./useKesehatanPeta";
import type { Terpilih } from "./useObjekPeta";

/**
 * Benda yang diklik di peta dan mode sunting yang sedang menunggu klik
 * berikutnya: geser titik, ganti induk (batang / di penyulang yang menumpang),
 * gabungkan tiang kembar, balik arah JTM. Klik ditujukan ke mode yang aktif lebih dulu —
 * geser banyak, koreksi isian, gabung, induk — baru memilih benda.
 */

interface Deps {
  /** Mode geser titik banyak tiang: klik = tambahkan tiang. */
  geserBanyak: { aktif: boolean; pilih: (t: TiangPeta) => void };
  /** Koreksi isian JTM: klik = tiang awal / akhir rentang. */
  koreksi: { aktif: boolean; pilih: (t: TiangPeta) => void };
  /** Dipanggil saat panel benda ditutup (mis. menutup simulasi). */
  onTutup: () => void;
}

export function usePilihObjek({ geserBanyak, koreksi, onTutup }: Deps) {
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
  /** Ganti induk JTR wajib beralasan — diisi di panel, dipakai saat tiang diklik. */
  const [alasanInduk, setAlasanInduk] = useState("");

  // Stabil — `Isi` di peta di-memo, dan ribuan objeknya tidak boleh digambar
  // ulang hanya karena panel berubah.
  const { aktif: geserBanyakAktif, pilih: pilihGeserBanyak } = geserBanyak;
  const { aktif: koreksiAktif, pilih: pilihKoreksi } = koreksi;
  const pilihTiang = useCallback(
    (t: TiangPeta) => {
      if (geser) return;
      if (geserBanyakAktif) {
        pilihGeserBanyak(t);
        return;
      }
      if (koreksiAktif) {
        pilihKoreksi(t);
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
    [geser, modeInduk, modeGabung, balik, terpilih, geserBanyakAktif, pilihGeserBanyak, koreksiAktif, pilihKoreksi, indukPenyulang],
  );
  const pilihGardu = useCallback(
    (g: GarduPeta) => {
      if (geser || modeInduk || balik || geserBanyakAktif || koreksiAktif) return;
      setTerpilih({ jenis: "gardu", kode: g.kode, ulp: g.ulp, lat: g.lat, lng: g.lng });
    },
    [geser, modeInduk, balik, geserBanyakAktif, koreksiAktif],
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
    setAlasanInduk("");
  };

  return {
    terpilih, setTerpilih, geser, setGeser, aturGeser,
    modeInduk, setModeInduk, indukPenyulang, setIndukPenyulang,
    modeGabung, setModeGabung, calonGabung, setCalonGabung, calonInduk, setCalonInduk,
    balik, setBalik, calonBalik, setCalonBalik,
    alasanInduk, setAlasanInduk,
    pilihTiang, pilihGardu, pilihKesehatan, tutup,
  };
}

export type PilihObjek = ReturnType<typeof usePilihObjek>;
