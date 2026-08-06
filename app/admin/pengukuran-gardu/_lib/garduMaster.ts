import ExcelJS from "exceljs";

/**
 * Master gardu — definisi kolom, pembuat template, dan pembaca unggahan.
 *
 * Satu berkas jadi sumber tunggal: template yang diunduh dan pembaca yang
 * menerima unggahan membaca definisi yang SAMA. Kalau kolomnya berubah, template
 * dan validasinya berubah bersamaan — tidak mungkin melenceng.
 *
 * Aturan inti: **sel kosong berarti "jangan ubah"** untuk gardu yang sudah ada.
 * Itu yang membuat pembaruan sebagian bekerja — mis. nanti mengisi koordinat
 * saja untuk 800 gardu tanpa perlu mengisi ulang seluruh kolom lain, dan tanpa
 * risiko menimpa data yang sudah benar dengan sel kosong.
 */

// ── ULP & prefix AMG ──────────────────────────────────────────────────────────

export const ULP_LIST = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"] as const;

/**
 * Prefix kode AMG per ULP — RUJUKAN saja, untuk mengisi kolom `kode_amg`.
 *
 * JANGAN dipakai untuk mengirim ke AMG: satu ULP bisa punya lebih dari satu
 * prefix (Ampenan memakai 44150 dan 44151) dan yang kedua tidak muncul di
 * ekspor master. Pengiriman tetap mencoba daftar prefix di `amg_config`.
 */
export const PREFIX_AMG: Record<string, string> = {
  AMPENAN: "44150",
  CAKRANEGARA: "44110",
  TANJUNG: "44130",
  GERUNG: "44170",
};

/** Nama ULP di ekspor AMG → nama yang dipakai aplikasi. */
export const ULP_DARI_AMG: Record<string, string> = {
  AMPENAN: "AMPENAN",
  CAKRA: "CAKRANEGARA",
  CAKRANEGARA: "CAKRANEGARA",
  TANJUNG: "TANJUNG",
  GERUNG: "GERUNG",
};

/** ID UP di ekspor AMG → ULP. Dipakai kalau NAMA RAYON kosong. */
export const ULP_DARI_IDUP: Record<string, string> = {
  "44150": "AMPENAN",
  "44110": "CAKRANEGARA",
  "44130": "TANJUNG",
  "44170": "GERUNG",
};

// ── Koordinat ─────────────────────────────────────────────────────────────────

/** Batas longgar Lombok dan sekitarnya. */
const BATAS_LAT: readonly [number, number] = [-9.3, -8.0];
const BATAS_LNG: readonly [number, number] = [115.7, 117.0];
const dalam = (v: number, [a, b]: readonly [number, number]) => v >= a && v <= b;

export type StatusKoordinat = "benar" | "tertukar" | "rusak" | "kosong";

/**
 * Bereskan sepasang koordinat dari ekspor AMG.
 *
 * Datanya kotor: dari 2.526 baris, 284 punya X dan Y TERTUKAR (X berisi lintang)
 * dan 30 di luar nalar — ada yang `Y=-8598065`, ada yang jatuh di Jawa Timur.
 * Yang tertukar dikenali dari rentangnya dan dibalik; yang rusak dibuang supaya
 * tidak menaruh penanda ngawur di peta.
 */
export function bereskanKoordinat(
  xRaw: string | number | undefined,
  yRaw: string | number | undefined,
): { lat: number; lng: number; status: StatusKoordinat } {
  const x = Number(String(xRaw ?? "").replace(",", "."));
  const y = Number(String(yRaw ?? "").replace(",", "."));
  if (!xRaw || !yRaw || !Number.isFinite(x) || !Number.isFinite(y)) {
    return { lat: 0, lng: 0, status: "kosong" };
  }
  // Bentuk yang diharapkan: X = bujur, Y = lintang.
  if (dalam(y, BATAS_LAT) && dalam(x, BATAS_LNG)) return { lat: y, lng: x, status: "benar" };
  // Tertukar.
  if (dalam(x, BATAS_LAT) && dalam(y, BATAS_LNG)) return { lat: x, lng: y, status: "tertukar" };
  return { lat: 0, lng: 0, status: "rusak" };
}

export const STATUS_LIST = ["Aktif", "Nonaktif"] as const;

// ── Definisi kolom ────────────────────────────────────────────────────────────

export interface KolomMaster {
  /** Judul di baris pertama berkas. */
  header: string;
  /** Nama kolom di tabel `gardu`. */
  field: string;
  lebar: number;
  /** Wajib diisi HANYA untuk gardu yang belum ada di master. */
  wajibBaru?: boolean;
  numerik?: boolean;
  /** Pilihan tetap — dipasang sebagai dropdown di Excel. */
  pilihan?: readonly string[];
  petunjuk: string;
}

