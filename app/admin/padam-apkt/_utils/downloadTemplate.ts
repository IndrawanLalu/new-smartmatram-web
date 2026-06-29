import ExcelJS from "exceljs";

const CLR_HEADER  = "B2DFDB"; // teal muda
const CLR_BORDER  = "90A4AE";
const CLR_NOTE    = "E8F5E9";
const CLR_SAMPLE  = "F9FBE7";
const CLR_REQ     = "FFCDD2"; // merah muda — kolom wajib

const HEADERS: { label: string; width: number; note: string; required?: boolean }[] = [
  { label: "NO LAPORAN",             width: 20, note: 'Kode unik, cth: P4426061100004 atau J4426061100001', required: true },
  { label: "ULP",                    width: 16, note: 'cth: ULP AMPENAN, ULP CAKRANEGARA', required: true },
  { label: "PENYULANG",              width: 16, note: 'Nama penyulang, cth: GUNUNG SARI', required: true },
  { label: "LOKASI TITIK GANGGUAN",  width: 30, note: 'Alamat/lokasi titik gangguan' },
  { label: "Tanggal Padam",          width: 14, note: 'Format: YYYY-MM-DD, cth: 2026-06-01', required: true },
  { label: "Jam Padam",              width: 12, note: 'Format: HH:mm:ss, cth: 08:30:00' },
  { label: "Tanggal Nyala Sementara", width: 22, note: 'Format: YYYY-MM-DD, cth: 2026-06-01. Kosongkan jika tidak ada' },
  { label: "Jam Nyala Sementara",    width: 18, note: 'Format: HH:mm:ss, cth: 09:00:00. Kosongkan jika tidak ada' },
  { label: "Tanggal Nyala",          width: 14, note: 'Format: YYYY-MM-DD, cth: 2026-06-01' },
  { label: "Jam Nyala",              width: 12, note: 'Format: HH:mm:ss, cth: 10:15:00' },
  { label: "Fasilitas",              width: 10, note: 'cth: JTM, JTR, APP' },
  { label: "Sub Fasilitas",          width: 14, note: 'cth: SUTM, SKTM' },
  { label: "Equipment",              width: 24, note: 'cth: PMT, PMS, SECTIONALIZER, FCO' },
  { label: "EVENT DAMAGE",           width: 14, note: 'cth: OPEN, FAILURE, BURN' },
  { label: "CAUSE",                  width: 16, note: 'cth: POHON, PETIR, BINATANG, MANUSIA' },
  { label: "GROUP CAUSE",            width: 16, note: 'cth: ALAM, TEKNIS, MANUSIA' },
  { label: "WEATHER",                width: 14, note: 'cth: HUJAN, CERAH, BERAWAN' },
  { label: "JUMLAH PELANGGAN PADAM", width: 22, note: 'Angka bulat, cth: 150' },
  { label: "LAMA PADAM (JAM)",       width: 18, note: 'Desimal (titik), cth: 1.7500' },
  { label: "JAM X PELANGGAN PADAM",  width: 22, note: 'Desimal (titik), cth: 262.5000' },
  { label: "PENYEBAB PADAM",         width: 36, note: 'Uraian singkat penyebab gangguan' },
  { label: "ENS",                    width: 12, note: 'Energy Not Served (kWh), desimal, cth: 0.5250' },
  { label: "AMPERE",                 width: 12, note: 'Arus operasi, cth: 120' },
  { label: "KETERANGAN",             width: 30, note: 'Keterangan tambahan' },
  { label: "LOKASI GANGGUAN",        width: 20, note: 'cth: STA 10+500' },
  { label: "SECTION GANGGUAN",       width: 18, note: 'Nama section, jika ada' },
  { label: "PEMBATAS SECTION",       width: 18, note: 'Alat pembatas section, jika ada' },
  { label: "NO TIANG GANGGUAN",      width: 18, note: 'cth: T.110' },
  { label: "RELE PROTEKSI",          width: 16, note: 'cth: OCR, GFR, RECLOSER' },
  { label: "BESAR ARUS (AMPERE)",    width: 20, note: 'Arus gangguan terukur, cth: 80' },
];

const SAMPLE_ROW: string[] = [
  "P4426061100004",
  "ULP AMPENAN",
  "GUNUNG SARI",
  "JL. GUNUNG SARI NO. 15",
  "2026-06-01",
  "08:30:00",
  "",
  "",
  "2026-06-01",
  "10:15:00",
  "JTM",
  "SUTM",
  "PMT",
  "OPEN",
  "POHON",
  "ALAM",
  "HUJAN",
  "150",
  "1.7500",
  "262.5000",
  "Pohon tumbang mengenai jaringan JTM",
  "0.5250",
  "120",
  "Perbaikan selesai",
  "STA 10+500",
  "",
  "",
  "T.110",
  "OCR",
  "80",
];

