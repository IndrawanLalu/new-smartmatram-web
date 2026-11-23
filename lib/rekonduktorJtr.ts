/**
 * Survey Jaringan — Rekonduktor JTR (23 Nov 2026): ganti kabel + aksesoris JTR
 * pada ruas tiang awal → tiang akhir, tiang tetap. Hanya hitungan (tanpa
 * database): penelusuran ruas, isian bawaan per tiang, material.
 * SQL: scripts/survey-jaringan-7.sql. Rencana: rencana-rekonduktor-jtr.md.
 */

/** Satu kabel JTR di satu tiang (baris `tiang_gawang_kabel`). */
export interface GawangKabel {
  tiang_id: string;
  kode: string | null;
  jurusan: string | null;
  konduktor_id: string;
  nomor_kabel: number | null;
  jenis: string | null;
  ukuran: string | null;
  /** null = kabel ini datang langsung dari gardu. */
  hulu_id: string | null;
  panjang_m: number;
}

/** Data tiang & kabel yang jadi isian bawaan. */
export interface DataTiangJtr {
  lat: number;
  lng: number;
  stay_jenis: string | null;
  tarikan_sr: number;
}
export interface AksesorisKabel {
  aks_suspension: string | null;
  aks_large_angle: string | null;
  aks_dead_end: string | null;
}

/** Jumlah per tiang yang menjadi dasar material (semua bisa diubah user). */
export const ITEM_TIANG = ["sr", "suspension", "fixed", "la", "treckschoer", "drugschoer", "kontramast"] as const;
export type ItemTiang = (typeof ITEM_TIANG)[number];
export const LABEL_ITEM: Record<ItemTiang, { pendek: string; panjang: string }> = {
  sr: { pendek: "SR", panjang: "Jumlah SR (CCO/joint diganti)" },
  suspension: { pendek: "Sus", panjang: "Suspension" },
  fixed: { pendek: "Fix", panjang: "Fixed (dead end)" },
  la: { pendek: "LA", panjang: "LA (large angle)" },
  treckschoer: { pendek: "Trk", panjang: "Treckschoer" },
  drugschoer: { pendek: "Drg", panjang: "Drugschoer" },
  kontramast: { pendek: "Ktr", panjang: "Kontramast" },
};

export type TiangRuas = Record<ItemTiang, number> & {
  tiang_id: string;
  kode: string | null;
  lat: number;
  lng: number;
  /** Gawang tiang ini ke hulunya yang IKUT diganti (tiang awal = 0, kecuali dari gardu). */
  panjang_m: number;
  /** Jenis stay menurut inspeksi — keterangan saja. */
  stay: string | null;
};

export interface RuasRekonduktor {
  id: string;
  jurusan: string | null;
  nomor_kabel: number | null;
  /** Kabel yang ada sekarang, mis. "LVTC 3x35+1x25". */
  kabel_lama: string | null;
  kabel_jenis: string | null;
  kabel_ukuran: string | null;
  /** Ruas dimulai dari gardu (gawang pertama gardu → tiang ikut diganti). */
  dari_gardu: boolean;
  /** Urut hulu → hilir. */
  tiang: TiangRuas[];
}

/** Jalur satu kabel dari tiang awal ke tiang akhir, urut hulu → hilir. */
export interface Jalur {
  baris: GawangKabel[];
  dariGardu: boolean;
}

/** Kabel berikutnya ke arah gardu: jurusan & nomor sama dulu, lalu jurusan sama, lalu satu-satunya. */
function kabelHulu(b: GawangKabel, perTiang: Map<string, GawangKabel[]>): GawangKabel | undefined {
  const calon = b.hulu_id ? (perTiang.get(b.hulu_id) ?? []) : [];
  return (
    calon.find((x) => x.jurusan === b.jurusan && x.nomor_kabel === b.nomor_kabel) ??
    calon.find((x) => x.jurusan === b.jurusan) ??
    (calon.length === 1 ? calon[0] : undefined)
  );
}

/** Dari satu kabel di tiang `hilir`, mundur ke arah gardu sampai `hulu` (null = gardu). */
function mundur(awal: GawangKabel, hulu: string | null, perTiang: Map<string, GawangKabel[]>): GawangKabel[] | null {
  const jalan: GawangKabel[] = [];
  const dilihat = new Set<string>();
  let b: GawangKabel | undefined = awal;
  while (b && !dilihat.has(b.tiang_id)) {
    dilihat.add(b.tiang_id);
    jalan.push(b);
    if (hulu !== null && b.tiang_id === hulu) return jalan.reverse();
    if (!b.hulu_id) return hulu === null ? jalan.reverse() : null;
    b = kabelHulu(b, perTiang);
  }
  return null;
}

/**
 * Semua jalur kabel dari `awal` (null = gardu) ke `akhir`. Penelusuran dari
 * tiang AKHIR mundur ke arah gardu — di tiang percabangan, cabang yang
 * terpilih otomatis cabang yang menuju tiang terakhir, dan kabel lain di
 * tiang bersama tidak ikut. Diklik terbalik (akhir lebih dekat ke gardu)
 * tetap ditemukan. Lebih dari satu jalur = kabel sejajar di tiang yang sama.
 */
