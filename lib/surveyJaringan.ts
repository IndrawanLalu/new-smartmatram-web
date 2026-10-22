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

/** Jenis tiang baru (22 Okt 2026: JTM + gardu + JTR dalam satu survey). */
export type JaringanTiang = "JTM" | "JTR";
/** Kabel dari induk ke titik: JTM, JTR, atau keduanya di tiang yang sama (underbuild). */
export type KabelSurvey = "JTM" | "JTR" | "JTM+JTR";
export const LABEL_KABEL: Record<KabelSurvey, string> = { JTM: "JTM", JTR: "JTR", "JTM+JTR": "JTM + JTR (satu tiang)" };
export const bawaJtm = (k: KabelSurvey) => k !== "JTR";
export const bawaJtr = (k: KabelSurvey) => k !== "JTM";

export type JenisGardu = "portal" | "cantol";
export const LABEL_JENIS_GARDU: Record<JenisGardu, string> = { portal: "Portal (dua tiang)", cantol: "Cantol (satu tiang)" };

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
  /** Gardu baru: portal / cantol (null = belum dipilih / bukan gardu). */
  gardu_jenis: JenisGardu | null;
  /** Arah gambar gardu (derajat searah jarum jam; 0 = trafo di bawah tiang). */
  gardu_arah: number;
  catatan: string | null;
  jaringan: JaringanTiang;
  kabel: KabelSurvey;
  /** Kabel JTR gawang ini (konduktor_* = JTM). */
  jtr_kabel_jenis: string | null;
  jtr_kabel_ukuran: string | null;
  /** Jurusan JTR (A, B, C …) kabel JTR yang masuk ke titik ini. */
  jurusan: string | null;
}

/** Simbol yang ditempel di foto; x/y 0–1 dari kiri-atas foto = KAKI tiang di tanah. */
export type JenisTanda = "gardu" | "tiang_jtm" | "tiang_jtr" | "teks";
export interface TandaFoto {
  jenis: JenisTanda;
  x: number;
  y: number;
  /** Gardu: portal (dua tiang) / cantol (satu tiang). */
  gardu?: JenisGardu;
  /** Besar gambar (1 = bawaan) — disesuaikan dengan jarak di foto. */
  skala?: number;
  /** Tulisan di samping simbol (atau isi tanda teks). */
  teks?: string;
}
export interface FotoSurvey {
  url: string;
  /** Keterangan, mis. "Lokasi gardu". */
  ket: string;
  tanda: TandaFoto[];
}
/** Pilihan cepat keterangan foto — tetap boleh diketik bebas. */
export const SARAN_KET_FOTO = ["Lokasi gardu", "Lokasi pengambilan", "Titik sambung", "Jalur JTM", "Jalur JTR"];

/** Data lama = URL polos. */
const keFoto = (x: unknown): FotoSurvey =>
  typeof x === "string"
    ? { url: x, ket: "", tanda: [] }
    : { url: String((x as FotoSurvey).url), ket: (x as FotoSurvey).ket ?? "", tanda: (x as FotoSurvey).tanda ?? [] };

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
  /** Nama di blok judul gambar survey (akun SMART bernama unit, bukan orang). */
  digambar_nama: string | null;
  diperiksa_nama: string | null;
  disetujui_nama: string | null;
  /** Foto kondisi lapangan (bucket inspections, survey/<id>/…) + keterangan & tanda. */
  foto: FotoSurvey[];
  jumlah_tiang: number;
  panjang_m: number;
  jumlah_gardu: number;
  gardu_kva: number;
  jumlah_tiang_jtm: number;
  jumlah_tiang_jtr: number;
  panjang_jtm_m: number;
  panjang_jtr_m: number;
}

export const PESAN_SQL_SURVEY = "Survey Jaringan Baru belum ada di database — jalankan scripts/survey-jaringan.sql di Supabase.";
const PESAN_SQL_SURVEY_2 = "Tambahan Survey Jaringan Baru belum ada di database — jalankan scripts/survey-jaringan-2.sql di Supabase.";

/** Galat Supabase → pesan untuk orang. */
export const pesanSurvey = (e: unknown) => {
  const x = e as { message?: string; code?: string };
  if (/ubah_pengesah_survey|gardu_jenis|diperiksa_nama/.test(x.message ?? "")) return PESAN_SQL_SURVEY_2;
  if (/ubah_foto_survey/.test(x.message ?? "")) return "Foto survey belum ada di database — jalankan scripts/survey-jaringan-4.sql di Supabase.";  return x.code === "PGRST205" || x.code === "PGRST202" || /survey_jaringan|survey_titik/.test(x.message ?? "")
    ? PESAN_SQL_SURVEY
    : (x.message ?? "Gagal");
};

