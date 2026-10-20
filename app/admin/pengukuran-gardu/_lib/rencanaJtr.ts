/**
 * Rencana perbaikan JTR (Analisis JTR F3, 20 Okt 2026).
 *
 * Satu jurusan → satu rencana, diurutkan dari tindakan TERMURAH:
 *   1. Pemerataan beban  — fasa terbesar lewat batas, rata-rata fasa tidak
 *   2. Tambah jurusan    — pecah di tiang X (percabangan dulu; kalau tidak ada
 *                          yang layak, tiang mana pun), kabel baru ≤ batas;
 *                          atau tanpa potong kabel: SR sepanjang jalur sampai
 *                          X dipindah ke kabel baru (21 Okt, cara "pindah-sr")
 *   3. Sisip gardu       — tambah jurusan tidak bisa (trafo > batas, slot
 *                          penuh, titik pecah terlalu jauh / tidak ada)
 *   4. Ganti kabel       — jurusan aman, tapi potongan kabel kecil kelebihan
 *   5. Naik daya / mutasi trafo — trafo > batas, jurusannya baik
 *   6. Ukur tegangan ujung dulu — hanya PANJANG yang lewat batas
 *
 * PERKIRAAN. Arus jurusan disebar ke tiap tiang menurut tarikan SR (satu-
 * satunya ukuran beban per tiang yang ada; user sendiri ragu akurasinya).
 * "Jatuh tegangan" dibandingkan lewat MOMEN BEBAN = Σ arus hilir × panjang
 * gawang — sebanding dengan volt jatuh untuk kabel sejenis, cukup untuk
 * memilih titik pecah tanpa model volt (F2).
 */

import type { JurusanJtr, PengaturanJtr } from "../_hooks/useAnalisisJtr";

/** Alamat peta yang menggambar rencana satu jurusan (useRencanaPeta); `opsi` = kunci OpsiPecah terpilih. */
export const alamatPetaRencana = (gardu: string, jurusan: string, opsi?: string) =>
  `/peta?rencana=${encodeURIComponent(gardu)}&jurusan=${encodeURIComponent(jurusan)}${opsi ? `&opsi=${encodeURIComponent(opsi)}` : ""}`;

export interface GawangJtr {
  gardu_kode: string;
  jurusan: string;
  tiang_id: string;
  kode: string | null;
  hulu_id: string | null;
  panjang_m: number;
  ukuran: string | null;
  jenis: string | null;
  tarikan_sr: number;
  percabangan: boolean;
}

export type JenisRencana =
  | "pemerataan" | "tambah-jurusan" | "sisip" | "ganti-kabel" | "naik-daya" | "ukur-ujung" | "inspeksi-jtr";

export const LABEL_RENCANA: Record<JenisRencana, string> = {
  pemerataan: "Pemerataan beban",
  "tambah-jurusan": "Tambah jurusan",
  sisip: "Sisip gardu",
  "ganti-kabel": "Ganti kabel",
  "naik-daya": "Naik daya / mutasi trafo",
  "ukur-ujung": "Ukur tegangan ujung dulu",
  "inspeksi-jtr": "Inspeksi JTR dulu",
};

export type PeranTitik = "pecah" | "sisip" | "alternatif" | "kabel";

export interface Rencana {
  jenis: JenisRencana;
  /** Satu baris untuk kolom tabel. */
  ringkas: string;
  /** Mengapa tindakan ini (dan bukan yang lebih murah). */
  alasan: string[];
  /** Angka sebelum → sesudah, lokasi. */
  rinci: string[];
  pilihanLain: string[];
  /** Peringatan slot jurusan — selalu dipastikan di lapangan. */
  catatan: string[];
  /** Tiang yang ditandai di peta. */
  titik?: { tiang_id: string; kode: string | null; peran: PeranTitik }[];
  /** Tiang yang pindah ke jurusan baru / gardu sisip — disorot di peta. */
  pindah?: string[];
  /** Pilihan titik pecah untuk dibandingkan; [0] = usulan sistem. */
  pilihan?: OpsiPecah[];
  /** Ganti kabel: panjang & jumlah gawang yang diganti — dasar material. */
  besaran?: { kabel_m: number; tiang: number };
}

