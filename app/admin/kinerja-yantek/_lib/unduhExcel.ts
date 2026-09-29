import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_WHITE, downloadBuffer, mergeSet, styleCell } from "@/lib/xlsxGaya";
import {
  fmtAngka, HARI_SINGKAT, jumlahHari, kolomLampiran, labelBulan, labelTanggal, namaBerkas, ringkasLampiran,
  type Lampiran, type PaketSurat,
} from "./woSurat";

/**
 * Unduhan Excel surat WO: sheet "Surat" + satu sheet per lampiran. Gaya tabel
 * dari `lib/xlsxGaya.ts` (kepala kuning, garis tipis, baris berselang);
 * kisi tanggal: merah = Sabtu/Minggu/libur, hijau = hari target.
 * Dimuat lewat import() saat tombol ditekan — exceljs berukuran ratusan KB.
 */

const MERAH = "E53935";
const HIJAU = "43A047";
const SELANG = "F5F5F5";

const base64 = (dataUrl: string) => dataUrl.slice(dataUrl.indexOf(",") + 1);

function pasangGambar(wb: ExcelJS.Workbook, ws: ExcelJS.Worksheet, dataUrl: string | null, col: number, row: number, w: number, h: number) {
  if (!dataUrl) return;
  const id = wb.addImage({ base64: base64(dataUrl), extension: "png" });
  ws.addImage(id, { tl: { col, row }, ext: { width: w, height: h } });
}

