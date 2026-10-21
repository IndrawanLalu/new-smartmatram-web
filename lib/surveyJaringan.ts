/**
 * Survey Jaringan Baru (S1, 21 Okt 2026) — dipakai peta (menggambar) dan
 * halaman daftar (rincian, material, gambar survey). SQL:
 * scripts/survey-jaringan.sql. Rencana: rencana-jaringan-baru.md.
 */

import { jarakMeter } from "@/lib/geo";

export type StatusSurvey = "Draf" | "Disetujui" | "Dioperasikan" | "Batal";
export const STATUS_SURVEY: StatusSurvey[] = ["Draf", "Disetujui", "Dioperasikan", "Batal"];
export const NADA_STATUS_SURVEY: Record<StatusSurvey, string> = {
  Draf: "bg-sky-50 text-sky-700 border-sky-200",
  Disetujui: "bg-navy-50 text-navy-600 border-navy-200",
  Dioperasikan: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Batal: "bg-gray-100 text-gray-500 border-gray-200",
};

export type AlasanSurvey = "perluasan" | "sisip-gardu" | "tambah-jurusan" | "lainnya";
export const LABEL_ALASAN: Record<AlasanSurvey, string> = {
  perluasan: "Perluasan jaringan",
  "sisip-gardu": "Sisip gardu",
  "tambah-jurusan": "Tambah jurusan",
  lainnya: "Lainnya",
};

export interface TitikSurvey {
  id: string;
  urutan: number;
  lat: number;
  lng: number;
  /** Tepat satu terisi: titik survey lain, atau tiang JTM yang ada (titik sambung). */
  induk_titik_id: string | null;
  induk_tiang_id: string | null;
  jenis_tiang: string | null;
  konstruksi: string | null;
  /** Konduktor gawang dari induk ke titik ini. */
  konduktor_jenis: string | null;
  konduktor_ukuran: string | null;
  /** Kode jtm_ref 'penanda' (gardu, FCO, LBS, …); null = tiang biasa. */
  penanda: string | null;
  gardu_kva: number | null;
  gardu_nama: string | null;
  catatan: string | null;
}

/** Tiang JTM yang ada, tempat jaringan baru menyambung. */
export interface TiangSambung {
  id: string;
  kode: string | null;
  penyulang: string | null;
  lat: number;
  lng: number;
}

export interface BarisMaterialSurvey {
  nama: string;
  satuan: string;
  jumlah: number;
}

export interface SurveyJaringan {
  id: string;
  jenis: "JTM" | "JTR";
  ulp: string;
  penyulang: string | null;
  judul: string;
  alasan: AlasanSurvey;
  status: StatusSurvey;
  material: BarisMaterialSurvey[];
  catatan: string | null;
  dibuat_oleh: string | null;
  dibuat_at: string;
  diubah_oleh: string | null;
  diubah_at: string;
  disetujui_oleh: string | null;
  disetujui_at: string | null;
  batal_alasan: string | null;
  jumlah_tiang: number;
  panjang_m: number;
  jumlah_gardu: number;
  gardu_kva: number;
}

export const PESAN_SQL_SURVEY = "Survey Jaringan Baru belum ada di database — jalankan scripts/survey-jaringan.sql di Supabase.";

/** Galat Supabase → pesan untuk orang. */
export const pesanSurvey = (e: unknown) => {
  const x = e as { message?: string; code?: string };
  return x.code === "PGRST205" || x.code === "PGRST202" || /survey_jaringan|survey_titik/.test(x.message ?? "")
    ? PESAN_SQL_SURVEY
    : (x.message ?? "Gagal");
};

export const keSurvey = (x: Record<string, unknown>): SurveyJaringan => ({
  ...(x as unknown as SurveyJaringan),
  jumlah_tiang: Number(x.jumlah_tiang ?? 0),
  panjang_m: Number(x.panjang_m ?? 0),
  jumlah_gardu: Number(x.jumlah_gardu ?? 0),
  gardu_kva: Number(x.gardu_kva ?? 0),
  material: (x.material as BarisMaterialSurvey[] | null) ?? [],
});

export const keTitik = (x: Record<string, unknown>): TitikSurvey => ({
  ...(x as unknown as TitikSurvey),
  lat: Number(x.lat),
  lng: Number(x.lng),
  gardu_kva: x.gardu_kva == null ? null : Number(x.gardu_kva),
});