interface Simpul extends GawangJtr {
  anak: Simpul[];
  /** Jarak lewat kabel dari gardu sampai tiang ini (m). */
  d: number;
  /** Tarikan SR tiang ini + semua hilirnya. */
  srHilir: number;
  /** Tiang terjauh di hilirnya (m dari gardu). */
  jauh: number;
}

interface Pohon {
  simpul: Simpul[];
  akar: Simpul[];
  sr: number;
}

const m = (v: number) => `${Math.round(v).toLocaleString("id-ID")} m`;
const a = (v: number) => `${Math.round(v)} A`;

/** Gawang satu jurusan → pohon dari gardu. */
export function susunPohon(gawang: GawangJtr[]): Pohon {
  const peta = new Map<string, Simpul>();
  for (const g of gawang) peta.set(g.tiang_id, { ...g, anak: [], d: 0, srHilir: 0, jauh: 0 });
  const akar: Simpul[] = [];
  for (const s of peta.values()) {
    const hulu = s.hulu_id ? peta.get(s.hulu_id) : undefined;
    if (hulu && hulu !== s) hulu.anak.push(s);
    else akar.push(s);
  }
  // Iteratif, bukan rekursif: rantai ratusan tiang + data berputar tidak boleh
  // meledakkan tumpukan panggilan.
  const urut: Simpul[] = [];
  const dilihat = new Set<string>();
  const tumpuk = akar.map((s) => ({ s, d: 0 }));
  while (tumpuk.length) {
    const { s, d } = tumpuk.pop()!;
    if (dilihat.has(s.tiang_id)) continue;
    dilihat.add(s.tiang_id);
    s.d = d + s.panjang_m;
    urut.push(s);
    for (const c of s.anak) tumpuk.push({ s: c, d: s.d });
  }
  for (let i = urut.length - 1; i >= 0; i--) {
    const s = urut[i];
    s.srHilir = s.tarikan_sr + s.anak.reduce((t, c) => t + (dilihat.has(c.tiang_id) ? c.srHilir : 0), 0);
    s.jauh = Math.max(s.d, ...s.anak.map((c) => c.jauh));
  }
  return { simpul: urut, akar, sr: akar.reduce((t, s) => t + s.srHilir, 0) };
}

const hilirDari = (c: Simpul): Set<Simpul> => {
  const hasil = new Set<Simpul>();
  const t = [c];
  while (t.length) {
    const s = t.pop()!;
    if (hasil.has(s)) continue;
    hasil.add(s);
    t.push(...s.anak);
  }
  return hasil;
};

const hulunya = (simpul: Simpul[]) => {
  const p = new Map<Simpul, Simpul>();
  for (const s of simpul) for (const c of s.anak) p.set(c, s);
  return p;
};

/** Momen beban (A·m): Σ arus hilir × panjang gawang. */
function momen(simpul: Simpul[], perSr: number, kurangi?: { c: Simpul; leluhur: Set<Simpul> }) {
  let t = 0;
  for (const s of simpul) {
    const sr = s.srHilir - (kurangi && kurangi.leluhur.has(s) ? kurangi.c.srHilir : 0);
    t += sr * perSr * s.panjang_m;
  }
  return t;
}

export type NadaOpsi = "aman" | "mendekati" | "lewat";

/**
 * potong    — kabel lama DIPOTONG di titik pecah, satu cabang hilirnya
 *             disambung ke kabel baru.
 * pindah-sr — kabel lama TIDAK dipotong; kabel baru ditarik sejajar sampai
 *             tiang X dan SR di tiang-tiang sepanjang jalur itu dipindah ke
 *             kabel baru (JTR pendek, tarikan SR menumpuk di pangkal).
 */
export type CaraPecah = "potong" | "pindah-sr";