function sheetSurat(wb: ExcelJS.Workbook, p: PaketSurat) {
  const ws = wb.addWorksheet("Surat", {
    pageSetup: { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
    views: [{ showGridLines: false }],
  });
  [4, 12, 38, 3, 12, 14].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  const s = p.set;
  const tulis = (r: number, c: number, v: string | number, bold = false, italic = false, align: "left" | "right" = "left") => {
    const cell = ws.getCell(r, c);
    cell.value = v;
    cell.font = { name: "Times New Roman", size: 11, bold, italic };
    cell.alignment = { horizontal: align, vertical: "middle" };
  };

  pasangGambar(wb, ws, p.logo, 0, 0, 84, 30);
  tulis(1, 3, "PT PLN (PERSERO) UIW NTB", true);
  tulis(2, 3, "UP3 MATARAM", true);
  tulis(3, 3, `ULP ${p.ulp}`, true);
  if (s.alamat) tulis(1, 6, s.alamat, true, false, "right");
  if (s.telepon) tulis(2, 6, `Tlp. ${s.telepon}`, true, false, "right");
  if (s.kotak_pos) tulis(3, 6, `Kotak Pos : ${s.kotak_pos}`, true, false, "right");

  const periode = labelBulan(p.tahun, p.bulan);
  tulis(6, 1, "Nomor");     tulis(6, 3, `: ${p.nomor}`);
  tulis(7, 1, "Lampiran");  tulis(7, 3, ": 1 Berkas");
  tulis(8, 1, "Perihal");   tulis(8, 3, `: Work Order YANTEK ${periode}`);
  tulis(6, 5, `${s.kota ?? p.ulp}, ${labelTanggal(p.tglSurat)}`);
  tulis(7, 5, "Kepada Yth.");
  tulis(8, 5, s.penerima ?? "");
  tulis(9, 5, "di");
  tulis(10, 5, `      ${s.penerima_kota ?? "Tempat"}`);

  ws.mergeCells(12, 1, 13, 6);
  tulis(12, 1,
    `Sehubungan dengan pekerjaan (Pemeliharaan Preventif dan Korektif) Pelayanan Teknik dengan pelaksana ${s.mitra ?? ""}, ` +
    `maka kami mengirimkan Work Order pekerjaan untuk bulan ${periode} sebagai berikut :`);
  ws.getCell(12, 1).alignment = { wrapText: true, vertical: "top" };
  ws.getRow(12).height = 20;
  ws.getRow(13).height = 20;

  let r = 15;
  p.baris.forEach(({ jenis, nilai }, i) => {
    ws.mergeCells(r, 1, r, 3);
    tulis(r, 1, `${i + 1}. ${jenis.nama}`, true, true);
    tulis(r, 4, ":", true);
    tulis(r, 5, fmtAngka(nilai, jenis.km), true, false, "right");
    tulis(r, 6, jenis.satuan, true, true);
    r++;
  });

  r++;
  tulis(r++, 1, "Demikian kami sampaikan agar dapat dilaksanakan SLA dalam kontrak YANTEK.");
  tulis(r++, 1, `Untuk bon material dan pemadaman tetap berkoordinasi dengan pihak PLN ULP ${p.ulp}`);
  if (s.cq) tulis(r++, 1, `Cq. ${s.cq}`);

  r++;
  tulis(r, 5, `Manager ULP ${p.ulp}`);
  pasangGambar(wb, ws, p.ttdManager, 4, r, 140, 58);
  r += 5;
  tulis(r, 5, s.nama_manager ?? "", true);
  ws.getCell(r, 5).font = { name: "Times New Roman", size: 11, bold: true, underline: true };

  const tembusan = (s.tembusan ?? "").split("\n").map((t) => t.trim()).filter(Boolean);
  if (tembusan.length > 0) {
    r += 2;
    tulis(r++, 1, "Tembusan");
    tembusan.forEach((t, i) => tulis(r++, 1, `${i + 1}. ${t}`));
  }
}

function sheetLampiran(wb: ExcelJS.Workbook, p: PaketSurat, l: Lampiran) {
  const km = l.jenis.km;
  const nama = l.jenis.nama.replace(/^WO /, "").slice(0, 31);
  const ws = wb.addWorksheet(nama, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const n = jumlahHari(p.tahun, p.bulan);
  // Kolom: No | kolom format (gardu / KMS / harjar) | 1..n
  const kolom = kolomLampiran(l.jenis);
  const kol = ["NO", ...kolom.map((k) => k.label)];
  const c0 = kol.length + 1;
  [5, ...kolom.map((k) => k.xls)].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  for (let d = 1; d <= n; d++) ws.getColumn(c0 + d - 1).width = 4.2;
  const akhir = c0 + n - 1;

  pasangGambar(wb, ws, p.logo, 0, 0, 84, 30);
  const judul = l.jenis.nama.replace(/^WO /, "").toUpperCase();
  [`RENCANA KERJA ${judul}`, `ULP ${p.ulp}`, `BULAN ${labelBulan(p.tahun, p.bulan).toUpperCase().replace(" ", " TAHUN ")}`]
    .forEach((t, i) => {
      ws.mergeCells(i + 1, 3, i + 1, akhir);
      const c = ws.getCell(i + 1, 3);
      c.value = t;
      c.font = { bold: true, size: 13 };
      c.alignment = { horizontal: "center" };
    });

  const H = { bold: true, size: 9, bgColor: CLR_HEADER };
  kol.forEach((k, i) => mergeSet(ws, 5, i + 1, 7, i + 1, k, H));
  mergeSet(ws, 5, c0, 5, akhir, "TARGET PELAKSANAAN", H);
  for (let d = 1; d <= n; d++) {
    const libur = p.libur.has(d);
    const a = ws.getCell(6, c0 + d - 1);
    a.value = d;
    styleCell(a, { ...H, size: 8 });
    const b = ws.getCell(7, c0 + d - 1);
    b.value = HARI_SINGKAT[new Date(p.tahun, p.bulan - 1, d).getDay()];
    styleCell(b, { bold: true, size: 6, bgColor: libur ? MERAH : CLR_HEADER, fontColor: libur ? CLR_WHITE : "000000" });
  }

  l.objek.forEach((o, i) => {
    const r = 8 + i;
    const bg = i % 2 ? SELANG : CLR_WHITE;
    const no = ws.getCell(r, 1);
    no.value = i + 1;
    styleCell(no, { size: 9, bgColor: bg });
    kolom.forEach((k, j) => {
      const c = ws.getCell(r, j + 2);
      // Angka tetap angka di Excel — bisa dijumlah ulang di sana.
      c.value = k.isi === "km" ? (o.km ?? "") : k.isi === "kva" ? (o.kva ?? "") : (o[k.isi] ?? "");
      styleCell(c, { size: 9, bgColor: bg, align: k.kanan ? "right" : "left", wrap: false });
      if (k.isi === "km") c.numFmt = "#,##0.000";
    });
    for (let d = 1; d <= n; d++) {
      const c = ws.getCell(r, c0 + d - 1);
      styleCell(c, { bgColor: l.hari[i] === d ? HIJAU : p.libur.has(d) ? MERAH : bg });
    }
  });

  let r = 8 + l.objek.length;
  // Jumlah di bawah kolom KMS (atau kolom objek untuk yang bersatuan gardu).
  const cJumlah = 2 + Math.max(0, kolom.findIndex((k) => k.isi === (km ? "km" : "objek")));
  const tot = ws.getCell(r, cJumlah);
  tot.value = `Jumlah: ${ringkasLampiran(l)}`;
  tot.font = { bold: true, size: 9 };

  r += 3;
  const kanan = Math.max(c0 + 8, akhir - 8);
  const teks = (row: number, col: number, v: string, bold = false) => {
    const c = ws.getCell(row, col);
    c.value = v;
    c.font = { size: 10, bold, underline: bold };
    c.alignment = { horizontal: "center" };
  };
  teks(r, kanan, `${p.set.kota ?? p.ulp}, ${labelTanggal(p.tglSurat)}`);
  teks(r + 1, 3, "Mengetahui");
  teks(r + 1, kanan, "Dibuat Oleh");
  teks(r + 2, 3, "Manajer");
  teks(r + 2, kanan, p.set.jabatan_tl);
  pasangGambar(wb, ws, p.ttdManager, 2, r + 2, 130, 52);
  pasangGambar(wb, ws, p.ttdTl, kanan - 3, r + 2, 130, 52);
  teks(r + 7, 3, p.set.nama_manager ?? "", true);
  teks(r + 7, kanan, p.set.nama_tl ?? "", true);

  // Kolom identitas dan kepala dibekukan — daftarnya bisa ratusan baris.
  ws.views = [{ state: "frozen", xSplit: kol.length, ySplit: 7 }];
}

export async function unduhExcelSurat(p: PaketSurat) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  sheetSurat(wb, p);
  p.lampiran.forEach((l) => sheetLampiran(wb, p, l));
  await downloadBuffer(wb, namaBerkas(p.ulp, p.tahun, p.bulan, "xlsx"));
}