export function telusuriJalur(gawang: GawangKabel[], awal: string | null, akhir: string): Jalur[] {
  const perTiang = new Map<string, GawangKabel[]>();
  for (const g of gawang) perTiang.set(g.tiang_id, [...(perTiang.get(g.tiang_id) ?? []), g]);
  const cari = (dari: string | null, ke: string) =>
    (perTiang.get(ke) ?? []).flatMap((b) => {
      const j = mundur(b, dari, perTiang);
      return j ? [{ baris: j, dariGardu: dari === null }] : [];
    });
  if (awal === akhir) return [];
  const hasil = cari(awal, akhir);
  return hasil.length || awal === null ? hasil : cari(akhir, awal);
}

const ada = (kondisi: string | null) => !!kondisi && kondisi !== "Tidak Ada";

/**
 * Ruas baru dari satu jalur. Isian bawaan: SR & stay dari data tiang,
 * suspension / fixed / LA dari aksesoris kabel hasil inspeksi JTR. Tiang yang
 * sudah ada di ruas lain: SR & stay 0 supaya tidak terhitung dua kali.
 */
export function buatRuas(
  jalur: Jalur,
  data: Map<string, DataTiangJtr>,
  aks: Map<string, AksesorisKabel>,
  sudahDipakai: Set<string>,
  kabel: Pick<RuasRekonduktor, "kabel_jenis" | "kabel_ukuran">,
): RuasRekonduktor {
  const pertama = jalur.baris[jalur.baris.length - 1];
  return {
    id: crypto.randomUUID(),
    jurusan: pertama.jurusan,
    nomor_kabel: pertama.nomor_kabel,
    kabel_lama: [pertama.jenis, pertama.ukuran].filter(Boolean).join(" ") || null,
    ...kabel,
    dari_gardu: jalur.dariGardu,
    tiang: jalur.baris.map((b, i) => {
      const d = data.get(b.tiang_id);
      const a = aks.get(b.konduktor_id);
      const lagi = sudahDipakai.has(b.tiang_id);
      return {
        tiang_id: b.tiang_id,
        kode: b.kode,
        lat: d?.lat ?? 0,
        lng: d?.lng ?? 0,
        panjang_m: i === 0 && !jalur.dariGardu ? 0 : Math.round(b.panjang_m * 10) / 10,
        stay: d?.stay_jenis ?? null,
        sr: lagi ? 0 : (d?.tarikan_sr ?? 0),
        suspension: ada(a?.aks_suspension ?? null) ? 1 : 0,
        fixed: ada(a?.aks_dead_end ?? null) ? 1 : 0,
        la: ada(a?.aks_large_angle ?? null) ? 1 : 0,
        treckschoer: !lagi && d?.stay_jenis === "Treckschoer" ? 1 : 0,
        drugschoer: !lagi && d?.stay_jenis === "Drugschoer" ? 1 : 0,
        kontramast: 0,
      };
    }),
  };
}

export const panjangRuas = (r: RuasRekonduktor) => r.tiang.reduce((n, t) => n + t.panjang_m, 0);
export const jumlahItem = (r: RuasRekonduktor, k: ItemTiang) => r.tiang.reduce((n, t) => n + t[k], 0);
export const namaKabel = (r: Pick<RuasRekonduktor, "kabel_jenis" | "kabel_ukuran">) =>
  [r.kabel_jenis, r.kabel_ukuran].filter(Boolean).join(" ");
export const ujungRuas = (r: RuasRekonduktor, gardu: string | null) =>
  `${r.dari_gardu ? (gardu ?? "gardu") : (r.tiang[0]?.kode ?? "?")} → ${r.tiang[r.tiang.length - 1]?.kode ?? "?"}`;

/** Baris `jtr_material_ref` pekerjaan rekonduktor. */
export interface MaterialRekonRef {
  nama: string;
  satuan: string;
  dasar: "tetap" | "kabel_m" | ItemTiang | string;
  faktor: number;
  urutan: number;
}

/**
 * Material semua ruas: tiap ruas dihitung dari bawaan (⌈faktor × dasar⌉,
 * "{kabel}" = kabel pengganti ruas itu), lalu baris bernama sama dijumlah.
 * Dasar "tetap" dihitung sekali per survey, bukan per ruas.
 */
export function materialRekonduktor(ruas: RuasRekonduktor[], ref: MaterialRekonRef[]) {
  const hasil = new Map<string, { nama: string; satuan: string; jumlah: number }>();
  const tambah = (nama: string, satuan: string, n: number) => {
    if (!n) return;
    const k = `${nama}|${satuan}`;
    const x = hasil.get(k);
    if (x) x.jumlah += n;
    else hasil.set(k, { nama, satuan, jumlah: n });
  };
  const urut = [...ref].sort((a, b) => a.urutan - b.urutan);
  for (const m of urut) {
    if (m.dasar === "tetap") {
      tambah(m.nama, m.satuan, Math.ceil(m.faktor));
      continue;
    }
    for (const r of ruas) {
      const dasar = m.dasar === "kabel_m" ? panjangRuas(r) : (ITEM_TIANG as readonly string[]).includes(m.dasar) ? jumlahItem(r, m.dasar as ItemTiang) : 0;
      tambah(m.nama.replace("{kabel}", namaKabel(r) || "(kabel belum dipilih)").trim(), m.satuan, Math.ceil(m.faktor * dasar));
    }
  }
  return [...hasil.values()];
}