/**
 * Satu cara memecah jurusan: kabel baru dari gardu menyusuri jalur sampai
 * TITIK PECAH, lalu satu CABANG hilirnya dilepas dari kabel lama dan
 * disambung ke kabel baru (potong), atau SR sepanjang jalur itu yang
 * dipindah ke kabel baru (pindah-sr).
 */
export interface OpsiPecah {
  /** Usulan sebelum 21 Okt tidak punya — artinya "potong". */
  cara?: CaraPecah;
  /** id tiang cabang (+ "|rata" pemerataan, "|sr" pindah SR) — unik per opsi. */
  kunci: string;
  titikId: string;
  titikKode: string | null;
  percabangan: boolean;
  cabangId: string;
  cabangKode: string | null;
  kabelBaru: number;
  iBaru: number;
  iLama: number;
  srPindah: number;
  /** Tarikan SR seluruh jurusan sebelum dipecah (usulan lama: tidak ada). */
  srTotal?: number;
  /** potong: tiang yang pindah jurusan; pindah-sr: tiang yang SR-nya dipindah. */
  tiangPindah: number;
  /** Tiang yang dilalui kabel baru dari gardu sampai titik pecah. */
  tiangLintas: number;
  /** Lintasan terjauh (m dari gardu) jurusan baru / lama sesudah dipecah. */
  jauhBaru: number;
  jauhLama: number;
  /** Perkiraan jatuh tegangan terburuk turun (%), lewat momen beban. */
  turunPct: number;
  /** Arus dihitung dari rata-rata fasa — sah hanya bila fasa diratakan juga. */
  pemerataan: boolean;
  nada: NadaOpsi;
  /** Mengapa lewat / mendekati batas. */
  peringatan: string[];
  label: string[];
  /** Tiang yang pindah (potong) / yang SR-nya dipindah (pindah-sr) — disorot di peta. */
  pindah: string[];
  momenMaks: number;
}

interface KonteksPecah {
  pohon: Pohon;
  hulu: Map<Simpul, Simpul>;
  arus: number;
  rata: number;
  batasI: number;
  batasKabel: number;
}

const BATAS_MENDEKATI = 0.8;

/** Peringatan & nada satu pilihan — sama untuk kedua cara. */
function nilai(k: KonteksPecah, iBaru: number, iLama: number, kabelBaru: number) {
  const peringatan: string[] = [];
  if (iBaru > k.batasI) peringatan.push(`Jurusan baru ${a(iBaru)} > batas ${a(k.batasI)}.`);
  if (iLama > k.batasI) peringatan.push(`Jurusan lama ${a(iLama)} > batas ${a(k.batasI)}.`);
  if (kabelBaru > k.batasKabel) peringatan.push(`Kabel baru ${m(kabelBaru)} > batas ${m(k.batasKabel)}.`);
  const lewat = peringatan.length > 0;
  const dekat = !lewat && Math.max(iBaru, iLama) >= k.batasI * BATAS_MENDEKATI;
  if (dekat) peringatan.push(`Sisi terberat ${a(Math.max(iBaru, iLama))} sudah ≥ ${BATAS_MENDEKATI * 100}% batas.`);
  const nada: NadaOpsi = lewat ? "lewat" : dekat ? "mendekati" : "aman";
  return { peringatan, nada };
}

