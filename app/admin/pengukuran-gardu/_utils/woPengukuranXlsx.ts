import ExcelJS from "exceljs";
import { LABEL_ALASAN } from "../_lib/kandidatWo";
import type { BarisTampil } from "../_components/TabelWoPengukuran";

/**
 * Ekspor WO Pengukuran ke .xlsx.
 *
 * Satu sheet: blok keterangan di atas, lalu tabel. Isinya persis yang sedang
 * tampil di layar — termasuk saringan yang sedang aktif — supaya berkas yang
 * diunduh selalu bisa dicocokkan dengan apa yang dilihat saat mengunduh.
 */

const WARNA_HEADER = "1D3573";
const WARNA_BORDER = "BDBDBD";
const WARNA_ZEBRA = "F5F7FA";
const WARNA_SELESAI = "DCFCE7";

interface Kolom {
  judul: string;
  lebar: number;
  /** Rata kanan untuk angka, tengah untuk tanggal & status. */
  rata?: "left" | "center" | "right";
}

const KOLOM: Kolom[] = [
  { judul: "No",              lebar: 5,  rata: "center" },
  { judul: "Kode Gardu",      lebar: 12 },
  { judul: "Nama",            lebar: 30 },
  { judul: "Alamat",          lebar: 34 },
  { judul: "Penyulang",       lebar: 16 },
  { judul: "kVA",             lebar: 8,  rata: "right" },
  { judul: "ULP",             lebar: 14 },
  { judul: "Terakhir Diukur", lebar: 14, rata: "center" },
  { judul: "Umur (bln)",      lebar: 10, rata: "center" },
  { judul: "Alasan",          lebar: 20 },
  { judul: "Tgl WO",          lebar: 12, rata: "center" },
  { judul: "Tgl Realisasi",   lebar: 13, rata: "center" },
  { judul: "Petugas",         lebar: 22 },
  { judul: "Status",          lebar: 10, rata: "center" },
];

const TEPI: ExcelJS.Borders = {
  top:    { style: "thin", color: { argb: "FF" + WARNA_BORDER } },
  left:   { style: "thin", color: { argb: "FF" + WARNA_BORDER } },
  bottom: { style: "thin", color: { argb: "FF" + WARNA_BORDER } },
  right:  { style: "thin", color: { argb: "FF" + WARNA_BORDER } },
  diagonal: { style: undefined },
};

/** YYYY-MM-DD → DD-MM-YYYY. Ditulis sebagai teks, bukan tanggal Excel: kolomnya
 *  dibaca manusia dan tidak pernah dihitung, sementara tanggal Excel akan
 *  tampil berbeda-beda mengikuti setelan wilayah tiap komputer. */
function fmtTgl(s: string | null): string {
  if (!s) return "";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

export interface MetaWoXlsx {
  /** Mis. "September 2026". */
  periode: string;
  /** Mis. "AMPENAN" atau "Semua ULP". */
  ulp: string;
  /** NULL kalau yang diekspor masih pratinjau. */
  tglWo: string | null;
  total: number;
  terealisasi: number;
}

export async function downloadWoPengukuranXlsx(
  rows: BarisTampil[],
  meta: MetaWoXlsx,
  filename: string,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";

  const ws = wb.addWorksheet("WO Pengukuran", {
    views: [{ state: "frozen", ySplit: 5 }],
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  KOLOM.forEach((k, i) => { ws.getColumn(i + 1).width = k.lebar; });

  const lebarTotal = KOLOM.length;

  // ── Blok keterangan ──
  ws.mergeCells(1, 1, 1, lebarTotal);
  const judul = ws.getCell(1, 1);
  judul.value = meta.tglWo ? "WORK ORDER PENGUKURAN GARDU" : "PRATINJAU KANDIDAT WO PENGUKURAN";
  judul.font = { bold: true, size: 13, color: { argb: "FF" + WARNA_HEADER } };
  judul.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 24;

  ws.mergeCells(2, 1, 2, lebarTotal);
  const baris2 = ws.getCell(2, 1);
  baris2.value =
    `ULP: ${meta.ulp}     Periode: ${meta.periode}` +
    (meta.tglWo ? `     Tanggal WO: ${fmtTgl(meta.tglWo)}` : "     (belum diterbitkan)");
  baris2.font = { size: 10 };
  baris2.alignment = { horizontal: "center" };

  ws.mergeCells(3, 1, 3, lebarTotal);
  const persen = meta.total > 0 ? Math.round((meta.terealisasi / meta.total) * 100) : 0;
  const baris3 = ws.getCell(3, 1);
  baris3.value = `Jumlah: ${meta.total} gardu     Realisasi: ${meta.terealisasi} gardu (${persen}%)`;
  baris3.font = { size: 10, bold: true };
  baris3.alignment = { horizontal: "center" };

  // ── Kepala tabel ──
  const BARIS_KEPALA = 5;
  const kepala = ws.getRow(BARIS_KEPALA);
  kepala.height = 22;
  KOLOM.forEach((k, i) => {
    const c = kepala.getCell(i + 1);
    c.value = k.judul;
    c.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + WARNA_HEADER } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = TEPI;
  });

  // ── Isi ──
  rows.forEach((r, idx) => {
    const nomorBaris = BARIS_KEPALA + 1 + idx;
    const selesai = !!r.tgl_realisasi;
    const nilai: (string | number)[] = [
      idx + 1,
      r.kode_gardu,
      r.nama ?? "",
      r.alamat ?? "",
      r.penyulang ?? "",
      r.kva_master ?? "",
      r.ulp,
      fmtTgl(r.tgl_ukur_terakhir),
      r.umur_bulan ?? "",
      LABEL_ALASAN[r.alasan],
      fmtTgl(r.tgl_wo),
      fmtTgl(r.tgl_realisasi),
      r.petugas_nama ?? "",
      selesai ? "Selesai" : "Belum",
    ];

    const baris = ws.getRow(nomorBaris);
    nilai.forEach((v, i) => {
      const c = baris.getCell(i + 1);
      c.value = v;
      c.font = { size: 9 };
      c.alignment = { horizontal: KOLOM[i].rata ?? "left", vertical: "middle", wrapText: false };
      c.border = TEPI;
      // Baris selesai diberi latar hijau samar. Zebra tetap dipakai untuk
      // sisanya supaya mata tidak kehilangan baris pada tabel selebar ini.
      const latar = selesai ? WARNA_SELESAI : idx % 2 === 1 ? WARNA_ZEBRA : null;
      if (latar) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + latar } };
    });
  });

  ws.autoFilter = {
    from: { row: BARIS_KEPALA, column: 1 },
    to: { row: BARIS_KEPALA + rows.length, column: lebarTotal },
  };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
