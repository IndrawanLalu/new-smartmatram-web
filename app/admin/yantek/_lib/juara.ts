/**
 * Perhitungan Papan Juara petugas yantek.
 *
 * Empat kriteria dinilai bersama: rating tertinggi, WO terbanyak, response
 * tercepat, recovery tercepat. Tiap kriteria diubah jadi poin 0–100, lalu
 * dijumlahkan menurut bobotnya — satuannya berbeda-beda (bintang, jumlah,
 * menit) sehingga nilai mentahnya tidak bisa dijumlahkan langsung.
 *
 * SEMUA poin diukur PROPORSIONAL terhadap nilai terbaik, tidak lagi lewat
 * urutan peringkat. Poin peringkat dipakai sampai Agustus 2026 dan ternyata
 * mengubah selisih yang tidak berarti jadi jurang: pada Juli 2026 sepuluh besar
 * berdesakan di response 27–31 menit, tapi peringkat merentangkannya jadi 58–97
 * poin — beda 3 menit menjadi 31 poin, dan itulah yang benar-benar menentukan
 * juara. Dengan skala proporsional, beda 3 menit jadi beda 9 poin.
 */

import { durasiSah, extractNama, median, rata, type YantekRow } from "./yantek";

export type KriteriaKey = "rating" | "wo" | "response" | "recovery";

export interface Kriteria {
  key: KriteriaKey;
  /** Judul lengkap untuk kartu kategori. */
  label: string;
  /** Label pendek untuk kolom tabel & bilah rincian. */
  pendek: string;
  /** Kalimat penjelas di bawah judul kartu. */
  catatan: string;
  /** Nilai besar lebih baik? Response & recovery justru sebaliknya. */
  tinggiBaik: boolean;
  /** Andil kriteria ini pada skor gabungan. Total keempatnya = 1. */
  bobot: number;
  format: (v: number) => string;
}

/**
 * Rating memegang separuh skor, tiga kriteria lain berbagi separuh sisanya.
 *
 * Kepuasan pelanggan adalah hasil akhir yang dikejar; WO, response, dan recovery
 * adalah cara mencapainya. Saat bobotnya rata (25% masing-masing), tiga ukuran
 * proses itu bersama-sama memegang 75% suara, sehingga petugas dengan 84
 * penilaian bintang 5 kalah oleh yang punya 40 penilaian hanya karena unggul
 * beberapa menit — Juli 2026, EDWIN SUHADA peringkat 8.
 */
export const BOBOT_RATING = 0.5;
const BOBOT_LAIN = (1 - BOBOT_RATING) / 3;

export const KRITERIA: Kriteria[] = [
  {
    key: "rating",
    label: "Rating Tertinggi",
    pendek: "Rating",
    catatan: "Rata-rata bintang × banyaknya penilaian",
    tinggiBaik: true,
    bobot: BOBOT_RATING,
    format: (v) => v.toFixed(2),
  },
  {
    key: "wo",
    label: "WO Terbanyak",
    pendek: "WO",
    catatan: "Jumlah gangguan yang ditangani",
    tinggiBaik: true,
    bobot: BOBOT_LAIN,
    format: (v) => `${Math.round(v)} WO`,
  },
  {
    key: "response",
    label: "Response Tercepat",
    pendek: "Response",
    catatan: "Median menit lapor → tiba di lokasi",
    tinggiBaik: false,
    bobot: BOBOT_LAIN,
    format: (v) => `${Math.round(v)} mnt`,
  },
  {
    key: "recovery",
    label: "Recovery Tercepat",
    pendek: "Recovery",
    catatan: "Median menit lapor → listrik nyala",
    tinggiBaik: false,
    bobot: BOBOT_LAIN,
    format: (v) => `${Math.round(v)} mnt`,
  },
];

/** Foto petugas — masih kosong, avatar inisial dipakai sebagai mockup.
 *  Saat foto asli tersedia cukup diisi di sini: { "BUDI": "/petugas/budi.jpg" }. */
export const FOTO_PETUGAS: Record<string, string> = {};

/**
 * Poin untuk kriteria RELATIF (WO, response, recovery) yang datanya tidak ada.
 *
 * Ketiganya diukur dengan membandingkan antar-petugas, jadi "tidak ada data"
 * memang tidak punya tempat di garis itu; 50 menyatakan apa adanya: belum
 * diketahui. Rating TIDAK memakai ini — lihat `poinRating`.
 */
