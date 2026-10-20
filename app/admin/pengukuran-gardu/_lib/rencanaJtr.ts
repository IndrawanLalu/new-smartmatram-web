/**
 * Rencana perbaikan JTR (Analisis JTR F3, 20 Okt 2026).
 *
 * Satu jurusan → satu rencana, diurutkan dari tindakan TERMURAH:
 *   1. Pemerataan beban  — fasa terbesar lewat batas, rata-rata fasa tidak
 *   2. Tambah jurusan    — pecah di tiang X (percabangan dulu; kalau tidak ada
 *                          yang layak, tiang mana pun), kabel baru ≤ batas
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

/** Alamat peta yang menggambar rencana satu jurusan (useRencanaPeta). */
export const alamatPetaRencana = (gardu: string, jurusan: string) =>
  `/peta?rencana=${encodeURIComponent(gardu)}&jurusan=${encodeURIComponent(jurusan)}`;

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

interface CalonPecah {
  c: Simpul;
  iBaru: number;
  iLama: number;
  momenMaks: number;
  jauhLama: number;
  srPindah: number;
}

function calonPecah(p: Pohon, arus: number, batasI: number, batasKabel: number): CalonPecah[] {
  const perSr = arus / p.sr;
  const hulu = hulunya(p.simpul);
  const hasil: CalonPecah[] = [];
  for (const c of p.simpul) {
    if (!hulu.has(c) || c.srHilir === 0 || c.srHilir === p.sr) continue; // akar = memindah semuanya
    const kabelBaru = c.d - c.panjang_m; // gardu → hulu c, lalu menyambung ke c
    if (kabelBaru > batasKabel) continue;
    const iBaru = c.srHilir * perSr;
    const iLama = arus - iBaru;
    if (iBaru > batasI || iLama > batasI) continue;
    const hilir = hilirDari(c);
    const leluhur = new Set<Simpul>();
    for (let x = hulu.get(c); x; x = hulu.get(x)) leluhur.add(x);
    const lama = p.simpul.filter((s) => !hilir.has(s));
    const mBaru = momen([...hilir], perSr) + iBaru * kabelBaru;
    const mLama = momen(lama, perSr, { c, leluhur });
    hasil.push({ c, iBaru, iLama, momenMaks: Math.max(mBaru, mLama), jauhLama: Math.max(0, ...lama.map((s) => s.d)), srPindah: c.srHilir });
  }
  return hasil.sort((x, y) => x.momenMaks - y.momenMaks);
}

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

    const perCabang = calonPecah(pohon, arus, batasI, s.batas_kabel_baru_m);
    const cabang = perCabang.filter((c) => c.c.percabangan);
    const calon = cabang.length ? cabang : perCabang;
    const momenAwal = momen(pohon.simpul, arus / pohon.sr);
    const tulisCalon = (c: CalonPecah) =>
      `${c.c.kode}${c.c.percabangan ? "" : " (bukan percabangan)"} — kabel baru ${m(c.c.d - c.c.panjang_m)}, pindah ${c.srPindah} SR: ${a(c.iBaru)} + ${a(c.iLama)}`;

    const penghalang: string[] = [];
    if (trafoLebih) penghalang.push(`Trafo ${Math.round(r.persen_beban ?? 0)}% > ${s.batas_trafo_pct}% — menambah jurusan tidak mengurangi beban trafo.`);
    if (slotKosong !== null && slotKosong <= 0) penghalang.push(`Slot jurusan PHB TR penuh (${r.jurusan_terpakai}/${r.jurusan_tersedia}).`);
    if (!calon.length) penghalang.push(`Tidak ada tiang dalam ${m(s.batas_kabel_baru_m)} dari gardu yang membuat kedua bagian ≤ ${a(batasI)}.`);

    if (penghalang.length) {
      return sisip([sebab, ...penghalang], calon.slice(0, 2).map((c) => `Tambah jurusan di ${tulisCalon(c)}`));
    }
    const t = calon[0];
    return {
      jenis: "tambah-jurusan",
      ringkas: `Tambah jurusan, pecah di ${t.c.kode} (${m(t.c.d - t.c.panjang_m)})`,
      alasan: [sebab, `Rata-rata fasa ${a(rata)} juga di atas batas — pemerataan saja tidak cukup.`],
      rinci: [
        `Pecah di tiang ${t.c.kode}${t.c.percabangan ? " (percabangan)" : " — tidak ada percabangan yang layak, dipilih tiang biasa"}.`,
        `Kabel baru dari gardu ±${m(t.c.d - t.c.panjang_m)} (menyusuri jalur yang ada).`,
        `Pindah ${t.srPindah} dari ${pohon.sr} tarikan SR → jurusan baru ±${a(t.iBaru)}, jurusan lama ±${a(t.iLama)} (lintasan lama jadi ${m(t.jauhLama)}).`,
        `Perkiraan jatuh tegangan terburuk turun ±${Math.round((1 - t.momenMaks / momenAwal) * 100)}%.`,
      ],
      pilihanLain: calon.slice(1, 3).map(tulisCalon),
      catatan,
      titik: [
        { tiang_id: t.c.tiang_id, kode: t.c.kode, peran: "pecah" },
        ...calon.slice(1, 3).map((c) => ({ tiang_id: c.c.tiang_id, kode: c.c.kode, peran: "alternatif" as const })),
      ],
      pindah: [...hilirDari(t.c)].map((x) => x.tiang_id),
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