function hitungOpsi(k: KonteksPecah, c: Simpul, pemerataan: boolean): OpsiPecah | null {
  const titik = k.hulu.get(c);
  const { pohon: p } = k;
  if (!titik || c.srHilir === 0 || c.srHilir === p.sr) return null;
  const arus = pemerataan ? k.rata : k.arus;
  const perSr = arus / p.sr;
  const kabelBaru = titik.d; // gardu → titik pecah, menyusuri jalur
  const iBaru = c.srHilir * perSr;
  const iLama = arus - iBaru;
  const hilir = hilirDari(c);
  const leluhur = new Set<Simpul>();
  for (let x: Simpul | undefined = titik; x; x = k.hulu.get(x)) leluhur.add(x);
  const lama = p.simpul.filter((s) => !hilir.has(s));
  const mBaru = momen([...hilir], perSr) + iBaru * kabelBaru;
  const mLama = momen(lama, perSr, { c, leluhur });
  const momenMaks = Math.max(mBaru, mLama);

  return {
    cara: "potong",
    kunci: pemerataan ? `${c.tiang_id}|rata` : c.tiang_id,
    titikId: titik.tiang_id,
    titikKode: titik.kode,
    percabangan: titik.percabangan || titik.anak.length > 1,
    cabangId: c.tiang_id,
    cabangKode: c.kode,
    kabelBaru,
    iBaru,
    iLama,
    srPindah: c.srHilir,
    srTotal: p.sr,
    tiangPindah: hilir.size,
    tiangLintas: leluhur.size,
    jauhBaru: c.jauh,
    jauhLama: Math.max(0, ...lama.map((s) => s.d)),
    turunPct: Math.round((1 - momenMaks / momen(p.simpul, perSr)) * 100),
    pemerataan,
    ...nilai(k, iBaru, iLama, kabelBaru),
    label: [],
    pindah: [...hilir].map((x) => x.tiang_id),
    momenMaks,
  };
}

/**
 * Pindah SR ke kabel baru yang ditarik sampai tiang X: SR di setiap tiang
 * gardu → X pindah, kabel lama utuh dan tetap melayani sisanya. Arus kabel
 * baru di tiap gawang = SR yang dipindah dari tiang itu sampai X.
 */
function hitungPindahSr(k: KonteksPecah, x: Simpul): OpsiPecah | null {
  const { pohon: p } = k;
  const jalur: Simpul[] = [];
  for (let s: Simpul | undefined = x; s && !jalur.includes(s); s = k.hulu.get(s)) jalur.push(s);
  // SR yang dipindah dari tiang itu sampai X (dijumlah dari X ke arah gardu).
  const kum = new Map<Simpul, number>();
  let n = 0;
  for (const s of jalur) {
    n += s.tarikan_sr;
    kum.set(s, n);
  }
  if (n === 0 || n === p.sr) return null;
  const perSr = k.arus / p.sr;
  const iBaru = n * perSr;
  const iLama = k.arus - iBaru;
  const mBaru = jalur.reduce((t, s) => t + kum.get(s)! * perSr * s.panjang_m, 0);
  const mLama = p.simpul.reduce((t, s) => t + (s.srHilir - (kum.get(s) ?? 0)) * perSr * s.panjang_m, 0);
  const momenMaks = Math.max(mBaru, mLama);
  const pindah = jalur.filter((s) => s.tarikan_sr > 0);
  return {
    cara: "pindah-sr",
    kunci: `${x.tiang_id}|sr`,
    titikId: x.tiang_id,
    titikKode: x.kode,
    percabangan: false,
    cabangId: "",
    cabangKode: null,
    kabelBaru: x.d,
    iBaru,
    iLama,
    srPindah: n,
    srTotal: p.sr,
    tiangPindah: pindah.length,
    tiangLintas: jalur.length,
    jauhBaru: x.d,
    jauhLama: Math.max(0, ...p.simpul.map((s) => s.d)),
    turunPct: Math.round((1 - momenMaks / momen(p.simpul, perSr)) * 100),
    pemerataan: false,
    ...nilai(k, iBaru, iLama, x.d),
    label: [],
    pindah: pindah.map((s) => s.tiang_id),
    momenMaks,
  };
}

function konteksPecah(r: JurusanJtr, gawang: GawangJtr[] | undefined, s: PengaturanJtr): KonteksPecah | null {
  const arus = r.arus_maks ?? 0;
  if (!gawang?.length || arus <= 0) return null;
  const pohon = susunPohon(gawang);
  if (pohon.sr <= 0) return null;
  const batasKha = r.kha_a ? (r.kha_a * s.batas_kha_pct) / 100 : Infinity;
  return {
    pohon,
    hulu: hulunya(pohon.simpul),
    arus,
    rata: ((r.a_r ?? 0) + (r.a_s ?? 0) + (r.a_t ?? 0)) / 3,
    batasI: Math.min(s.batas_arus_jurusan_a, batasKha),
    batasKabel: s.batas_kabel_baru_m,
  };
}

