/**
 * Aturan pencocokan saringan kondisi HARGARDU — murni, tanpa React dan tanpa
 * Supabase.
 *
 * Dipisahkan dari hook-nya supaya bisa diuji langsung terhadap data sungguhan:
 * inilah bagian yang menentukan sebuah gardu ikut terdaftar atau tidak, dan
 * kesalahan di sini tidak melempar galat apa pun — angkanya cuma sedikit
 * berbeda, dan tidak ada yang tahu berapa yang seharusnya.
 */

/** Satu jawaban pemeriksaan pada satu gardu. */
export interface NilaiKondisi {
  bagian: string;
  nilai: string | null;
  label: string | null;
  normal: boolean;
}

/**
 * Saringan kondisi: kode item → nilai yang dipilih.
 *
 * Di dalam satu item nilainya di-OR (tekep "Tidak Ada" ATAU "Rusak"), antar item
 * di-AND (tekep bermasalah DAN trafo rembes). Itu perilaku yang orang harapkan
 * dari daftar centang, dan kebalikannya membuat saringan kedua selalu
 * memperbesar hasil — bukan mempersempit.
 */
export type SaringanKondisi = Record<string, string[]>;

/** Nilai semu: apa pun yang dinilai tidak normal pada item ini. */
export const NILAI_TIDAK_NORMAL = "__tidak_normal";
/** Nilai semu: item ini belum pernah diperiksa di gardu tersebut. */
export const NILAI_BELUM = "__belum";

/** Kunci gardu yang tahan beda huruf besar-kecil antara master dan catatan
 *  pemeliharaan. Kode gardu tidak unik lintas ULP, jadi ULP-nya ikut. */
export const kunciKondisi = (kode: string, ulp: string) =>
  `${kode.toUpperCase()}|${ulp.toUpperCase()}`;

export const adaSaringanKondisi = (s: SaringanKondisi) =>
  Object.values(s).some((v) => v.length > 0);

/** Jawaban satu gardu, dikelompokkan per item. `undefined` untuk item yang
 *  datanya belum sampai — dibedakan dari item yang datanya ada tapi kosong. */
export type AmbilNilai = (itemKode: string) => Map<string, NilaiKondisi[]> | undefined;

/**
 * Apakah jawaban satu gardu untuk SATU item cocok dengan nilai yang dipilih.
 *
 * `daftar === undefined` berarti item itu belum pernah diperiksa di gardu
 * tersebut — cocok hanya kalau yang dicari memang "belum diperiksa".
 */
export function cocokItem(
  daftar: NilaiKondisi[] | undefined,
  nilaiDipilih: string[],
): boolean {
  if (!daftar || daftar.length === 0) return nilaiDipilih.includes(NILAI_BELUM);

  const kodeNyata = new Set(nilaiDipilih.filter((v) => !v.startsWith("__")));
  const perluTidakNormal = nilaiDipilih.includes(NILAI_TIDAK_NORMAL);

  // Item per fasa/jurusan punya beberapa jawaban sekaligus. Satu bagian yang
  // cocok sudah cukup: cut out fasa S yang pecah tetap membuat gardu itu perlu
  // dikerjakan, dan jurusan C yang masih konektor tetap perlu didata — meski
  // bagian lainnya baik.
  return daftar.some(
    (d) => (d.nilai !== null && kodeNyata.has(d.nilai)) || (perluTidakNormal && !d.normal),
  );
}

/**
 * Apakah satu gardu lolos seluruh saringan kondisi.
 *
 * Sengaja sebuah penilai, bukan daftar kunci yang cocok. "Belum diperiksa"
 * adalah KETIADAAN baris di `gardu_kondisi_terakhir` — gardu yang belum pernah
 * dipelihara tidak punya baris apa pun di sana, jadi ia mustahil muncul di
 * daftar kunci yang dibangun dari view itu. Padahal justru merekalah jawaban
 * yang dicari.
 */
export function lolosKondisi(
  saringan: SaringanKondisi,
  ambil: AmbilNilai,
  kunci: string,
): boolean {
  for (const [itemKode, nilaiDipilih] of Object.entries(saringan)) {
    if (nilaiDipilih.length === 0) continue;

    const peta = ambil(itemKode);
    // Datanya belum sampai. Tidak meloloskan apa pun — menampilkan seluruh
    // gardu selagi menunggu akan terbaca sebagai "saringannya tidak
    // berpengaruh", dan orang telanjur menutup halaman sebelum angkanya benar.
    if (!peta) return false;

    if (!cocokItem(peta.get(kunci), nilaiDipilih)) return false;
  }
  return true;
}

// ── Penyusun peta dari baris mentah ───────────────────────────────────────────

export interface BarisKondisi {
  gardu_kode: string;
  ulp: string;
  bagian: string;
  nilai: string | null;
  nilai_label: string | null;
  normal: boolean;
}

export interface BarisHar {
  gardu_kode: string;
  ulp: string;
  status: string;
  tgl_selesai: string | null;
}

/**
 * Keadaan pemeliharaan satu gardu.
 *
 * `menunggu` dipisahkan dari `pernah` dengan sengaja. Angka resmi hanya boleh
 * digerakkan pemeliharaan yang sudah diverifikasi — tapi gardu yang pekerjaannya
 * sedang menunggu persetujuan tidak boleh terbaca sama dengan gardu yang belum
 * pernah disentuh siapa pun. Tanpa pembedaan itu, saringan "belum pernah
 * dipelihara" akan menyuruh regu berangkat lagi ke gardu yang baru kemarin
 * mereka kerjakan.
 */
export interface KeadaanHar {
  /** Tanggal pemeliharaan TERVERIFIKASI terakhir. */
  tgl: string | null;
  /** Punya setidaknya satu pemeliharaan terverifikasi. */
  pernah: boolean;
  /** Ada pekerjaan terkirim yang belum diputuskan admin. */
  menunggu: boolean;
}

/** Jawaban satu item, dikelompokkan per gardu. */
export function bangunNilaiItem(rows: BarisKondisi[]): Map<string, NilaiKondisi[]> {
  const peta = new Map<string, NilaiKondisi[]>();
  for (const r of rows) {
    const k = kunciKondisi(r.gardu_kode, r.ulp);
    const daftar = peta.get(k) ?? [];
    daftar.push({ bagian: r.bagian, nilai: r.nilai, label: r.nilai_label, normal: r.normal });
    peta.set(k, daftar);
  }
  return peta;
}

/** Keadaan pemeliharaan per gardu dari seluruh barisnya, apa pun statusnya. */
export function bangunKeadaanHar(rows: BarisHar[]): Map<string, KeadaanHar> {
  const peta = new Map<string, KeadaanHar>();
  for (const r of rows) {
    const k = kunciKondisi(r.gardu_kode, r.ulp);
    const a = peta.get(k) ?? { tgl: null, pernah: false, menunggu: false };
    if (r.status === "Diverifikasi") {
      a.pernah = true;
      if ((r.tgl_selesai ?? "") > (a.tgl ?? "")) a.tgl = r.tgl_selesai;
    } else if (r.status === "Selesai") {
      a.menunggu = true;
    }
    peta.set(k, a);
  }
  return peta;
}

/** Saringan "sudah / belum pernah dipelihara". Yang dihitung hanya pemeliharaan
 *  TERVERIFIKASI — sama dengan dasar seluruh angka HARGARDU lainnya. */
export function lolosStatusHar(keadaan: KeadaanHar | undefined, status: "" | "belum" | "sudah") {
  const pernah = keadaan?.pernah ?? false;
  if (status === "belum") return !pernah;
  if (status === "sudah") return pernah;
  return true;
}