export const POIN_NETRAL = 50;

/**
 * Seberapa cepat faktor bukti naik terhadap jumlah penilaian.
 *
 * Makin kecil, makin mudah petugas dengan sedikit penilaian menyamai yang
 * banyak. 10 dipilih supaya 1 penilaian jelas belum berarti apa-apa sementara
 * belasan penilaian sudah mendekati penuh.
 */
const K_BUKTI = 10;

/**
 * Bobot "seberapa teruji" sebuah rata-rata rating, 0–1.
 *
 * Rata-rata 5,00 dari satu pelanggan dan 5,00 dari 84 pelanggan bukan hal yang
 * sama, tapi rata-ratanya tidak bisa membedakan keduanya. Faktor ini yang
 * membedakan: naik cepat di awal lalu melandai, dan dinormalkan ke petugas
 * dengan penilaian terbanyak di papan sehingga selalu ada yang mencapai penuh.
 */
function faktorBukti(jumlah: number, terbanyak: number): number {
  if (terbanyak <= 0 || jumlah <= 0) return 0;
  const f = (n: number) => n / (n + K_BUKTI);
  return f(jumlah) / f(terbanyak);
}

/**
 * Poin rating = mutu × bukti.
 *
 * Mutu memakai rata-rata bintang apa adanya (skala 1–5 sudah punya arti absolut
 * yang sama untuk semua orang) — bukan peringkat, karena 92–99% penilaian
 * bernilai 5 bintang sehingga peringkat mengubah beda 0,12 bintang jadi jurang
 * 53 poin.
 *
 * Petugas tanpa satu pun penilaian mendapat 0, bukan poin netral: rating adalah
 * bukti kepuasan pelanggan, dan tidak ada bukti bukan berarti setengah bukti.
 */
export function poinRating(
  rataBintang: number | null,
  jumlahPenilaian: number,
  penilaianTerbanyak: number,
): number {
  if (rataBintang === null) return 0;
  const mutu = Math.max(0, Math.min(100, ((rataBintang - 1) / 4) * 100));
  return mutu * faktorBukti(jumlahPenilaian, penilaianTerbanyak);
}

/**
 * Poin 0–100 untuk kriteria yang dibandingkan antar-petugas, diukur sebagai
 * RASIO terhadap nilai terbaik di papan.
 *
 * Yang terbaik dapat 100 dan sisanya sejauh mereka dari situ — jadi jarak poin
 * mencerminkan jarak yang sebenarnya. Peringkat tidak bisa melakukan itu: ia
 * hanya tahu urutan, sehingga 28 menit dan 31 menit terpisah sejauh 28 menit
 * dan 60 menit kalau kebetulan tidak ada yang di antaranya.
 */
function poinBanding(nilai: number, terbaik: number, tinggiBaik: boolean): number {
  if (!Number.isFinite(terbaik) || terbaik <= 0 || nilai <= 0) return 0;
  const rasio = tinggiBaik ? nilai / terbaik : terbaik / nilai;
  return Math.max(0, Math.min(100, rasio * 100));
}

export interface PetugasSkor {
  nama: string;
  totalWO: number;
  /** Banyaknya WO yang benar-benar punya bintang — pembagi rata-rata rating. */
  adaRating: number;
  /** Banyaknya penilaian bintang 5 — pemecah seri rata-rata rating. */
  bintangLima: number;
  nilai: Record<KriteriaKey, number | null>;
  /** 0–100 per kriteria; null bila petugas tidak punya data kriteria itu.
   *  Untuk `skor`, null diganti POIN_NETRAL — kecuali rating, lihat `poinRating`. */
  poin: Record<KriteriaKey, number | null>;
  /** Jumlah poin keempat kriteria menurut bobotnya, 0–100. */
  skor: number;
  peringkat: number;
  rows: YantekRow[];
}

/**
 * Urutan pada kriteria rating: rata-rata bintang dulu, lalu yang paling banyak
 * mengumpulkan bintang 5.
 *
 * Pemecah seri ini perlu karena rata-rata 5,00 dicapai puluhan orang sekaligus.
 * Di antara mereka, yang dinilai sempurna oleh 30 pelanggan memang lebih
 * teruji daripada yang dinilai sempurna oleh 1 pelanggan.
 */
