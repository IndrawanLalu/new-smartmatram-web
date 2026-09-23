import ExcelJS from "exceljs";
import { CLR_GREEN, CLR_HEADER, CLR_PINK, CLR_WHITE, downloadBuffer, mergeSet, styleCell, type GayaSel } from "@/lib/xlsxGaya";
import type { BarisTabel } from "../_hooks/useOptimasiTrafo";

/**
 * Unduhan Excel Optimasi Trafo — model sama dengan Rekap Penyeimbangan di
 * Pengukuran Gardu: blok SEBELUM (merah muda) dan SESUDAH (hijau)
 * berdampingan, kolom identitas dibekukan.
 *
 * Isinya PERSIS baris yang sedang tampil di tabel (ULP, periode, status, cari
 * yang sama) — yang diunduh sama dengan yang dilihat.
 *
 * Dimuat lewat `import()` saat tombol ditekan, bukan di awal halaman: exceljs
 * berukuran ratusan KB dan kebanyakan kunjungan tidak pernah mengunduh.
 */

const CLR_WO = "B3E5FC";

const COL = {
  no: 1, status: 2, sumber: 3, tglWo: 4, tglKerja: 5, ulp: 6, penyulang: 7, gardu: 8, alamat: 9,
  bKva: 10, bSeri: 11, bBeban: 12, bPct: 13, bTgl: 14,
  aKva: 15, aSeri: 16, aMerk: 17, aTahun: 18, aBeban: 19, aPct: 20, aTgl: 21,
  asal: 22, tujuan: 23, alasan: 24, petugas: 25, verifikasi: 26, catatan: 27,
};

const LEBAR: Record<number, number> = {
  [COL.no]: 4, [COL.status]: 13, [COL.sumber]: 9, [COL.tglWo]: 11, [COL.tglKerja]: 11,
  [COL.ulp]: 12, [COL.penyulang]: 12, [COL.gardu]: 9, [COL.alamat]: 28,
  [COL.bKva]: 6, [COL.bSeri]: 14, [COL.bBeban]: 7, [COL.bPct]: 7, [COL.bTgl]: 11,
  [COL.aKva]: 6, [COL.aSeri]: 14, [COL.aMerk]: 11, [COL.aTahun]: 6, [COL.aBeban]: 7, [COL.aPct]: 7, [COL.aTgl]: 11,
  [COL.asal]: 18, [COL.tujuan]: 18, [COL.alasan]: 18, [COL.petugas]: 16, [COL.verifikasi]: 16, [COL.catatan]: 32,
};

const tgl = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "");
const bulat = (v: number | null | undefined) => (v === null || v === undefined ? "" : Math.round(v * 10) / 10);

