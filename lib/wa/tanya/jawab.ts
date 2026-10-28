import { supabaseAdmin } from "@/lib/supabase-admin";
import { rapikan, type Kamus } from "./rapikan";
import { bacaPeriode, hariIniWita, ULP_SEMUA, type Saringan } from "./saringan";
import { urai, type Bahan, type HasilUrai, type KataKunci } from "./urai";
import { FUNGSI, fungsiMenurutKode } from "./fungsi";
import type { Balasan, NamaSaringan } from "./fungsi/jenis";

/**
 * Tanya Jawab WA (@smart) — satu pertanyaan → satu balasan. Dipakai webhook
 * WA dan kotak Uji coba di web. Kata kunci, kamus, dan contoh dibaca dari tabel
 * `wa_tanya_*` (cache 60 detik: perubahan dari web berlaku ±1 menit kemudian).
 */

const KAKI = "_SMART MATARAM — PLN UP3 Mataram_";
const SIMPAN_MS = 60_000;
const RIWAYAT_HARI = 90;

interface BahanLengkap extends Bahan {
  nama: Map<string, string>;
  contoh: Map<string, string[]>;
  /** grup WA → ULP (dari wa_settings), hanya grup milik satu ULP. */
  ulpGrup: Map<string, string>;
}

let simpanan: { kapan: number; bahan: BahanLengkap } | null = null;

