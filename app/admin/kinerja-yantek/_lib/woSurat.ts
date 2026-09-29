import { BULAN } from "../_hooks/useKinerjaYantek";

/**
 * Surat WO bulanan Yantek — sebelas jenis pekerjaan, urutan dan nama dari user
 * (29 Sep 2026). Angkanya = kolom WO terbit Rekap Kinerja (`rekap_kinerja`),
 * objek lampirannya dari `wo_surat_objek` — dua-duanya lahir di database dari
 * sumber yang sama, jadi surat tidak bisa bercerita lain dari rekap.
 */

/** Bentuk kolom tempelan & lampiran (keputusan user 29 Sep 2026): yang
 *  bersatuan gardu dan yang bersatuan KMS dibedakan, supaya surat rapi. */
export type FormatWo = "gardu" | "kms" | "harjar";

export interface JenisSurat {
  kunci: string;
  nama: string;
  satuan: "Kms" | "Gardu" | "Pekerjaan";
  /** Dihitung dalam KMS (dibagi per km), bukan per objek. */
  km: boolean;
  format: FormatWo;
  /** Bisa ditempel dari Excel. Semua, kecuali Optimasi (WO-nya dari hasil pengukuran). */
  tempel: boolean;
  /** Tempelan masuk WO MODULNYA (tampil di HP) — bukan `wo_manual`. */
  modul: boolean;
  /** Judul kolom objek di lampiran & tempelan. */
  kolomObjek: string;
  /** Kolom penyulang ikut ditempel (segmen wajib punya penyulang). */
  penyulang?: boolean;
}

export const JENIS_SURAT: JenisSurat[] = [
  { kunci: "perabasan",     nama: "WO Perabasan Pohon",           satuan: "Kms",       km: true,  format: "kms",    tempel: true,  modul: true,  kolomObjek: "Segment", penyulang: true },
  { kunci: "harjtm",        nama: "WO Pemeliharaan Jaringan",     satuan: "Pekerjaan", km: false, format: "harjar", tempel: true,  modul: false, kolomObjek: "Segment / Gardu" },
  { kunci: "hargardu",      nama: "WO Pemeliharaan Gardu",        satuan: "Gardu",     km: false, format: "gardu",  tempel: true,  modul: true,  kolomObjek: "Gardu" },
  { kunci: "penyeimbangan", nama: "WO Penyeimbangan Beban Trafo", satuan: "Gardu",     km: false, format: "gardu",  tempel: true,  modul: false, kolomObjek: "Gardu" },
  { kunci: "optimasi",      nama: "WO Optimasi Trafo",            satuan: "Gardu",     km: false, format: "gardu",  tempel: false, modul: true,  kolomObjek: "Gardu" },
  { kunci: "jtm",           nama: "WO Inspeksi JTM Tier 1",       satuan: "Kms",       km: true,  format: "kms",    tempel: true,  modul: true,  kolomObjek: "Segment", penyulang: true },
  { kunci: "jtm2",          nama: "WO Inspeksi JTM Tier 2",       satuan: "Kms",       km: true,  format: "kms",    tempel: true,  modul: false, kolomObjek: "Segment", penyulang: true },
  { kunci: "jtr",           nama: "WO Inspeksi JTR",              satuan: "Kms",       km: true,  format: "kms",    tempel: true,  modul: true,  kolomObjek: "Gardu" },
  { kunci: "igardu1",       nama: "WO Inspeksi Gardu Tier 1",     satuan: "Gardu",     km: false, format: "gardu",  tempel: true,  modul: false, kolomObjek: "Gardu" },
  { kunci: "igardu2",       nama: "WO Inspeksi Gardu Tier 2",     satuan: "Gardu",     km: false, format: "gardu",  tempel: true,  modul: false, kolomObjek: "Gardu" },
  { kunci: "pengukuran",    nama: "WO Pengukuran Beban Gardu dan Tegangan Ujung", satuan: "Gardu", km: false, format: "gardu", tempel: true, modul: true, kolomObjek: "Gardu" },
];

/** Realisasinya dicentang di web — modulnya belum ada (keputusan user 29 Sep 2026). */
export const KUNCI_CENTANG = ["jtm2", "igardu1", "igardu2"];

export interface ObjekWo {
  kunci: string;
  urutan: number;
  objek: string;
  alamat: string | null;
  km: number | null;
  keterangan: string | null;
  pelaksana: string | null;
  tgl_rencana: string | null;
  penyulang: string | null;
  kva: number | null;
  uraian: string | null;
}

/** Satu kolom lampiran (dan tempelan). Lebar PDF dalam pt, Excel dalam lebar karakter. */
export interface KolomLampiran {
  isi: "objek" | "alamat" | "km" | "kva" | "keterangan" | "pelaksana" | "penyulang" | "uraian";
  label: string;
  pdf: number;
  xls: number;
  kanan?: boolean;
}