export const KOLOM_MASTER: KolomMaster[] = [
  { header: "KODE", field: "kode", lebar: 12, wajibBaru: true,
    petunjuk: "Kunci gardu, tanpa prefix. Contoh: AM264. Wajib, dipakai mencocokkan baris." },
  { header: "ULP", field: "ulp", lebar: 16, wajibBaru: true, pilihan: ULP_LIST,
    petunjuk: "Pilih dari daftar. Menentukan gardu ini masuk data ULP mana." },
  { header: "DAYA_KVA", field: "daya", lebar: 11, wajibBaru: true, numerik: true,
    petunjuk: "Rating trafo dalam kVA, contoh 160. Inilah angka yang jadi acuan pengukuran." },
  { header: "NAMA", field: "nama", lebar: 40,
    petunjuk: "Nama atau lokasi gardu." },
  { header: "ALAMAT", field: "alamat", lebar: 40,
    petunjuk: "Alamat lengkap." },
  { header: "PENYULANG", field: "feeder", lebar: 20,
    petunjuk: "Nama penyulang." },
  { header: "MERK", field: "merk", lebar: 14,
    petunjuk: "Merk trafo." },
  { header: "STATUS", field: "status", lebar: 12, pilihan: STATUS_LIST,
    petunjuk: "Kosongkan untuk gardu baru = dianggap Aktif." },
  { header: "KODE_AMG", field: "kode_amg", lebar: 15,
    petunjuk: "Kode di AMG, contoh 44150AM264. Boleh dikosongkan — akan disusun sendiri dari ULP + KODE." },
  { header: "LAT", field: "lat", lebar: 13, numerik: true,
    petunjuk: "Lintang, contoh -8.5763647. Boleh menyusul." },
  { header: "LNG", field: "lng", lebar: 13, numerik: true,
    petunjuk: "Bujur, contoh 116.0811096. Boleh menyusul." },
];

const HEADER_INDEX = new Map(KOLOM_MASTER.map((k, i) => [k.header, i]));

// ── Template ──────────────────────────────────────────────────────────────────

const WARNA_WAJIB = "FFF2CC";
const WARNA_HEADER = "1D3573";