const terkecil = <T,>(xs: T[], f: (x: T) => number) => xs.reduce<T | undefined>((b, x) => (b === undefined || f(x) < f(b) ? x : b), undefined);

/**
 * Pilihan titik pecah yang dibandingkan user. Yang pertama = usulan sistem
 * (percabangan dulu, lalu jatuh tegangan terkecil — aturan F3 yang disepakati).
 */
function susunPilihan(k: KonteksPecah): OpsiPecah[] {
  const semua = k.pohon.simpul.flatMap((c) => hitungOpsi(k, c, false) ?? []);
  const layak = semua.filter((o) => o.nada !== "lewat");
  const hasil = new Map<string, OpsiPecah>();
  const tambah = (o: OpsiPecah | undefined, label: string) => {
    if (!o) return;
    const ada = hasil.get(o.kunci) ?? o;
    ada.label.push(label);
    hasil.set(o.kunci, ada);
  };
  const cabang = layak.filter((o) => o.percabangan);
  tambah(terkecil(cabang.length ? cabang : layak, (o) => o.momenMaks), "Usulan sistem");
  tambah(terkecil(layak, (o) => o.kabelBaru), "Kabel terpendek");
  tambah(terkecil(layak, (o) => Math.abs(o.iBaru - o.iLama)), "Paling seimbang");
  tambah(terkecil(layak, (o) => o.momenMaks), "Tegangan terbaik");

  // Tanpa potong kabel: SR sepanjang jalur dipindah ke kabel baru. Tanpa
  // pilihan potong yang layak, inilah usulan sistemnya.
  const sr = k.pohon.simpul.flatMap((x) => hitungPindahSr(k, x) ?? []).filter((o) => o.nada !== "lewat");
  const terbaikSr = terkecil(sr, (o) => Math.abs(o.iBaru - o.iLama));
  if (terbaikSr && !hasil.size) terbaikSr.label.push("Usulan sistem");
  tambah(terbaikSr, "Pindah SR ke kabel baru");

  // Pecah lebih dekat gardu bila fasanya sekalian diratakan.
  if (k.rata < k.arus) {
    const pendek = terkecil(layak, (o) => o.kabelBaru)?.kabelBaru ?? Infinity;
    const rata = k.pohon.simpul
      .flatMap((c) => hitungOpsi(k, c, true) ?? [])
      .filter((o) => o.nada !== "lewat" && o.kabelBaru < pendek);
    const o = terkecil(rata, (x) => x.kabelBaru);
    // Tanpa pilihan biasa, varian inilah usulan sistemnya.
    if (o && !hasil.size) o.label.push("Usulan sistem");
    tambah(o, "Dekat gardu + pemerataan");
  }
  return [...hasil.values()];
}

/** Opsi pecah di tiang pilihan user — satu per cabang hilirnya. */
export function opsiDiTiang(
  r: JurusanJtr,
  gawang: GawangJtr[] | undefined,
  s: PengaturanJtr,
  tiangId: string,
): OpsiPecah[] {
  const k = konteksPecah(r, gawang, s);
  const t = k?.pohon.simpul.find((x) => x.tiang_id === tiangId);
  if (!k || !t) return [];
  const sendiri = (o: OpsiPecah | null) => (o ? [{ ...o, kunci: `${o.kunci}|sendiri`, label: ["Pilihan sendiri"] }] : []);
  return [...t.anak.flatMap((c) => sendiri(hitungOpsi(k, c, false))), ...sendiri(hitungPindahSr(k, t))];
}

/** Tiang tempat "pilihan sendiri" dihitung ulang, dibaca dari kuncinya. */
export const tiangKunciSendiri = (kunci: string, gawang: GawangJtr[]) => {
  const [id, cara] = kunci.split("|");
  return cara === "sr" ? id : gawang.find((x) => x.tiang_id === id)?.hulu_id;
};