function bandingRating(a: PetugasSkor, b: PetugasSkor): number {
  return (
    (b.nilai.rating ?? -1) - (a.nilai.rating ?? -1) ||
    b.bintangLima - a.bintangLima ||
    b.totalWO - a.totalWO
  );
}

/**
 * Susun papan juara dari baris yantek yang sedang tersaring.
 *
 * `minWo` menjaga papan tetap jujur: petugas dengan satu WO berbintang 5 bukan
 * juara rating, dia cuma belum diuji. Yang tidak lolos ambang tetap dihitung
 * ada, hanya tidak ikut diperingkat.
 */
export function buildPapanJuara(rows: YantekRow[], minWo: number): {
  papan: PetugasSkor[];
  totalPetugas: number;
} {
  const bucket = new Map<string, YantekRow[]>();
  for (const r of rows) {
    const nama = extractNama(r.personil_yantek ?? "—");
    if (!bucket.has(nama)) bucket.set(nama, []);
    bucket.get(nama)!.push(r);
  }

  const kandidat = [...bucket.entries()]
    .filter(([, milik]) => milik.length >= minWo)
    .map(([nama, milik]) => {
      const bintang = milik
        .map((r) => r.rating)
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      const resp = durasiSah(milik, "durasi_menit_response");
      const reco = durasiSah(milik, "durasi_menit_recovery");
      return {
        nama,
        totalWO: milik.length,
        adaRating: bintang.length,
        bintangLima: bintang.filter((v) => Math.round(v) === 5).length,
        rows: milik,
        nilai: {
          rating: bintang.length ? rata(bintang) : null,
          wo: milik.length,
          response: resp.length ? median(resp) : null,
          recovery: reco.length ? median(reco) : null,
        } as Record<KriteriaKey, number | null>,
      };
    });

  // Titik acuan tiap kriteria: nilai terbaik yang benar-benar ada di papan ini.
  // Papan kosong menghasilkan Infinity/-Infinity — `poinBanding` menjaganya.
  const nilaiAda = (k: KriteriaKey) =>
    kandidat.map((c) => c.nilai[k]).filter((v): v is number => v !== null);
  const acuan: Record<Exclude<KriteriaKey, "rating">, number> = {
    wo: Math.max(...nilaiAda("wo")),
    response: Math.min(...nilaiAda("response")),
    recovery: Math.min(...nilaiAda("recovery")),
  };
  const penilaianTerbanyak = Math.max(0, ...kandidat.map((c) => c.adaRating));

  const papan: PetugasSkor[] = kandidat
    .map((c) => {
      const poin = Object.fromEntries(
        KRITERIA.map((k) => {
          if (k.key === "rating")
            return [k.key, poinRating(c.nilai.rating, c.adaRating, penilaianTerbanyak)];
          const v = c.nilai[k.key];
          return [k.key, v === null ? null : poinBanding(v, acuan[k.key], k.tinggiBaik)];
        }),
      ) as Record<KriteriaKey, number | null>;
      return {
        ...c,
        poin,
        skor: KRITERIA.reduce((s, k) => s + k.bobot * (poin[k.key] ?? POIN_NETRAL), 0),
        peringkat: 0,
      };
    })
    // Seri skor dipecah oleh aturan rating yang sama dengan kategorinya:
    // rata-rata bintang, lalu jumlah bintang 5, lalu jumlah WO.
    .sort((a, b) => b.skor - a.skor || bandingRating(a, b))
    .map((p, i) => ({ ...p, peringkat: i + 1 }));

  return { papan, totalPetugas: bucket.size };
}

/** Tiga teratas untuk satu kriteria, diurut berdasarkan nilai kriteria itu. */
export function juaraKategori(papan: PetugasSkor[], k: Kriteria): PetugasSkor[] {
  const layak = papan.filter((p) => p.nilai[k.key] !== null);
  if (k.key === "rating") return [...layak].sort(bandingRating).slice(0, 3);
  return layak
    .sort((a, b) => {
      const av = a.nilai[k.key] as number;
      const bv = b.nilai[k.key] as number;
      return (k.tinggiBaik ? bv - av : av - bv) || b.totalWO - a.totalWO;
    })
    .slice(0, 3);
}