export const keSurvey = (x: Record<string, unknown>): SurveyJaringan => ({
  ...(x as unknown as SurveyJaringan),
  jumlah_tiang: Number(x.jumlah_tiang ?? 0),
  panjang_m: Number(x.panjang_m ?? 0),
  jumlah_gardu: Number(x.jumlah_gardu ?? 0),
  gardu_kva: Number(x.gardu_kva ?? 0),
  // Sebelum survey-jaringan-5.sql kolom JTM/JTR belum ada: semuanya JTM.
  jumlah_tiang_jtm: Number(x.jumlah_tiang_jtm ?? x.jumlah_tiang ?? 0),
  jumlah_tiang_jtr: Number(x.jumlah_tiang_jtr ?? 0),
  panjang_jtm_m: Number(x.panjang_jtm_m ?? x.panjang_m ?? 0),
  panjang_jtr_m: Number(x.panjang_jtr_m ?? 0),
  material: (x.material as BarisMaterialSurvey[] | null) ?? [],
  foto: ((x.foto as unknown[] | null | undefined) ?? []).map(keFoto),
});

export const keTitik = (x: Record<string, unknown>): TitikSurvey => ({
  ...(x as unknown as TitikSurvey),
  lat: Number(x.lat),
  lng: Number(x.lng),
  gardu_kva: x.gardu_kva == null ? null : Number(x.gardu_kva),
  gardu_jenis: (x.gardu_jenis as JenisGardu | null | undefined) ?? null,
  gardu_arah: Number(x.gardu_arah ?? 0),
  jaringan: (x.jaringan as JaringanTiang | undefined) ?? "JTM",
  kabel: (x.kabel as KabelSurvey | undefined) ?? "JTM",
  jtr_kabel_jenis: (x.jtr_kabel_jenis as string | null | undefined) ?? null,
  jtr_kabel_ukuran: (x.jtr_kabel_ukuran as string | null | undefined) ?? null,
  jurusan: (x.jurusan as string | null | undefined) ?? null,
});

/** Gardu portal berdiri di dua tiang, tapi digambar sebagai satu titik. */
export const portal = (t: TitikSurvey) => t.penanda === "gardu" && t.gardu_jenis === "portal";

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
/** JTR: kabel pilin (LVTC/Twisted) satu batang; telanjang = 3 fasa + netral. */
const KABEL_JTR_PILIN = /LVTC|TWIST/i;
/** Cadangan andongan & sambungan konduktor. */
export const CADANGAN_KONDUKTOR = 1.03;

/**
 * Material dari GAMBAR: panjang konduktor JTM per jenis & ukuran (kawat ×3 fasa,
 * kabel berinti tiga ×1) dan kabel JTR (pilin ×1, telanjang ×4), + cadangan;
 * tiang JTM & JTR per jenis (gardu portal +1 tiang),
 * konstruksi per jenis, peralatan per penanda, trafo per kVA + konstruksi
 * gardu portal/cantol. Hanya isian awal — user memeriksanya.
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
    const m = panjang.get(t.id) ?? 0;
    if (bawaJtm(t.kabel)) {
      const jenis = t.konduktor_jenis ?? "(jenis belum diisi)";
      tambah(`Konduktor JTM ${jenis}${t.konduktor_ukuran ? ` ${t.konduktor_ukuran}` : ""}`, "m", m * (KABEL_TIGA_INTI.test(jenis) ? 1 : 3));
    }
    if (bawaJtr(t.kabel)) {
      const jenis = t.jtr_kabel_jenis ?? "(jenis belum diisi)";
      tambah(`Kabel JTR ${jenis}${t.jtr_kabel_ukuran ? ` ${t.jtr_kabel_ukuran}` : ""}`, "m", m * (KABEL_JTR_PILIN.test(jenis) ? 1 : 4));
    }
  }
  for (const t of titik) tambah(`Tiang ${t.jaringan} ${t.jenis_tiang ?? "(jenis belum diisi)"}`, "btg", 1);
  for (const t of titik) if (t.konstruksi) tambah(`Konstruksi ${t.konstruksi}`, "set", 1);
  for (const t of titik) {
    if (!t.penanda) continue;
    if (t.penanda !== "gardu") {
      tambah(labelPenanda(t.penanda), "unit", 1);
      continue;
    }
    tambah(`Trafo distribusi${t.gardu_kva ? ` ${t.gardu_kva} kVA` : ""}`, "unit", 1);
    tambah(`Konstruksi gardu ${t.gardu_jenis ?? "(portal/cantol belum dipilih)"}`, "set", 1);
    // Gardu portal berdiri di dua tiang: tiang keduanya tidak digambar sebagai titik.
    if (portal(t)) tambah(`Tiang JTM ${t.jenis_tiang ?? "(jenis belum diisi)"}`, "btg", 1);
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

/**
 * Jurusan bawaan kabel JTR baru dari `induk`: dari gardu = huruf berikutnya
 * yang belum dipakai kabel JTR gardu itu; dari kabel JTR = jurusan induknya.
 */
export function jurusanBawaan(induk: TitikSurvey, titik: TitikSurvey[]): string {
  if (induk.penanda !== "gardu" && bawaJtr(induk.kabel) && induk.jurusan) return induk.jurusan;
  const dipakai = new Set(
    titik.filter((t) => t.induk_titik_id === induk.id && bawaJtr(t.kabel) && t.jurusan).map((t) => t.jurusan!.toUpperCase()),
  );
  return [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].find((h) => !dipakai.has(h)) ?? "A";
}

/** Boleh menarik kabel JTR dari titik ini? (gardu baru, atau sudah dilewati JTR) */
export const sumberJtr = (t: TitikSurvey | undefined) => !!t && (t.penanda === "gardu" || (bawaJtr(t.kabel) && !!t.jurusan));