/** Kolom lampiran sesuai format — urutannya = urutan kolom template Excel. */
export function kolomLampiran(j: JenisSurat): KolomLampiran[] {
  const ujung: KolomLampiran[] = [
    { isi: "keterangan", label: "KETERANGAN", pdf: 56, xls: 16 },
    { isi: "pelaksana", label: "PELAKSANA", pdf: 60, xls: 18 },
  ];
  if (j.format === "gardu") {
    return [
      { isi: "objek", label: j.kolomObjek.toUpperCase(), pdf: 48, xls: 11 },
      { isi: "alamat", label: "ALAMAT", pdf: 124, xls: 34 },
      { isi: "kva", label: "KVA", pdf: 30, xls: 7, kanan: true },
      ...ujung,
    ];
  }
  if (j.format === "harjar") {
    return [
      { isi: "uraian", label: "URAIAN PEKERJAAN", pdf: 110, xls: 30 },
      { isi: "objek", label: j.kolomObjek.toUpperCase(), pdf: 80, xls: 22 },
      { isi: "km", label: "KMS", pdf: 34, xls: 9, kanan: true },
      ...ujung,
    ];
  }
  return [
    ...(j.penyulang ? [{ isi: "penyulang", label: "PENYULANG", pdf: 62, xls: 16 } as KolomLampiran] : []),
    { isi: "objek", label: j.kolomObjek.toUpperCase(), pdf: j.penyulang ? 120 : 150, xls: j.penyulang ? 34 : 40 },
    { isi: "km", label: "KMS", pdf: 34, xls: 9, kanan: true },
    ...ujung,
  ];
}

/** Isi satu sel lampiran sebagai teks. */
export function isiSel(o: ObjekWo, k: KolomLampiran["isi"]): string {
  if (k === "km") return o.km === null ? "" : fmtAngka(o.km, true);
  if (k === "kva") return o.kva === null ? "" : fmtAngka(o.kva, false);
  return o[k] ?? "";
}

export interface PengaturanSurat {
  ulp: string;
  kota: string | null;
  alamat: string | null;
  telepon: string | null;
  kotak_pos: string | null;
  nama_manager: string | null;
  nama_tl: string | null;
  jabatan_tl: string;
  mitra: string | null;
  penerima: string | null;
  penerima_kota: string | null;
  cq: string | null;
  tembusan: string | null;
  ttd_manager: string | null;
  ttd_tl: string | null;
}

export const PENGATURAN_KOSONG = (ulp: string): PengaturanSurat => ({
  ulp, kota: null, alamat: null, telepon: null, kotak_pos: null, nama_manager: null, nama_tl: null,
  jabatan_tl: "TL Teknik", mitra: null, penerima: null, penerima_kota: null, cq: null, tembusan: null,
  ttd_manager: null, ttd_tl: null,
});

const dua = (n: number) => String(n).padStart(2, "0");
export const isoTgl = (y: number, m: number, d: number) => `${y}-${dua(m)}-${dua(d)}`;

/** Surat terbit di hari terakhir bulan SEBELUM bulan WO: WO September → 31 Agustus. */
export function tglSurat(tahun: number, bulan: number) {
  const akhir = new Date(tahun, bulan - 1, 0);
  return isoTgl(akhir.getFullYear(), akhir.getMonth() + 1, akhir.getDate());
}