/** Fungsi di kode yang belum punya baris → isi baris, kata kunci, dan contoh bawaannya. */
async function isiBenih(ada: Set<string>) {
  const baru = FUNGSI.filter((f) => !ada.has(f.kode));
  if (!baru.length) return;
  const { error } = await supabaseAdmin
    .from("wa_tanya_fungsi")
    .upsert(baru.map((f) => ({ kode: f.kode, nama: f.nama, updated_by: "isi awal" })), { onConflict: "kode", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await supabaseAdmin.from("wa_tanya_kata").upsert(
    baru.flatMap((f) => f.kata.map(([kata, bobot]) => ({ fungsi_kode: f.kode, kata, bobot }))),
    { onConflict: "fungsi_kode,kata", ignoreDuplicates: true },
  );
  await supabaseAdmin.from("wa_tanya_contoh").insert(baru.flatMap((f) => f.contoh.map((teks, urutan) => ({ fungsi_kode: f.kode, teks, urutan }))));
}

async function bacaBahan(sudahBenih = false): Promise<BahanLengkap> {
  const [fungsi, kata, kamus, contoh, penyulang, grup] = await Promise.all([
    supabaseAdmin.from("wa_tanya_fungsi").select("kode,nama,aktif,ambang"),
    supabaseAdmin.from("wa_tanya_kata").select("fungsi_kode,kata,bobot"),
    supabaseAdmin.from("wa_tanya_kamus").select("dari,jadi"),
    supabaseAdmin.from("wa_tanya_contoh").select("fungsi_kode,teks,urutan").order("urutan"),
    supabaseAdmin.from("penyulang_ref").select("penyulang"),
    supabaseAdmin.from("wa_settings").select("ulp,group_id"),
  ]);
  for (const r of [fungsi, kata, kamus, contoh]) if (r.error) throw new Error(r.error.message);

  const ada = new Set((fungsi.data ?? []).map((f) => f.kode));
  if (!sudahBenih && FUNGSI.some((f) => !ada.has(f.kode))) {
    await isiBenih(ada);
    return bacaBahan(true);
  }

  // Grup yang dipakai lebih dari satu ULP (mis. grup UP3) tidak punya bawaan ULP.
  const perGrup = new Map<string, Set<string>>();
  for (const g of grup.data ?? []) {
    if (!g.group_id) continue;
    const s = perGrup.get(g.group_id) ?? new Set<string>();
    s.add(g.ulp ?? "");
    perGrup.set(g.group_id, s);
  }
  const ulpGrup = new Map(
    [...perGrup].map(([id, s]) => [id, [...s]] as const).filter(([, u]) => u.length === 1 && u[0]).map(([id, u]) => [id, u[0]]),
  );

  const aktif = (fungsi.data ?? []).filter((f) => f.aktif && fungsiMenurutKode.has(f.kode));
  const contohPer = new Map<string, string[]>();
  for (const c of contoh.data ?? []) contohPer.set(c.fungsi_kode, [...(contohPer.get(c.fungsi_kode) ?? []), c.teks]);
  return {
    fungsi: aktif.map((f) => ({ kode: f.kode, ambang: Number(f.ambang), wajib: fungsiMenurutKode.get(f.kode)?.wajib })),
    kata: (kata.data ?? []).map((k) => ({ ...k, bobot: Number(k.bobot) })) as KataKunci[],
    kamus: (kamus.data ?? []) as Kamus[],
    penyulang: (penyulang.data ?? []).map((p) => p.penyulang as string),
    nama: new Map(aktif.map((f) => [f.kode, f.nama])),
    contoh: contohPer,
    ulpGrup,
  };
}

async function muatBahan(): Promise<BahanLengkap> {
  if (simpanan && Date.now() - simpanan.kapan < SIMPAN_MS) return simpanan.bahan;
  const bahan = await bacaBahan();
  simpanan = { kapan: Date.now(), bahan };
  return bahan;
}

/** Buang cache lalu baca ulang (sekaligus isi benih) — dipakai halaman web
 *  sesudah kata diubah, supaya Uji coba langsung memakai yang baru. */
export async function segarkanBahan(): Promise<void> {
  simpanan = null;
  await muatBahan();
}

const LABEL_SARINGAN: Record<NamaSaringan, string> = { ulp: "ULP", periode: "waktu", gardu: "kode gardu", penyulang: "penyulang" };

/** "🔎 Gardu overload · AMPENAN · Okt 2026" — apa yang dipahami bot. */
function judul(nama: string, pakai: NamaSaringan[], s: Saringan) {
  const bagian = [`*${nama}*`];
  if (pakai.includes("gardu") && s.gardu) bagian.push(s.gardu);
  if (pakai.includes("penyulang") && s.penyulang) bagian.push(`penyulang ${s.penyulang}`);
  if (pakai.includes("ulp") && !pakai.includes("gardu")) bagian.push(s.ulp ?? "semua ULP");
  // Satu gardu = keadaan terakhirnya, periode tidak dipakai.
  if (pakai.includes("periode") && s.periode && !(pakai.includes("gardu") && s.gardu)) bagian.push(s.periode.label);
  return `🔎 ${bagian.join(" · ")}`;
}

/** Sisa kalimat tanpa kata kunci yang cocok ("cari gardu pagutan" → "gardu pagutan"). */
function buangKata(sisa: string, cocok: string[]) {
  let t = ` ${sisa} `;
  for (const c of cocok) t = t.replace(` ${c.split("≈")[0]} `, " ");
  return t.replace(/\s+/g, " ").trim();
}

function contohSingkat(b: BahanLengkap, kode: string[]) {
  return kode.flatMap((k) => (b.contoh.get(k) ?? []).slice(0, 1).map((t) => `» ${t}`));
}

export interface AsalPesan {
  /** Nomor/JID pengirim. */
  dari: string | null;
  /** JID grup, null = chat pribadi. */
  grup: string | null;
  nama: string | null;
}

export interface HasilTanya {
  balasan: Balasan;
  urai: HasilUrai | null;
  fungsi: string | null;
  /** tanya_balik = bot menanyakan ULP/periode dulu — tidak dicatat; jawaban akhirnya yang dicatat. */
  hasil: "dijawab" | "tidak_dipahami" | "pilihan" | "tanya_balik" | "galat";
}

/** Yang sudah dipilih lewat jawaban bernomor: fungsi dan/atau saringan yang ditetapkan. */
interface Lanjutan {
  kode?: string;
  tetap: Partial<Saringan>;
  /** Label pilihan, untuk riwayat: "gangguan [Ampenan · Bulan ini]". */
  dipilih: string[];
  /** ULP/periode yang dipilih sebagai kata ("ampenan", "bulan ini") — saran bertanya langsung. */
  kata: string[];
}

interface Opsi {
  label: string;
  kode?: string;
  tetap?: Partial<Saringan>;
}

/**
 * Pilihan bernomor yang sedang ditunggu, per pengirim di tiap grup: bot ragu
 * (seri) atau menanyakan ULP/periode → balas "1"/"2" dalam 5 menit untuk
 * menjalankan pertanyaan yang sama dengan pilihan itu. Di memori proses —
 * cukup untuk satu server web.
 */
const PILIHAN_MS = 5 * 60_000;
const pilihanTerbuka = new Map<string, { kapan: number; teks: string; lanjut: Lanjutan; opsi: Opsi[] }>();
const kunciAsal = (a: AsalPesan) => `${a.grup ?? ""}|${a.dari ?? ""}`;
const TANPA_PILIHAN: Lanjutan = { tetap: {}, dipilih: [], kata: [] };

const PERIODE_TANYA = ["hari ini", "minggu ini", "bulan ini", "tahun ini"];

/** Pesan yang isinya HANYA salam ("halo pak", "selamat pagi") → menu bernomor. */
const SALAM = new Set([
  "halo", "hallo", "helo", "hello", "hai", "hi", "hay", "hei", "hey", "p", "ping", "tes", "test", "permisi", "salam",
  "assalamualaikum", "assalamu", "alaikum", "asalamualaikum", "ass", "wr", "wb", "selamat", "pagi", "siang", "sore", "malam",
  "pak", "bu", "bapak", "ibu", "om", "kak", "min", "admin", "bot", "smart",
]);
const hanyaSalam = (rapi: string) => {
  const k = rapi.split(" ").filter(Boolean);
  return k.length > 0 && k.every((x) => SALAM.has(x));
};
/** Isi menu sapaan; fungsi yang dinonaktifkan dari web tidak tampil. */
const MENU: [kode: string, label?: string][] = [
  ["gangguan"], ["realisasi"], ["temuan"], ["gardu_overload"], ["tegangan_ujung"],
  ["kartu_gardu", "Data gardu (perlu kode gardu)"], ["cari_gardu", "Cari gardu (perlu alamat)"], ["bantuan", "Contoh pertanyaan"],
];

function sapa(asal: AsalPesan, b: BahanLengkap): HasilTanya {
  const opsi = MENU.filter(([k]) => b.nama.has(k)).map(([k, label]) => ({ label: label ?? b.nama.get(k)!, kode: k }));
  const nama = asal.nama?.trim();
  const kepala = [`👋 Halo Pak/Bu${nama ? ` ${nama}` : ""}, ada yang bisa saya bantu?`];
  // Teks kosong: pilihan menu menjalankan fungsinya tanpa saringan dari salam.
  return { balasan: tawarkan(asal, "", TANPA_PILIHAN, kepala, opsi), urai: null, fungsi: null, hasil: "tanya_balik" };
}
const besarAwal = (t: string) => t[0].toUpperCase() + t.slice(1).toLowerCase();

/** Simpan pilihan yang ditunggu lalu susun daftar bernomornya. */
function tawarkan(asal: AsalPesan, teks: string, lanjut: Lanjutan, kepala: string[], opsi: Opsi[]): string {
  const kini = Date.now();
  for (const [k, v] of pilihanTerbuka) if (kini - v.kapan > PILIHAN_MS) pilihanTerbuka.delete(k);
  pilihanTerbuka.set(kunciAsal(asal), { kapan: kini, teks, lanjut, opsi });
  return [
    ...kepala,
    "",
    ...opsi.map((o, i) => `*${i + 1}.* ${o.label}`),
    "",
    `_Ketik ${asal.grup ? "*@smart 1*" : "*1*"} untuk yang pertama, dan seterusnya (berlaku 5 menit)._`,
  ].join("\n");
}

async function susun(teks: string, asal: AsalPesan, b: BahanLengkap, lanjut: Lanjutan = TANPA_PILIHAN): Promise<HasilTanya> {
  const hariIni = hariIniWita();
  const u = urai(teks, b, hariIni);
  const k: HasilUrai["keputusan"] = lanjut.kode ? { jenis: "jalankan", kode: lanjut.kode } : u.keputusan;

  if (k.jenis === "tidak_paham") {
    const contoh = contohSingkat(b, b.fungsi.map((f) => f.kode).filter((x) => x !== "bantuan")).slice(0, 5);
    return {
      balasan: ["🤔 Maaf, saya belum paham pertanyaannya. Coba seperti ini:", "", ...contoh, "", "Ketik *@smart bantuan* untuk semua contoh."].join("\n"),
      urai: u, fungsi: null, hasil: "tidak_dipahami",
    };
  }
  if (k.jenis === "seri") {
    const opsi = k.kode.map((x) => ({ label: b.nama.get(x) ?? x, kode: x }));
    return { balasan: tawarkan(asal, teks, lanjut, ["🤔 Maksud Anda yang mana? Balas dengan nomornya:"], opsi), urai: u, fungsi: null, hasil: "pilihan" };
  }

  const f = fungsiMenurutKode.get(k.kode)!;
  const s: Saringan = { ...u.saringan, ...lanjut.tetap };
  if (f.saringan.includes("ulp") && !s.ulpDisebut && asal.grup) s.ulp = b.ulpGrup.get(asal.grup) ?? null;
  const nama = b.nama.get(f.kode) ?? f.nama;

  const kurang = (f.wajib ?? []).find((w) => !s[w]);
  if (kurang) {
    return {
      balasan: [`🔎 *${nama}*`, `${besarAwal(LABEL_SARINGAN[kurang])} belum disebut. Contoh:`, ...contohSingkat(b, [f.kode])].join("\n"),
      urai: u, fungsi: f.kode, hasil: "dijawab",
    };
  }

  // ULP lalu periode yang tidak disebut ditanyakan dulu. Grup milik satu ULP
  // sudah punya ULP; satu gardu sudah menentukan ULP dan memakai keadaan terakhirnya.
  const lanjutF = { ...lanjut, kode: f.kode };
  const satuGardu = f.saringan.includes("gardu") && !!s.gardu;
  if (f.saringan.includes("ulp") && !f.ulpBolehSemua && !s.ulpDisebut && !s.ulp && !satuGardu) {
    const opsi: Opsi[] = [
      { label: "Semua ULP", tetap: { ulp: null, ulpDisebut: true } },
      ...ULP_SEMUA.map((x) => ({ label: besarAwal(x), tetap: { ulp: x, ulpDisebut: true } })),
    ];
    return { balasan: tawarkan(asal, teks, lanjutF, [`🔎 *${nama}*`, "Untuk ULP mana? Balas dengan nomornya:"], opsi), urai: u, fungsi: f.kode, hasil: "tanya_balik" };
  }
  if (f.saringan.includes("periode") && !s.periode && !satuGardu) {
    const opsi = PERIODE_TANYA.map((x) => ({ label: besarAwal(x), tetap: { periode: bacaPeriode(x, hariIni).periode } }));
    return { balasan: tawarkan(asal, teks, lanjutF, [`🔎 *${nama}*`, "Periode yang mana? Balas dengan nomornya:"], opsi), urai: u, fungsi: f.kode, hasil: "tanya_balik" };
  }

  const contoh = b.fungsi
    .filter((x) => x.kode !== "bantuan")
    .map((x) => ({ nama: b.nama.get(x.kode) ?? x.kode, teks: b.contoh.get(x.kode) ?? [] }));
  const bebas = buangKata(u.sisa, u.skor.find((x) => x.kode === f.kode)?.cocok ?? []);
  const isi = await f.jalankan({ saringan: s, contoh, rapi: u.rapi, bebas });
  const kepala = f.kode === "bantuan" ? null : judul(nama, f.saringan, s);
  // ULP/periode didapat dari tanya balik → tunjukkan cara bertanya langsung.
  const saran = lanjut.kata.length ? `_Lain kali bisa langsung: @smart ${teks.replace(/^@?smart\b[\s,:.\-!]*/i, "") || nama.toLowerCase()} ${lanjut.kata.join(" ")}_` : null;
  const balasan: Balasan =
    typeof isi === "string"
      ? // Jawaban #DATA sudah berkaki sendiri — jangan dobel.
        [kepala, kepala ? "" : null, isi, ...(saran ? ["", saran] : []), ...(isi.trimEnd().endsWith(KAKI) ? [] : ["", KAKI])]
          .filter((x) => x !== null)
          .join("\n")
      : { ...isi, caption: [kepala, isi.caption].filter(Boolean).join("\n") };
  return { balasan, urai: { ...u, saringan: s }, fungsi: f.kode, hasil: "dijawab" };
}

/** Jawab satu pertanyaan. `catat` = tulis ke riwayat (webhook ya, Uji coba tidak). */
export async function tanya(teks: string, asal: AsalPesan, catat: boolean): Promise<HasilTanya> {
  let h: HasilTanya;
  let teksCatat = teks;
  try {
    const b = await muatBahan();
    const nomor = /^\s*(\d)\s*$/.exec(teks);
    const tunggu = nomor ? pilihanTerbuka.get(kunciAsal(asal)) : undefined;
    const o = nomor && tunggu && Date.now() - tunggu.kapan <= PILIHAN_MS ? tunggu.opsi[Number(nomor[1]) - 1] : undefined;
    if (tunggu && o) {
      pilihanTerbuka.delete(kunciAsal(asal));
      const l = tunggu.lanjut;
      const lanjut: Lanjutan = {
        kode: o.kode ?? l.kode,
        tetap: { ...l.tetap, ...o.tetap },
        dipilih: [...l.dipilih, o.label],
        kata: o.tetap ? [...l.kata, o.label.toLowerCase()] : l.kata,
      };
      teksCatat = `${tunggu.teks || "(menu sapaan)"} [${lanjut.dipilih.join(" · ")}]`;
      h = await susun(tunggu.teks, asal, b, lanjut);
    } else h = hanyaSalam(rapikan(teks)) ? sapa(asal, b) : await susun(teks, asal, b);
  } catch (e) {
    console.error("[tanya-wa]", (e as Error).message);
    h = { balasan: "⚠️ Maaf, terjadi kesalahan saat mengambil data. Coba lagi sebentar.", urai: null, fungsi: null, hasil: "galat" };
  }
  if (catat && h.hasil !== "tanya_balik") void catatRiwayat(teksCatat, asal, h);
  return h;
}

async function catatRiwayat(teks: string, asal: AsalPesan, h: HasilTanya) {
  const top = h.urai?.skor[0];
  const { error } = await supabaseAdmin.from("wa_tanya_riwayat").insert({
    dari: asal.dari, grup: asal.grup, nama: asal.nama, teks,
    teks_rapi: h.urai?.rapi ?? null,
    fungsi_kode: h.fungsi,
    saringan: h.urai ? { ...h.urai.saringan, sisa: h.urai.sisa } : null,
    skor: top?.skor ?? null,
    hasil: h.hasil,
  });
  if (error) console.error("[tanya-wa] riwayat:", error.message);
  // Riwayat lebih dari 90 hari dibuang sesekali (±1 dari 50 pertanyaan) — tanpa penjadwal.
  if (Math.random() < 0.02) {
    const batas = new Date(Date.now() - RIWAYAT_HARI * 86_400_000).toISOString();
    await supabaseAdmin.from("wa_tanya_riwayat").delete().lt("waktu", batas);
  }
}