export const pindahSr = (o: OpsiPecah) => o.cara === "pindah-sr";

/** "B3 → cabang B3_B1" / "sampai B3, SR 4 tiang dipindah" */
export const namaOpsi = (o: OpsiPecah) =>
  pindahSr(o)
    ? `sampai ${o.titikKode ?? "tiang"}, SR ${o.tiangPindah} tiang dipindah`
    : `${o.titikKode ?? "tiang"} → cabang ${o.cabangKode ?? "tiang"}`;

/** Satu baris ringkas tambah jurusan — kolom tabel & judul usulan/WO. */
export const ringkasOpsi = (o: OpsiPecah) =>
  pindahSr(o)
    ? `Tambah jurusan, pindah SR ke kabel baru sampai ${o.titikKode} (${m(o.kabelBaru)})`
    : `Tambah jurusan, pecah di ${o.titikKode} (${m(o.kabelBaru)})${o.pemerataan ? " + pemerataan" : ""}`;

/** Rincian tambah jurusan untuk satu pilihan titik pecah. */
export const rinciOpsi = (o: OpsiPecah, srTotal: number) => pindahSr(o) ? [
  `Kabel baru dari gardu ±${m(o.kabelBaru)} menyusuri jalur sampai tiang ${o.titikKode} (${o.tiangLintas} tiang); kabel lama TIDAK dipotong.`,
  `SR di ${o.tiangPindah} tiang sepanjang jalur itu (${o.srPindah} dari ${srTotal} tarikan) dipindah ke kabel baru → kabel baru ±${a(o.iBaru)}, kabel lama ±${a(o.iLama)}.`,
  `Perkiraan jatuh tegangan terburuk turun ±${o.turunPct}%.`,
] : [
  `Pecah di tiang ${o.titikKode}${o.percabangan ? " (percabangan)" : ""}: cabang ${o.cabangKode} dilepas dan disambung ke jurusan baru.`,
  `Kabel baru dari gardu ±${m(o.kabelBaru)} (menyusuri jalur yang ada, ${o.tiangLintas} tiang).`,
  `Pindah ${o.srPindah} dari ${srTotal} tarikan SR → jurusan baru ±${a(o.iBaru)}, jurusan lama ±${a(o.iLama)}${o.pemerataan ? " — setelah fasa diratakan" : ""}.`,
  `Perkiraan jatuh tegangan terburuk turun ±${o.turunPct}%.`,
];

/** Tiang di titik tengah beban: separuh tarikan SR ada sebelum/sesudahnya. */
function titikBerat(p: Pohon): Simpul | null {
  const urut = [...p.simpul].sort((x, y) => x.d - y.d);
  let n = 0;
  for (const s of urut) {
    n += s.tarikan_sr;
    if (n >= p.sr / 2) return s;
  }
  return null;
}

const KABEL_KECIL_MAKS = 3;