export function labelTanggal(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export const labelBulan = (tahun: number, bulan: number) => `${BULAN[bulan - 1]} ${tahun}`;

export const jumlahHari = (tahun: number, bulan: number) => new Date(tahun, bulan, 0).getDate();

/** Hari libur = Sabtu, Minggu, dan tanggal di `hari_libur`. */
export function hariLibur(tahun: number, bulan: number, liburNasional: string[]) {
  const libur = new Set<number>();
  for (let d = 1; d <= jumlahHari(tahun, bulan); d++) {
    const w = new Date(tahun, bulan - 1, d).getDay();
    if (w === 0 || w === 6 || liburNasional.includes(isoTgl(tahun, bulan, d))) libur.add(d);
  }
  return libur;
}

/**
 * Hari target tiap objek — DIBAGI RATA ke hari efektif (keputusan user):
 * 100 KMS dalam 22 hari efektif = 4,55 KMS sehari; objek diisi berurutan,
 * pindah ke hari berikutnya begitu jatah hari itu terlampaui. Jenis bersatuan
 * gardu dibagi per objek. Objek yang tanggal rencananya ditempel ikut
 * tanggal itu.
 *
 * KMS yang tidak lengkap (permintaan user 29 Sep 2026 — WO Inspeksi JTR dari
 * sistem belum semuanya ber-KMS) tetap harus menghasilkan tanggal untuk SEMUA
 * objek:
 *   • tidak ada satu pun KMS → dibagi per objek (jumlah gardu ÷ hari efektif);
 *   • sebagian kosong → yang kosong diberi bobot rata-rata KMS yang ada.
 */
export function jadwalRata(objek: ObjekWo[], km: boolean, tahun: number, bulan: number, libur: Set<number>) {
  const efektif = Array.from({ length: jumlahHari(tahun, bulan) }, (_, i) => i + 1).filter((d) => !libur.has(d));
  const adaKm = objek.filter((o) => (o.km ?? 0) > 0);
  const perObjek = !km || adaKm.length === 0;
  const rataKm = adaKm.length > 0 ? adaKm.reduce((a, o) => a + (o.km ?? 0), 0) / adaKm.length : 0;
  const bobot = objek.map((o) => (perObjek ? 1 : (o.km ?? 0) > 0 ? o.km! : rataKm));
  const perHari = efektif.length > 0 ? bobot.reduce((a, b) => a + b, 0) / efektif.length : 0;
  // Yang ditulis di lampiran: KMS NYATA, bukan bobot pengganti.
  const total = km ? adaKm.reduce((a, o) => a + (o.km ?? 0), 0) : objek.length;
  const awalan = `${tahun}-${dua(bulan)}-`;

  let kumulatif = 0;
  const hari = objek.map((o, i) => {
    const mulai = kumulatif;
    kumulatif += bobot[i];
    if (o.tgl_rencana?.startsWith(awalan)) return Number(o.tgl_rencana.slice(8, 10));
    if (efektif.length === 0 || perHari === 0) return null;
    return efektif[Math.min(efektif.length - 1, Math.floor(mulai / perHari + 1e-9))];
  });
  return { hari, total, perHari, perObjek, tanpaKm: km ? objek.length - adaKm.length : 0 };
}

/** 191,187 — tiga desimal untuk KMS seperti surat aslinya, bulat untuk cacah. */
export function fmtAngka(v: number | null, km: boolean) {
  if (v === null) return "-";
  return v.toLocaleString("id-ID", km ? { minimumFractionDigits: 3, maximumFractionDigits: 3 } : { maximumFractionDigits: 0 });
}

export const namaBerkas = (ulp: string, tahun: number, bulan: number, ext: string) =>
  `WO_Yantek_${ulp}_${tahun}-${dua(bulan)}.${ext}`;

export const HARI_SINGKAT = ["MGU", "SEN", "SEL", "RAB", "KAM", "JUM", "SAB"];

/** Satu lampiran: jenis + objek + hari targetnya. */
export interface Lampiran {
  jenis: JenisSurat;
  objek: ObjekWo[];
  hari: (number | null)[];
  total: number;
  /** Dalam satuan yang dipakai membagi: KMS, atau objek kalau `perObjek`. */
  perHari: number;
  /** Dibagi per objek karena tidak ada satu pun KMS. */
  perObjek: boolean;
  /** Objek berjenis KMS yang KMS-nya kosong. */
  tanpaKm: number;
}

/** Semua bahan PDF dan Excel — disusun sekali, dipakai keduanya. */
export interface PaketSurat {
  ulp: string;
  tahun: number;
  bulan: number;
  nomor: string;
  tglSurat: string;
  set: PengaturanSurat;
  baris: { jenis: JenisSurat; nilai: number | null }[];
  lampiran: Lampiran[];
  libur: Set<number>;
  /** data URL PNG */
  logo: string | null;
  ttdManager: string | null;
  ttdTl: string | null;
}

export function susunLampiran(objek: ObjekWo[], tahun: number, bulan: number, libur: Set<number>): Lampiran[] {
  return JENIS_SURAT.flatMap((jenis) => {
    const milik = objek.filter((o) => o.kunci === jenis.kunci).sort((a, b) => a.urutan - b.urutan);
    if (milik.length === 0) return [];
    const j = jadwalRata(milik, jenis.km, tahun, bulan, libur);
    return [{ jenis, objek: milik, ...j }];
  });
}

/** Baris jumlah di bawah lampiran — sama untuk PDF dan Excel. */
export function ringkasLampiran(l: Lampiran) {
  const n = l.objek.length;
  const objek = l.jenis.kolomObjek.toLowerCase();
  if (!l.jenis.km) return `${fmtAngka(n, false)} ${l.jenis.satuan} · ${fmtAngka(l.perHari, true)} ${l.jenis.satuan.toLowerCase()}/hari efektif`;
  if (l.perObjek) return `${n} ${objek} (KMS belum tersedia) · dibagi ${fmtAngka(l.perHari, true)} ${objek}/hari efektif`;
  const kosong = l.tanpaKm > 0 ? ` (${l.tanpaKm} dari ${n} ${objek} belum ber-KMS)` : "";
  return `${fmtAngka(l.total, true)} Kms${kosong} · ${fmtAngka(l.perHari, true)} kms/hari efektif`;
}
