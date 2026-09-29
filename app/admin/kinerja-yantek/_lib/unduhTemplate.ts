import ExcelJS from "exceljs";
import { CLR_HEADER, downloadBuffer, styleCell } from "@/lib/xlsxGaya";
import { kolomLampiran, type JenisSurat } from "./woSurat";

/**
 * Template KOSONG untuk tempel WO — hanya judul kolom sesuai format jenisnya
 * (keputusan user 29 Sep 2026: tanpa isi master, karena segmen di sistem
 * belum lengkap). Judulnya sama persis dengan yang dikenali penempel, jadi
 * blok tabelnya tinggal disalin kembali ke layar Tempel.
 * Dimuat lewat import() saat tombol ditekan.
 */

const BARIS_KOSONG = 30;

export async function unduhTemplate(j: JenisSurat, tier?: boolean) {
  const kolom = kolomLampiran(j);
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("WO", { views: [{ state: "frozen", ySplit: 1 }] });

  kolom.forEach((k, i) => {
    ws.getColumn(i + 1).width = k.xls;
    const c = ws.getCell(1, i + 1);
    c.value = k.label;
    styleCell(c, { bold: true, size: 10, bgColor: CLR_HEADER });
    for (let r = 2; r <= BARIS_KOSONG + 1; r++) {
      const s = ws.getCell(r, i + 1);
      styleCell(s, { size: 10, align: k.kanan ? "right" : "left", wrap: false });
      if (k.isi === "km") s.numFmt = "#,##0.000";
    }
  });
  ws.getRow(1).height = 20;

  // Petunjuk di samping tabel — tidak ikut tersalin kalau yang diblok hanya tabelnya.
  const catatan = [
    "Isi mulai baris 2. Blok tabel TERMASUK baris judul, salin, lalu tempel di SMART.",
    tier ? "Keterangan: tulis Tier 1 atau Tier 2 — keduanya boleh dalam satu tempelan." : "",
    j.penyulang ? "Penyulang wajib diisi — segmen milik satu penyulang di Master Penyulang." : "",
    j.format === "gardu" ? "Gardu = kode gardu di Master Gardu (mis. AM006)." : "",
    "Tanggal kerja tidak perlu diisi — dibagi rata otomatis ke hari efektif.",
  ].filter(Boolean);
  catatan.forEach((t, i) => {
    const c = ws.getCell(i + 1, kolom.length + 2);
    c.value = t;
    c.font = { italic: true, size: 9, color: { argb: "FF5D6D7E" } };
  });
  ws.getColumn(kolom.length + 2).width = 70;

  await downloadBuffer(wb, `Template_${j.nama.replace(/^WO /, "").replace(/\s+/g, "_")}.xlsx`);
}