/** Posisi induk satu titik (titik survey atau tiang sambung). */
export function posisiInduk(t: TitikSurvey, titik: Map<string, TitikSurvey>, sambung: Map<string, TiangSambung>) {
  return t.induk_titik_id ? titik.get(t.induk_titik_id) : t.induk_tiang_id ? sambung.get(t.induk_tiang_id) : undefined;
}

/** Panjang gawang tiap titik ke induknya (m). */
export function panjangGawang(titik: TitikSurvey[], sambung: Map<string, TiangSambung>): Map<string, number> {
  const per = new Map(titik.map((t) => [t.id, t]));
  const hasil = new Map<string, number>();
  for (const t of titik) {
    const i = posisiInduk(t, per, sambung);
    if (i) hasil.set(t.id, jarakMeter(t.lat, t.lng, i.lat, i.lng));
  }
  return hasil;
}

/** Kabel berinti tiga (satu batang untuk tiga fasa) — selebihnya kawat per fasa. */
const KABEL_TIGA_INTI = /NA2XSEYBY|MVTIC/i;
/** Cadangan andongan & sambungan konduktor. */
export const CADANGAN_KONDUKTOR = 1.03;

/**
 * Material dari GAMBAR: panjang konduktor per jenis & ukuran (kawat ×3 fasa,
 * kabel berinti tiga ×1, + cadangan), tiang per jenis, konstruksi per jenis,
 * peralatan per penanda, trafo per kVA. Hanya isian awal — user memeriksanya.
 */
export function materialDariGambar(
  titik: TitikSurvey[],
  sambung: Map<string, TiangSambung>,
  labelPenanda: (kode: string) => string,
): BarisMaterialSurvey[] {
  const panjang = panjangGawang(titik, sambung);
  const hasil = new Map<string, BarisMaterialSurvey>();
  const tambah = (nama: string, satuan: string, n: number) => {
    const ada = hasil.get(nama);
    if (ada) ada.jumlah += n;
    else hasil.set(nama, { nama, satuan, jumlah: n });
  };
  for (const t of titik) {
    const jenis = t.konduktor_jenis ?? "(jenis belum diisi)";
    const p = (panjang.get(t.id) ?? 0) * (KABEL_TIGA_INTI.test(jenis) ? 1 : 3);
    tambah(`Konduktor ${jenis}${t.konduktor_ukuran ? ` ${t.konduktor_ukuran}` : ""}`, "m", p);
  }
  for (const t of titik) tambah(`Tiang ${t.jenis_tiang ?? "(jenis belum diisi)"}`, "btg", 1);
  for (const t of titik) if (t.konstruksi) tambah(`Konstruksi ${t.konstruksi}`, "set", 1);
  for (const t of titik) {
    if (!t.penanda) continue;
    if (t.penanda === "gardu") tambah(`Trafo distribusi${t.gardu_kva ? ` ${t.gardu_kva} kVA` : ""}`, "unit", 1);
    else tambah(labelPenanda(t.penanda), "unit", 1);
  }
  return [...hasil.values()].map((b) => ({
    ...b,
    jumlah: b.satuan === "m" ? Math.ceil(b.jumlah * CADANGAN_KONDUKTOR) : b.jumlah,
  }));
}

/** Urutan simpan: induk selalu sebelum anaknya (dari titik sambung ke ujung). */
export function urutTopologis(titik: TitikSurvey[]): TitikSurvey[] {
  const anak = new Map<string, TitikSurvey[]>();
  for (const t of titik) if (t.induk_titik_id) anak.set(t.induk_titik_id, [...(anak.get(t.induk_titik_id) ?? []), t]);
  const hasil: TitikSurvey[] = [];
  const dilihat = new Set<string>();
  const antre = titik.filter((t) => t.induk_tiang_id);
  while (antre.length) {
    const t = antre.shift()!;
    if (dilihat.has(t.id)) continue;
    dilihat.add(t.id);
    hasil.push(t);
    antre.push(...(anak.get(t.id) ?? []));
  }
  // Yang tidak tersambung tetap ikut (server yang menolaknya dengan pesan jelas).
  return [...hasil, ...titik.filter((t) => !dilihat.has(t.id))].map((t, i) => ({ ...t, urutan: i + 1 }));
}