export async function unduhExcelOptimasi(baris: BarisTabel[], namaBerkas: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("Optimasi Trafo", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  for (const [c, w] of Object.entries(LEBAR)) ws.getColumn(Number(c)).width = w;
  ws.getRow(1).height = 20;
  ws.getRow(2).height = 26;

  const H: GayaSel = { bold: true, size: 9, bgColor: CLR_HEADER };
  const HWO: GayaSel = { ...H, bgColor: CLR_WO };
  const tunggal = (col: number, label: string, gaya: GayaSel = H) => mergeSet(ws, 1, col, 2, col, label, gaya);

  tunggal(COL.no, "No");
  tunggal(COL.status, "Status");
  tunggal(COL.sumber, "Sumber", HWO);
  tunggal(COL.tglWo, "Tgl WO", HWO);
  tunggal(COL.tglKerja, "Tgl\nPekerjaan");
  tunggal(COL.ulp, "ULP");
  tunggal(COL.penyulang, "Penyulang");
  tunggal(COL.gardu, "No. Gardu");
  tunggal(COL.alamat, "Alamat");
  mergeSet(ws, 1, COL.bKva, 1, COL.bTgl, "SEBELUM — trafo lama", { bold: true, size: 10, bgColor: CLR_PINK });
  mergeSet(ws, 1, COL.aKva, 1, COL.aTgl, "SESUDAH — trafo baru", { bold: true, size: 10, bgColor: CLR_GREEN });
  tunggal(COL.asal, "Trafo baru\ndari");
  tunggal(COL.tujuan, "Trafo lama\nke");
  tunggal(COL.alasan, "Alasan");
  tunggal(COL.petugas, "Petugas");
  tunggal(COL.verifikasi, "Diverifikasi /\ndibatalkan oleh");
  tunggal(COL.catatan, "Catatan / alasan batal", { ...H, align: "left" });

  const sub = (col: number, label: string, bg: string) => {
    const c = ws.getCell(2, col);
    c.value = label;
    styleCell(c, { bold: true, size: 8, bgColor: bg });
  };
  sub(COL.bKva, "kVA", CLR_PINK);
  sub(COL.bSeri, "No. Seri", CLR_PINK);
  sub(COL.bBeban, "Beban\nkVA", CLR_PINK);
  sub(COL.bPct, "%", CLR_PINK);
  sub(COL.bTgl, "Tgl Ukur", CLR_PINK);
  sub(COL.aKva, "kVA", CLR_GREEN);
  sub(COL.aSeri, "No. Seri", CLR_GREEN);
  sub(COL.aMerk, "Merk", CLR_GREEN);
  sub(COL.aTahun, "Tahun", CLR_GREEN);
  sub(COL.aBeban, "Beban\nkVA", CLR_GREEN);
  sub(COL.aPct, "%", CLR_GREEN);
  sub(COL.aTgl, "Tgl Ukur\nTerakhir", CLR_GREEN);

  baris.forEach((b, idx) => {
    const r = 3 + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    const bfg = idx % 2 === 0 ? "FFF0F5" : "FFE4EF";
    const afg = idx % 2 === 0 ? "F1F8F0" : "E8F5E9";
    const wog = idx % 2 === 0 ? "E1F5FE" : "D0EDF8";
    const set = (col: number, val: string | number, extra?: GayaSel) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };
    const pct = (col: number, v: number | null, dasar: string) =>
      set(col, bulat(v), { bold: true, bgColor: v !== null && v >= 80 ? "FFCDD2" : dasar });

    const c = b.catatan;
    const w = b.wo;

    set(COL.no, idx + 1);
    set(COL.status, b.status);
    set(COL.sumber, w || c?.pengukuranId ? "WO" : "Di luar WO", { bgColor: wog });
    set(COL.tglWo, tgl(w?.woSentAt), { bgColor: wog });
    set(COL.tglKerja, tgl(c?.tglOperasi));
    set(COL.ulp, b.ulp);
    set(COL.penyulang, b.penyulang ?? "");
    set(COL.gardu, b.kodeGardu, { align: "left" });
    set(COL.alamat, c?.alamat ?? w?.alamat ?? "", { align: "left" });

    // Sebelum — dari catatan kalau sudah dikerjakan, dari WO kalau belum.
    set(COL.bKva, c ? c.kvaLama : (w?.kvaMaster ?? w?.kvaTrafo ?? ""), { bgColor: bfg });
    set(COL.bSeri, c ? (c.seriLamaTakTerbaca ? "tak terbaca" : (c.noSeriLama ?? "")) : (w?.noSeriMaster ?? ""), { bgColor: bfg });
    set(COL.bBeban, bulat(c ? c.sebelumKvaBeban : w?.bebanKva), { bgColor: bfg });
    pct(COL.bPct, b.sebelumPersen, bfg);
    set(COL.bTgl, tgl(c ? c.sebelumTgl : w?.tglUkur), { bgColor: bfg });

    // Sesudah — hanya ada kalau sudah dikerjakan.
    set(COL.aKva, c?.kvaBaru ?? "", { bgColor: afg });
    set(COL.aSeri, c?.noSeriBaru ?? "", { bgColor: afg });
    set(COL.aMerk, c?.merkBaru ?? "", { bgColor: afg });
    set(COL.aTahun, c?.tahunBaru ?? "", { bgColor: afg });
    set(COL.aBeban, bulat(c?.sesudahKvaBeban), { bgColor: afg });
    pct(COL.aPct, c ? b.sesudahPersen : null, afg);
    set(COL.aTgl, tgl(c?.sesudahTgl), { bgColor: afg });

    set(COL.asal, c ? (c.asal === "GARDU" ? `Gardu ${c.asalKode} (${c.asalUlp})` : "Gudang") : "", { align: "left" });
    set(COL.tujuan, c
      ? c.tujuan === "GARDU" ? `Gardu ${c.tujuanKode} (${c.tujuanUlp})` : c.tujuan === "PERBAIKAN" ? "Perbaikan" : "Gudang"
      : "", { align: "left" });
    set(COL.alasan, c?.alasanLabel ?? "", { align: "left" });
    set(COL.petugas, c?.petugasNama ?? "", { align: "left" });
    set(COL.verifikasi, c?.verifiedBy ?? b.batal?.oleh ?? "", { align: "left" });
    set(COL.catatan, b.batal ? `WO dibatalkan: ${b.batal.alasan}` : (c?.catatan ?? ""), { align: "left" });
  });

  ws.views = [{ state: "frozen", xSplit: COL.gardu, ySplit: 2 }];
  await downloadBuffer(wb, namaBerkas);
}