export function buatRencana(
  r: JurusanJtr,
  gawang: GawangJtr[] | undefined,
  s: PengaturanJtr,
  kha: Map<string, number>,
): Rencana | null {
  const trafoLebih = (r.persen_beban ?? 0) > s.batas_trafo_pct;
  const arusLebih = r.arus_lebih || r.kha_lebih;
  if (!arusLebih && !r.panjang_lebih && !trafoLebih && r.status === "baik") return null;

  const arus = r.arus_maks ?? 0;
  const rata = ((r.a_r ?? 0) + (r.a_s ?? 0) + (r.a_t ?? 0)) / 3;
  const batasKha = r.kha_a ? (r.kha_a * s.batas_kha_pct) / 100 : Infinity;
  const batasI = Math.min(s.batas_arus_jurusan_a, batasKha);
  const slotKosong = r.jurusan_tersedia !== null && r.jurusan_terpakai !== null ? r.jurusan_tersedia - r.jurusan_terpakai : null;
  const catatan = [
    slotKosong === null
      ? "Slot jurusan PHB TR belum tercatat di pemeliharaan gardu — pastikan di lapangan."
      : `Slot jurusan: ${r.jurusan_terpakai}/${r.jurusan_tersedia} terpakai (pemeliharaan ${r.tgl_pemeliharaan ?? "-"}) — pastikan di lapangan.`,
  ];
  const pohon = gawang?.length ? susunPohon(gawang) : null;
  const bisaHitung = pohon !== null && pohon.sr > 0 && arus > 0;

  // ── Sisip gardu (dipakai beberapa cabang di bawah) ──────────────────────
  const sisip = (alasan: string[], pilihanLain: string[] = []): Rencana => {
    const berat = bisaHitung ? titikBerat(pohon) : null;
    const pindah = berat ? (berat.srHilir / pohon!.sr) * arus : null;
    return {
      jenis: "sisip",
      ringkas: berat ? `Sisip gardu dekat ${berat.kode ?? "tiang"} (${m(berat.d)})` : "Sisip gardu",
      alasan,
      rinci: berat
        ? [
            `Lokasi usulan: tiang ${berat.kode} — titik tengah beban, ${m(berat.d)} dari gardu.`,
            `Perkiraan beban pindah ke gardu sisip: ±${a(pindah!)} (${berat.srHilir} dari ${pohon!.sr} tarikan SR).`,
            `Jurusan lama tersisa ±${a(arus - pindah!)}.`,
          ]
        : ["Lokasi belum bisa dihitung — JTR jurusan ini belum diinspeksi."],
      pilihanLain,
      catatan: [],
      titik: berat ? [{ tiang_id: berat.tiang_id, kode: berat.kode, peran: "sisip" }] : [],
      pindah: berat ? [...hilirDari(berat)].map((x) => x.tiang_id) : [],
    };
  };

  // ── 1–3. Arus atau beban kabel lewat batas ──────────────────────────────
  if (arusLebih) {
    const sebab = r.kha_lebih && !r.arus_lebih
      ? `Arus ${a(arus)} melewati ${s.batas_kha_pct}% KHA kabel ${r.kabel} (${a(r.kha_a ?? 0)}).`
      : `Arus fasa terbesar ${a(arus)} > batas ${a(s.batas_arus_jurusan_a)}.`;

    if (rata <= batasI) {
      return {
        jenis: "pemerataan",
        ringkas: `Pemerataan beban (rata-rata fasa ${a(rata)})`,
        alasan: [sebab, `Rata-rata ketiga fasa ${a(rata)} masih di bawah batas ${a(batasI)} — cukup dipindah antar fasa, tanpa kabel baru.`],
        rinci: [`R/S/T sekarang ${r.a_r}/${r.a_s}/${r.a_t} A → setelah seimbang ±${a(rata)} per fasa.`],
        pilihanLain: [],
        catatan: [],
      };
    }
    if (!bisaHitung) {
      return trafoLebih
        ? sisip([sebab, `Trafo ${Math.round(r.persen_beban ?? 0)}% > ${s.batas_trafo_pct}%.`])
        : {
            jenis: "inspeksi-jtr",
            ringkas: "Inspeksi JTR dulu",
            alasan: [sebab, "Bentuk jaringan jurusan ini belum ada di SMART, jadi titik pecah / lokasi sisip belum bisa dihitung."],
            rinci: [],
            pilihanLain: [],
            catatan,
          };
    }

    const pilihan = susunPilihan(konteksPecah(r, gawang, s)!);
    const tulisOpsi = (o: OpsiPecah) =>
      `${namaOpsi(o)} — kabel baru ${m(o.kabelBaru)}, ${a(o.iBaru)} + ${a(o.iLama)}${o.pemerataan ? " (sesudah pemerataan)" : ""}`;

    const penghalang: string[] = [];
    if (trafoLebih) penghalang.push(`Trafo ${Math.round(r.persen_beban ?? 0)}% > ${s.batas_trafo_pct}% — menambah jurusan tidak mengurangi beban trafo.`);
    if (slotKosong !== null && slotKosong <= 0) penghalang.push(`Slot jurusan PHB TR penuh (${r.jurusan_terpakai}/${r.jurusan_tersedia}).`);
    if (!pilihan.length) penghalang.push(`Tidak ada tiang dalam ${m(s.batas_kabel_baru_m)} dari gardu yang membuat kedua bagian ≤ ${a(batasI)}.`);

    if (penghalang.length) {
      return { ...sisip([sebab, ...penghalang], pilihan.slice(0, 2).map((o) => `Tambah jurusan: ${tulisOpsi(o)}`)), pilihan };
    }
    const t = pilihan[0];
    return {
      jenis: "tambah-jurusan",
      ringkas: ringkasOpsi(t),
      alasan: [sebab, `Rata-rata fasa ${a(rata)} juga di atas batas — pemerataan saja tidak cukup.`],
      rinci: rinciOpsi(t, pohon.sr),
      pilihanLain: [],
      catatan,
      titik: [{ tiang_id: t.titikId, kode: t.titikKode, peran: "pecah" }],
      pindah: t.pindah,
      pilihan,
    };
  }

  // ── 4. Kabel kecil kelebihan arus di tengah jurusan yang aman ───────────
  if (bisaHitung) {
    const perSr = arus / pohon.sr;
    const leher = pohon.simpul.filter((x) => {
      const k = x.ukuran ? kha.get(`${x.jenis}|${x.ukuran}`) : undefined;
      return k !== undefined && x.srHilir * perSr > (k * s.batas_kha_pct) / 100;
    });
    if (leher.length) {
      const panjang = leher.reduce((t, x) => t + x.panjang_m, 0);
      return {
        jenis: "ganti-kabel",
        ringkas: `Ganti kabel ${leher[0].ukuran} (${leher.length} gawang, ${m(panjang)})`,
        alasan: [`Perkiraan arus hilir di potongan kabel ${leher[0].ukuran} melewati ${s.batas_kha_pct}% KHA-nya.`],
        rinci: leher.slice(0, KABEL_KECIL_MAKS).map((x) => `Tiang ${x.kode}: ${x.jenis} ${x.ukuran}, arus hilir ±${a(x.srHilir * perSr)}.`)
          .concat(leher.length > KABEL_KECIL_MAKS ? [`…dan ${leher.length - KABEL_KECIL_MAKS} gawang lain.`] : []),
        pilihanLain: [],
        catatan: [],
        titik: leher.map((x) => ({ tiang_id: x.tiang_id, kode: x.kode, peran: "kabel" as const })),
        besaran: { kabel_m: panjang, tiang: leher.length },
      };
    }
  }

  // ── 5. Trafo saja ──────────────────────────────────────────────────────
  if (trafoLebih) {
    return {
      jenis: "naik-daya",
      ringkas: `Naik daya / mutasi trafo (beban ${Math.round(r.persen_beban ?? 0)}%)`,
      alasan: [`Trafo ${r.kva} kVA berbeban ${Math.round(r.persen_beban ?? 0)}% > ${s.batas_trafo_pct}%, jurusan ini sendiri masih aman.`],
      rinci: [],
      pilihanLain: ["Sisip gardu bila ada jurusan lain yang juga bermasalah."],
      catatan: [],
    };
  }

  // ── 6. Panjang saja ────────────────────────────────────────────────────
  if (r.panjang_lebih) {
    return {
      jenis: "ukur-ujung",
      ringkas: `Ukur tegangan ujung dulu (${m(r.terjauh_m ?? 0)})`,
      alasan: [
        `Lintasan terjauh ${m(r.terjauh_m ?? 0)} > ${m(s.batas_panjang_m)}, tapi arus ${a(arus)} masih aman.`,
        "Panjang saja belum bukti tegangan jatuh — pastikan dengan ukur tegangan ujung sebelum memecah atau sisip.",
      ],
      rinci: [],
      pilihanLain: [],
      catatan: [],
    };
  }
  return null;
}