function border(c: ExcelJS.Cell) {
  c.border = {
    top:    { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    left:   { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    bottom: { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    right:  { style: "thin", color: { argb: "FF" + CLR_BORDER } },
  };
}

export async function downloadPadamApktTemplate() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";

  // ── Sheet 1: Template ──────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Template Upload", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  // Column widths
  HEADERS.forEach((h, i) => {
    ws.getColumn(i + 1).width = h.width;
  });

  ws.getRow(1).height = 14; // notes row
  ws.getRow(2).height = 22; // header row
  ws.getRow(3).height = 16; // sample row

  // ── ROW 1: Catatan per kolom ───────────────────────────────────────────────
  HEADERS.forEach((h, i) => {
    const c = ws.getCell(1, i + 1);
    c.value = h.note;
    c.font  = { size: 8, italic: true, color: { argb: "FF546E7A" } };
    c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEFF1" } };
    c.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    border(c);
  });

  // ── ROW 2: Header ──────────────────────────────────────────────────────────
  HEADERS.forEach((h, i) => {
    const c = ws.getCell(2, i + 1);
    c.value = h.label;
    c.font  = {
      bold: true, size: 9,
      color: { argb: "FF004D40" },
    };
    c.fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: "FF" + (h.required ? CLR_REQ : CLR_HEADER) },
    };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    border(c);
  });

  // ── ROW 3: Contoh data ─────────────────────────────────────────────────────
  SAMPLE_ROW.forEach((val, i) => {
    const c = ws.getCell(3, i + 1);
    c.value = val;
    c.font  = { size: 9, italic: true, color: { argb: "FF37474F" } };
    c.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + CLR_SAMPLE } };
    c.alignment = { horizontal: "left", vertical: "middle" };
    border(c);
  });

  // Freeze baris 1–2, data mulai baris 3
  ws.views = [{ state: "frozen", ySplit: 2 }];

  // ── Sheet 2: Panduan ───────────────────────────────────────────────────────
  const guide = wb.addWorksheet("Panduan");
  guide.getColumn(1).width = 30;
  guide.getColumn(2).width = 60;

  const title = guide.getCell(1, 1);
  title.value = "PANDUAN UPLOAD DATA PADAM APKT";
  title.font  = { bold: true, size: 12, color: { argb: "FF004D40" } };
  title.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB2DFDB" } };
  guide.mergeCells(1, 1, 1, 2);
  title.alignment = { horizontal: "center", vertical: "middle" };
  guide.getRow(1).height = 24;

  const steps: [string, string][] = [
    ["Cara Upload", "Buka sheet 'Template Upload', hapus baris 1 (catatan) dan baris 3 (contoh), isi data mulai baris 3."],
    ["", "Atau: Copy seluruh sheet dari Excel sumber ke clipboard, lalu Paste ke kolom input di halaman Rekap Padam APKT."],
    ["Header wajib ada", "Baris header (NO LAPORAN, ULP, PENYULANG, dst.) harus ikut di-copy bersama data."],
    ["Kolom wajib (merah)", "NO LAPORAN, ULP, PENYULANG, Tanggal Padam — harus diisi, tidak boleh kosong."],
    ["Format Tanggal", "Gunakan YYYY-MM-DD (cth: 2026-06-01). Excel kadang mengubah format — pastikan kolom bertipe Text sebelum paste."],
    ["Format Jam", "Gunakan HH:mm:ss (cth: 08:30:00)."],
    ["Format Angka", "Gunakan titik (.) sebagai desimal, bukan koma. Kolom 'JUMLAH PELANGGAN PADAM' harus bilangan bulat."],
    ["ULP", "Boleh dengan atau tanpa prefix 'ULP ' — sistem otomatis menghapus prefix tersebut."],
    ["Duplikat", "Jika no_laporan + ulp + penyulang + tgl_padam sudah ada di database, data akan di-update (upsert), bukan duplikasi."],
    ["Kode J Dobel", "Tab 'Kode J Dobel' akan menampilkan No Laporan yang muncul di lebih dari satu ULP — perlu diverifikasi."],
  ];

  steps.forEach(([key, val], idx) => {
    const r = guide.addRow([key, val]);
    r.height = 32;
    r.getCell(1).font  = { bold: !!key, size: 9 };
    r.getCell(2).font  = { size: 9 };
    r.getCell(2).alignment = { wrapText: true, vertical: "top" };
    const bg = idx % 2 === 0 ? "FFFFFF" : "F5F5F5";
    [1, 2].forEach((ci) => {
      const c = r.getCell(ci);
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + bg } };
      border(c);
    });
  });

  // ── Download ───────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob   = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url;
  a.download = "template-upload-padam-apkt.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