/** Susun berkas template .xlsx untuk diunduh. */
export async function buatTemplateMaster(): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";

  // ── Sheet 1: data ──
  const ws = wb.addWorksheet("Master Gardu", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  ws.columns = KOLOM_MASTER.map((k) => ({ header: k.header, key: k.field, width: k.lebar }));

  const head = ws.getRow(1);
  head.height = 22;
  KOLOM_MASTER.forEach((k, i) => {
    const c = head.getCell(i + 1);
    c.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + WARNA_HEADER } };
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.note = k.petunjuk;
  });

  // Kolom wajib diberi latar supaya terlihat tanpa perlu membaca petunjuk.
  // 1.000 baris disiapkan: cukup untuk satu ULP sekali unggah.
  const BARIS = 1000;
  KOLOM_MASTER.forEach((k, i) => {
    const col = i + 1;
    for (let r = 2; r <= BARIS; r++) {
      const c = ws.getRow(r).getCell(col);
      if (k.wajibBaru) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + WARNA_WAJIB } };
      if (k.pilihan) {
        c.dataValidation = {
          type: "list", allowBlank: true,
          formulae: [`"${k.pilihan.join(",")}"`],
          showErrorMessage: true,
          error: `Pilih salah satu: ${k.pilihan.join(", ")}`,
        };
      }
      if (k.numerik) c.numFmt = "General";
    }
  });

  // ── Sheet 2: petunjuk ──
  const ps = wb.addWorksheet("Petunjuk");
  ps.columns = [{ width: 16 }, { width: 12 }, { width: 92 }];
  ps.addRow(["CARA PAKAI"]).font = { bold: true, size: 12 };
  [
    "1. Isi mulai baris ke-2 pada sheet 'Master Gardu'. Baris pertama jangan diubah.",
    "2. Kolom berlatar kuning WAJIB diisi untuk gardu yang BELUM ada di sistem.",
    "3. Untuk gardu yang SUDAH ada, cukup isi KODE + kolom yang mau diperbarui.",
    "   Sel yang dikosongkan TIDAK akan menimpa data lama.",
    "4. Karena itu, memperbarui koordinat saja cukup mengisi KODE, LAT, dan LNG.",
    "5. KODE dipakai mencocokkan baris — pastikan sama persis dengan yang di sistem.",
    "6. Simpan sebagai .xlsx, lalu unggah lewat tombol Impor Master di tab Data Gardu.",
  ].forEach((t) => ps.addRow([t]));
  ps.addRow([]);
  ps.addRow(["KOLOM", "WAJIB?", "KETERANGAN"]).font = { bold: true };
  KOLOM_MASTER.forEach((k) => {
    const r = ps.addRow([k.header, k.wajibBaru ? "Wajib" : "Opsional", k.petunjuk]);
    r.getCell(3).alignment = { wrapText: true };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ── Pembacaan unggahan ────────────────────────────────────────────────────────

export interface BarisMaster {
  /** Baris ke berapa di berkas — untuk menunjuk kesalahan secara tepat. */
  baris: number;
  kode: string;
  /** ULP — bagian kedua dari kunci. Kode gardu tidak unik lintas ULP. */
  ulp: string;
  /** Hanya kolom yang BENAR-BENAR diisi. Yang kosong tidak masuk sini, supaya
   *  tidak ikut menimpa nilai lama saat upsert. */
  nilai: Record<string, string | number | Record<string, string>>;
  galat: string[];
  /** Hanya untuk ekspor AMG — dilaporkan di pratinjau. */
  koordinat?: StatusKoordinat;
}

export interface HasilBaca {
  baris: BarisMaster[];
  /** "template" = berkas dari tombol Unduh Template.
   *  "amg" = ekspor mentah AMG (kolom NO GARDU / ID UP / KOORDINAT X). */
  format: "template" | "amg";
  ringkasKoordinat: Record<StatusKoordinat, number>;
}

// ── Pemetaan kolom ekspor AMG ─────────────────────────────────────────────────

const H_AMG = {
  kode: "NO GARDU",
  daya: "DAYA",
  idUp: "ID UP",
  rayon: "NAMA RAYON",
  penyulang: "NAMA PENYULANG",
  alamat: "ALAMAT",
  merk: "MERK",
  x: "KOORDINAT X",
  y: "KOORDINAT Y",
} as const;

const teks = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String(v.text).trim();
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  return String(v).trim();
};

/**
 * Baca berkas .xlsx jadi baris siap-upsert.
 *
 * Menerima DUA bentuk: template hasil unduhan, dan ekspor mentah AMG. Formatnya
 * dikenali dari judul kolom, jadi ekspor AMG bisa diunggah apa adanya tanpa
 * disalin ulang ke template — itu langkah manual yang paling mudah salah.
 */
export async function bacaBerkasMaster(file: File): Promise<HasilBaca> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());

  const ws = wb.getWorksheet("Master Gardu") ?? wb.worksheets[0];
  if (!ws) throw new Error("Berkas tidak berisi sheet apa pun");

  const judul = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
    const h = teks(cell.value).toUpperCase();
    if (h) judul.set(h, col);
  });

  const format: "template" | "amg" =
    judul.has(H_AMG.kode) && judul.has(H_AMG.daya) ? "amg" : "template";

  // Tanpa penjaga ini, berkas yang judul kolomnya tidak dikenali akan lolos dan
  // menghasilkan ratusan baris bergalat "KODE kosong" — benar tapi menyesatkan,
  // karena masalah sebenarnya ada di baris judul, bukan di datanya.
  if (format === "template" && !judul.has("KODE")) {
    throw new Error(
      `Judul kolom tidak dikenali. Berkas harus punya kolom "KODE" (template SMART) ` +
      `atau "NO GARDU" + "DAYA" (ekspor AMG). Yang terbaca: ${[...judul.keys()].slice(0, 8).join(", ")}`,
    );
  }

  const hasil: BarisMaster[] = [];
  const ringkasKoordinat: Record<StatusKoordinat, number> = { benar: 0, tertukar: 0, rusak: 0, kosong: 0 };
  /** Kunci "KODE|ULP" — kode saja tidak cukup, ia tidak unik lintas ULP. */
  const kunciTerlihat = new Map<string, number>();

  const sel = (row: ExcelJS.Row, nama: string) => {
    const col = judul.get(nama);
    return col ? teks(row.getCell(col).value) : "";
  };

  ws.eachRow((row, nomor) => {
    if (nomor === 1) return;

    let kode = "";
    let ulp = "";
    const nilai: Record<string, string | number | Record<string, string>> = {};
    const galat: string[] = [];
    let statusKoord: StatusKoordinat | undefined;

    if (format === "amg") {
      kode = sel(row, H_AMG.kode).toUpperCase();
      if (!kode) return;                                   // baris kosong

      const rayon = sel(row, H_AMG.rayon).toUpperCase();
      const idUp = sel(row, H_AMG.idUp);
      ulp = ULP_DARI_AMG[rayon] ?? ULP_DARI_IDUP[idUp] ?? "";
      if (!ulp) galat.push(`ULP tidak dikenali (RAYON "${rayon}", ID UP "${idUp}")`);

      const daya = Number(sel(row, H_AMG.daya).replace(",", "."));
      if (Number.isFinite(daya) && daya > 0) nilai.daya = daya;
      else galat.push(`DAYA tidak sah: "${sel(row, H_AMG.daya)}"`);

      const alamat = sel(row, H_AMG.alamat);
      if (alamat) { nilai.alamat = alamat; nilai.nama = alamat; }
      const penyulang = sel(row, H_AMG.penyulang);
      if (penyulang) nilai.feeder = penyulang;
      const merk = sel(row, H_AMG.merk);
      if (merk) nilai.merk = merk;

      const k = bereskanKoordinat(sel(row, H_AMG.x), sel(row, H_AMG.y));
      statusKoord = k.status;
      ringkasKoordinat[k.status] += 1;
      if (k.status === "benar" || k.status === "tertukar") { nilai.lat = k.lat; nilai.lng = k.lng; }

      if (idUp && kode) nilai.kode_amg = idUp + kode;
      // STATUS AMG (AI/APBN/HIBAH/PELANGGAN/BTS/AO) adalah kode kepemilikan &
      // sumber dana, bukan status operasi — sengaja TIDAK dipetakan ke kolom
      // `status` kita yang berisi Aktif/Nonaktif. Nilai aslinya tetap tersimpan
      // utuh di data_amg di bawah.
      //
      // `status` juga sengaja tidak diisi di sini: mengisinya berarti setiap
      // impor ulang akan mengembalikan gardu yang sudah ditandai Nonaktif jadi
      // Aktif lagi. Nilai awal untuk gardu BARU dipasang saat upsert, di mana
      // sudah diketahui mana yang baru dan mana yang cuma diperbarui.

      // SELURUH kolom ekspor disimpan apa adanya — konstruksi trafo, hubungan
      // belitan, kabel, nomor seri, tahun pembuatan, tanggal operasi, dan
      // seterusnya. Yang sudah dinaikkan jadi kolom sendiri tetap ikut di sini
      // supaya barisnya utuh sebagai arsip apa yang AMG kirimkan.
      const mentah: Record<string, string> = {};
      for (const [nama, col] of judul) {
        const v = teks(row.getCell(col).value);
        if (v) mentah[nama] = v;
      }
      if (Object.keys(mentah).length) nilai.data_amg = mentah;
    } else {
      for (const [nama, col] of judul) {
        const idx = HEADER_INDEX.get(nama);
        if (idx === undefined) continue;
        const k = KOLOM_MASTER[idx];
        const raw = teks(row.getCell(col).value);
        if (!raw) continue;                                // kosong = jangan ubah

        if (k.field === "kode") { kode = raw.toUpperCase(); continue; }
        if (k.field === "ulp")  { ulp = raw.toUpperCase(); continue; }
        if (k.numerik) {
          const n = Number(raw.replace(",", "."));
          if (Number.isFinite(n)) nilai[k.field] = n;
          continue;
        }
        nilai[k.field] = raw;
      }

      if (!kode && !ulp && Object.keys(nilai).length === 0) return;
      if (!kode) galat.push("KODE kosong");
      if (ulp && !ULP_LIST.includes(ulp as (typeof ULP_LIST)[number])) {
        galat.push(`ULP "${ulp}" tidak dikenal`);
      }

      const daya = nilai.daya as number | undefined;
      if (daya !== undefined && daya <= 0) galat.push("DAYA_KVA harus lebih besar dari 0");

      const lat = nilai.lat as number | undefined;
      const lng = nilai.lng as number | undefined;
      if (lat !== undefined && (lat < -90 || lat > 90)) galat.push("LAT di luar rentang -90..90");
      if (lng !== undefined && (lng < -180 || lng > 180)) galat.push("LNG di luar rentang -180..180");
      if ((lat === undefined) !== (lng === undefined)) galat.push("LAT dan LNG harus diisi berpasangan");

      if (!nilai.kode_amg && ulp && PREFIX_AMG[ulp] && kode) {
        nilai.kode_amg = PREFIX_AMG[ulp] + kode;
      }
    }

    if (kode && ulp) {
      const kunci = `${kode}|${ulp}`;
      const sebelumnya = kunciTerlihat.get(kunci);
      if (sebelumnya) galat.push(`KODE + ULP ganda dengan baris ${sebelumnya}`);
      else kunciTerlihat.set(kunci, nomor);
    }

    hasil.push({ baris: nomor, kode, ulp, nilai, galat, koordinat: statusKoord });
  });

  return { baris: hasil, format, ringkasKoordinat };
}

export const namaBerkasTemplate = () =>
  `template-master-gardu-${new Date().toISOString().slice(0, 10)}.xlsx`;
