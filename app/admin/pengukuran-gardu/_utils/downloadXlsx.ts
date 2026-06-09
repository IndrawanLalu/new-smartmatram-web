import ExcelJS from "exceljs";
import type { PengukuranGardu } from "../_hooks/usePengukuranGardu";
import type { PenyeimbanganGardu } from "../_hooks/usePenyeimbangan";

// ── Warna ──────────────────────────────────────────────────────────────────────
const CLR_PINK   = "F8BBD9";
const CLR_TEAL   = "B2DFDB";
const CLR_GREEN  = "C8E6C9";
const CLR_HEADER = "FFD966";
const CLR_BORDER = "BDBDBD";
const CLR_WHITE  = "FFFFFF";

// ── Helpers bersama ────────────────────────────────────────────────────────────

function styleCell(
  c: ExcelJS.Cell,
  opts: {
    bold?: boolean;
    size?: number;
    bgColor?: string;
    fontColor?: string;
    align?: ExcelJS.Alignment["horizontal"];
    wrap?: boolean;
  }
) {
  c.font = { bold: opts.bold ?? false, size: opts.size ?? 9, color: { argb: "FF" + (opts.fontColor ?? "000000") } };
  if (opts.bgColor) {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF" + opts.bgColor } };
  }
  c.alignment = { horizontal: opts.align ?? "center", vertical: "middle", wrapText: opts.wrap ?? true };
  c.border = {
    top:    { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    left:   { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    bottom: { style: "thin", color: { argb: "FF" + CLR_BORDER } },
    right:  { style: "thin", color: { argb: "FF" + CLR_BORDER } },
  };
}

function mergeSet(
  ws: ExcelJS.Worksheet,
  r1: number, c1: number, r2: number, c2: number,
  value: string,
  opts: Parameters<typeof styleCell>[1]
) {
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  const cell = ws.getCell(r1, c1);
  cell.value = value;
  styleCell(cell, opts);
}

async function downloadBuffer(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── buildJurusanSection ────────────────────────────────────────────────────────
// Shared builder: jurusan arus + beban total + teg gardu + % beban + suhu +
// tegangan ujung + pelaksana. Dipanggil oleh downloadXlsx DAN downloadWoGarduXlsx
// dengan startCol yang berbeda. Returns pelaksanaCol.

function buildJurusanSection(
  ws: ExcelJS.Worksheet,
  rows: PengukuranGardu[],
  jurusanKeys: string[],
  startCol: number,
  headerRow: number,
  dataRow: number
): number {
  const label = (key: string) =>
    key.toLowerCase() === "khusus" ? "Line Khusus" : `Line ${key}`;

  const nJur = jurusanKeys.length;
  const JAS  = startCol;                  // jurusan arus start
  const BTS  = JAS + nJur * 4;           // beban total start
  const TGS  = BTS + 4;                  // tegangan gardu start
  const TBC  = TGS + 6;                  // total beban (kVA)
  const PBC  = TBC + 1;                  // % beban
  const SC   = PBC + 1;                  // suhu (°C)
  const TUS  = SC  + 1;                  // tegangan ujung start
  const PC   = TUS + nJur * 3;          // pelaksana

  const r1 = headerRow;
  const r2 = r1 + 1;
  const r3 = r1 + 2;

  // Column widths
  for (let c = JAS; c < PC; c++) ws.getColumn(c).width = 5.5;
  ws.getColumn(PC).width = 13;

  // ── ROW 1 — grup besar ──────────────────────────────────────────────────────
  const H = { bold: true, size: 9, bgColor: CLR_HEADER };

  if (nJur > 0) mergeSet(ws, r1, JAS, r1, JAS + nJur * 4 - 1, "Jurusan",         { ...H, bgColor: CLR_PINK  });
  mergeSet(ws, r1, BTS, r1, BTS + 3,        "Beban Total",                        H);
  mergeSet(ws, r1, TGS, r1, TGS + 5,        "Tegangan Gardu",                     { ...H, bgColor: CLR_TEAL  });
  mergeSet(ws, r1, TBC, r3, TBC,            "Total\nBeban\n(kVA)",                H);
  mergeSet(ws, r1, PBC, r3, PBC,            "% Beban",                            H);
  mergeSet(ws, r1, SC,  r3, SC,             "Suhu\n(°C)",                         H);
  if (nJur > 0) mergeSet(ws, r1, TUS, r1, TUS + nJur * 3 - 1, "Tegangan Ujung", { ...H, bgColor: CLR_GREEN });
  mergeSet(ws, r1, PC,  r3, PC,             "Pelaksana",                          H);

  // ── ROW 2 — sub-grup per jurusan ────────────────────────────────────────────
  jurusanKeys.forEach((key, ji) => {
    const s = JAS + ji * 4;
    mergeSet(ws, r2, s, r2, s + 3, label(key),               { bold: true, size: 9, bgColor: CLR_PINK   });
  });
  mergeSet(ws, r2, BTS, r2, BTS + 3, "R / S / T / N",        { bold: true, size: 8, bgColor: CLR_HEADER });
  mergeSet(ws, r2, TGS, r2, TGS + 5, "R-N / S-N / T-N / R-S / S-T / R-T",
                                                               { bold: true, size: 8, bgColor: CLR_TEAL   });
  jurusanKeys.forEach((key, ji) => {
    const s = TUS + ji * 3;
    mergeSet(ws, r2, s, r2, s + 2, label(key),               { bold: true, size: 9, bgColor: CLR_GREEN  });
  });

  // ── ROW 3 — leaf headers ────────────────────────────────────────────────────
  const leaf = (col: number, lbl: string, bg: string) => {
    const c = ws.getCell(r3, col);
    c.value = lbl;
    styleCell(c, { bold: true, size: 8, bgColor: bg });
  };

  jurusanKeys.forEach((_, ji) => {
    const s = JAS + ji * 4;
    ["R","S","T","N"].forEach((ph, pi) => leaf(s + pi, ph, CLR_PINK));
  });
  ["R","S","T","N"].forEach((ph, i) => leaf(BTS + i, ph, CLR_HEADER));
  ["R-N","S-N","T-N","R-S","S-T","R-T"].forEach((ph, i) => leaf(TGS + i, ph, CLR_TEAL));
  jurusanKeys.forEach((_, ji) => {
    const s = TUS + ji * 3;
    ["R-N","S-N","T-N"].forEach((ph, pi) => leaf(s + pi, ph, CLR_GREEN));
  });

  // ── DATA ROWS ────────────────────────────────────────────────────────────────
  rows.forEach((row, idx) => {
    const r  = dataRow + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    ws.getRow(r).height = 14;

    const set = (col: number, val: string | number, extra?: Parameters<typeof styleCell>[1]) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };

    // Jurusan arus
    jurusanKeys.forEach((key, ji) => {
      const s   = JAS + ji * 4;
      const j   = row.perjurusan?.[key];
      const jbg = { bgColor: idx % 2 === 0 ? "FFF0F5" : "FFE4EF" };
      set(s,     j?.arus?.R != null ? Math.round(j.arus.R) : 0, jbg);
      set(s + 1, j?.arus?.S != null ? Math.round(j.arus.S) : 0, jbg);
      set(s + 2, j?.arus?.T != null ? Math.round(j.arus.T) : 0, jbg);
      set(s + 3, j?.arus?.N != null ? Math.round(j.arus.N) : 0, jbg);
    });

    // Beban Total
    set(BTS,     Math.round(row.total_arus_r));
    set(BTS + 1, Math.round(row.total_arus_s));
    set(BTS + 2, Math.round(row.total_arus_t));
    set(BTS + 3, Math.round(row.total_arus_n));

    // Tegangan Gardu
    set(TGS,     Math.round(row.total_teg_rn));
    set(TGS + 1, Math.round(row.total_teg_sn));
    set(TGS + 2, Math.round(row.total_teg_tn));
    set(TGS + 3, row.total_teg_rs != null ? Math.round(row.total_teg_rs) : "");
    set(TGS + 4, row.total_teg_st != null ? Math.round(row.total_teg_st) : "");
    set(TGS + 5, row.total_teg_rt != null ? Math.round(row.total_teg_rt) : "");

    // Total Beban & % Beban
    set(TBC, Math.round(row.beban_kva));
    const pct = Math.round(row.persen_beban);
    set(PBC, pct, {
      bold: pct >= 80,
      bgColor: pct >= 80 ? "FFCDD2" : pct < 20 ? "E3F2FD" : bg,
    });
    set(SC, row.suhu_trafo ?? "", {
      bgColor: (row.suhu_trafo ?? 0) > 60 ? "FFE0B2" : bg,
    });

    // Tegangan Ujung
    jurusanKeys.forEach((key, ji) => {
      const s   = TUS + ji * 3;
      const j   = row.perjurusan?.[key];
      const tbg = { bgColor: idx % 2 === 0 ? "F1F8F0" : "E8F5E9" };
      set(s,     j?.tegangan?.R != null ? Math.round(j.tegangan.R) : 0, tbg);
      set(s + 1, j?.tegangan?.S != null ? Math.round(j.tegangan.S) : 0, tbg);
      set(s + 2, j?.tegangan?.T != null ? Math.round(j.tegangan.T) : 0, tbg);
    });

    set(PC, row.petugas_nama ?? "");
  });

  return PC;
}

// ══════════════════════════════════════════════════════════════════════════════
// Download Rekap Pengukuran Gardu (tab Realisasi)
// ══════════════════════════════════════════════════════════════════════════════

export async function downloadXlsx(rows: PengukuranGardu[], filename: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws  = wb.addWorksheet("Pengukuran Gardu", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const jurusanKeys = [
    ...new Set(rows.flatMap((r) => Object.keys(r.perjurusan ?? {}))),
  ].sort();

  // Fixed column widths (6 cols)
  ws.getColumn(1).width = 4;   // No
  ws.getColumn(2).width = 13;  // Tgl Pengukuran
  ws.getColumn(3).width = 12;  // Penyulang
  ws.getColumn(4).width = 8;   // No Gardu
  ws.getColumn(5).width = 6;   // KVA
  ws.getColumn(6).width = 28;  // Alamat

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 15;

  const H = { bold: true, size: 9, bgColor: CLR_HEADER };

  // Fixed headers
  mergeSet(ws, 1,1, 3,1, "No",                  H);
  mergeSet(ws, 1,2, 3,2, "Tanggal\nPengukuran", H);
  mergeSet(ws, 1,3, 3,3, "Penyulang",           H);
  mergeSet(ws, 1,4, 1,5, "Gardu",               H);
  mergeSet(ws, 2,4, 3,4, "Nomor",               H);
  mergeSet(ws, 2,5, 3,5, "KVA",                 H);
  mergeSet(ws, 1,6, 3,6, "Alamat",              H);

  // Dynamic section starts at col 7
  buildJurusanSection(ws, rows, jurusanKeys, 7, 1, 4);

  // Fixed data rows
  rows.forEach((row, idx) => {
    const r  = 4 + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    const set = (col: number, val: string | number, extra?: Parameters<typeof styleCell>[1]) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };

    set(1, idx + 1);
    set(2, row.tanggal_pengukuran);
    set(3, row.penyulang ?? "");
    set(4, row.no_gardu);
    set(5, row.kva_trafo);
    set(6, row.alamat ?? "", { align: "left" });
  });

  ws.views = [{ state: "frozen", xSplit: 6, ySplit: 3 }];
  await downloadBuffer(wb, filename);
}

// ══════════════════════════════════════════════════════════════════════════════
// Download Gardu WO (tab Tindak Lanjut Anomali)
// ══════════════════════════════════════════════════════════════════════════════

export async function downloadWoGarduXlsx(rows: PengukuranGardu[], filename: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws  = wb.addWorksheet("Gardu WO", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const jurusanKeys = [
    ...new Set(rows.flatMap((r) => Object.keys(r.perjurusan ?? {}))),
  ].sort();

  // Fixed column widths (8 cols)
  ws.getColumn(1).width = 4;   // No
  ws.getColumn(2).width = 13;  // Tgl WO
  ws.getColumn(3).width = 18;  // Jenis Pemeliharaan
  ws.getColumn(4).width = 13;  // Tgl Pengukuran
  ws.getColumn(5).width = 12;  // Penyulang
  ws.getColumn(6).width = 10;  // No Gardu
  ws.getColumn(7).width = 6;   // KVA
  ws.getColumn(8).width = 30;  // Alamat

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 15;

  const H    = { bold: true, size: 9, bgColor: CLR_HEADER };
  const H_WO = { bold: true, size: 9, bgColor: "B3E5FC" };

  // Fixed headers — col 1–8, WO info pakai warna biru muda
  mergeSet(ws, 1,1, 3,1, "No",                  H);
  mergeSet(ws, 1,2, 3,2, "Tgl WO",              H_WO);
  mergeSet(ws, 1,3, 3,3, "Jenis\nPemeliharaan", H_WO);
  mergeSet(ws, 1,4, 3,4, "Tgl\nPengukuran",     H);
  mergeSet(ws, 1,5, 3,5, "Penyulang",           H);
  mergeSet(ws, 1,6, 3,6, "No. Gardu",           H);
  mergeSet(ws, 1,7, 3,7, "KVA",                 H);
  mergeSet(ws, 1,8, 3,8, "Alamat",              H);

  // Dynamic section starts at col 9 (sama persis dengan downloadXlsx)
  buildJurusanSection(ws, rows, jurusanKeys, 9, 1, 4);

  // Fixed data rows
  rows.forEach((row, idx) => {
    const r  = 4 + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    const wo = idx % 2 === 0 ? "E1F5FE"  : "D0EDF8"; // biru muda untuk WO cols
    const set = (col: number, val: string | number, extra?: Parameters<typeof styleCell>[1]) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };

    set(1, idx + 1);
    set(2, row.wo_sent_at ? row.wo_sent_at.split("T")[0] : "", { bgColor: wo });
    set(3, row.jenis_pemeliharaan ?? "",                        { bgColor: wo, align: "left" });
    set(4, row.tanggal_pengukuran);
    set(5, row.penyulang ?? "");
    set(6, row.no_gardu,     { align: "left" });
    set(7, row.kva_trafo);
    set(8, row.alamat ?? "", { align: "left" });
  });

  ws.views = [{ state: "frozen", xSplit: 8, ySplit: 3 }];
  await downloadBuffer(wb, filename);
}

// ══════════════════════════════════════════════════════════════════════════════
// Download Rekap Penyeimbangan Beban — struktur SEBELUM/SESUDAH, berbeda sendiri
// ══════════════════════════════════════════════════════════════════════════════

const CLR_BEFORE = "F8BBD9";
const CLR_AFTER  = "C8E6C9";
const CLR_DELTA  = "FFF9C4";

export async function downloadPenyeimbanganXlsx(
  rows: PenyeimbanganGardu[],
  filename: string
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws  = wb.addWorksheet("Rekap Penyeimbangan", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  const COL = {
    no: 1, tgl: 2, jenis: 3, gardu: 4, penyulang: 5, kva: 6, alamat: 7,
    bR: 8, bS: 9, bT: 10, bN: 11, bKva: 12, bPct: 13,
    aR: 14, aS: 15, aT: 16, aN: 17, aKva: 18, aPct: 19,
    delta: 20, petugas: 21, catatan: 22,
  };

  ws.getColumn(COL.no).width       = 4;
  ws.getColumn(COL.tgl).width      = 13;
  ws.getColumn(COL.jenis).width    = 18;
  ws.getColumn(COL.gardu).width    = 10;
  ws.getColumn(COL.penyulang).width = 12;
  ws.getColumn(COL.kva).width      = 6;
  ws.getColumn(COL.alamat).width   = 28;
  for (let c = COL.bR; c <= COL.aPct; c++) ws.getColumn(c).width = 7;
  ws.getColumn(COL.delta).width    = 8;
  ws.getColumn(COL.petugas).width  = 16;
  ws.getColumn(COL.catatan).width  = 30;

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 16;

  const H = { bold: true, size: 9, bgColor: CLR_HEADER };

  // ROW 1
  mergeSet(ws, 1,COL.no,       2,COL.no,       "No",                  H);
  mergeSet(ws, 1,COL.tgl,      2,COL.tgl,      "Tgl\nSeimbang",       H);
  mergeSet(ws, 1,COL.jenis,    2,COL.jenis,    "Jenis\nPemeliharaan", H);
  mergeSet(ws, 1,COL.gardu,    2,COL.gardu,    "No. Gardu",           H);
  mergeSet(ws, 1,COL.penyulang,2,COL.penyulang,"Penyulang",           H);
  mergeSet(ws, 1,COL.kva,      2,COL.kva,      "KVA",                 H);
  mergeSet(ws, 1,COL.alamat,   2,COL.alamat,   "Alamat",              H);
  mergeSet(ws, 1,COL.bR,       1,COL.bPct,     "SEBELUM",             { bold: true, size: 10, bgColor: CLR_BEFORE });
  mergeSet(ws, 1,COL.aR,       1,COL.aPct,     "SESUDAH",             { bold: true, size: 10, bgColor: CLR_AFTER  });
  mergeSet(ws, 1,COL.delta,    2,COL.delta,    "Delta\n%",            { ...H, bgColor: CLR_DELTA });
  mergeSet(ws, 1,COL.petugas,  2,COL.petugas,  "Petugas",             H);
  mergeSet(ws, 1,COL.catatan,  2,COL.catatan,  "Catatan / Keterangan",{ ...H, align: "left" });

  // ROW 2 sub-headers
  const leaf2 = (col: number, lbl: string, bg: string) => {
    const c = ws.getCell(2, col);
    c.value = lbl;
    styleCell(c, { bold: true, size: 8, bgColor: bg });
  };
  [COL.bR,COL.bS,COL.bT,COL.bN].forEach((col, i) => leaf2(col, ["R","S","T","N"][i], CLR_BEFORE));
  leaf2(COL.bKva, "KVA", CLR_BEFORE);
  leaf2(COL.bPct, "%",   CLR_BEFORE);
  [COL.aR,COL.aS,COL.aT,COL.aN].forEach((col, i) => leaf2(col, ["R","S","T","N"][i], CLR_AFTER));
  leaf2(COL.aKva, "KVA", CLR_AFTER);
  leaf2(COL.aPct, "%",   CLR_AFTER);

  // DATA ROWS
  rows.forEach((row, idx) => {
    const r   = 3 + idx;
    const bg  = idx % 2 === 0 ? CLR_WHITE : "F5F5F5";
    const bfg = idx % 2 === 0 ? "FFF0F5"  : "FFE4EF";
    const afg = idx % 2 === 0 ? "F1F8F0"  : "E8F5E9";
    ws.getRow(r).height = 14;

    const set = (col: number, val: string | number, extra?: Parameters<typeof styleCell>[1]) => {
      const c = ws.getCell(r, col);
      c.value = val;
      styleCell(c, { bgColor: bg, size: 9, ...extra });
    };

    const delta = Math.round(row.beban_pct_before) - Math.round(row.beban_pct_after);

    set(COL.no,        idx + 1);
    set(COL.tgl,       row.tgl_penyeimbangan);
    set(COL.jenis,     row.jenis_pemeliharaan ?? "", { align: "left" });
    set(COL.gardu,     row.no_gardu,    { align: "left" });
    set(COL.penyulang, row.penyulang ?? "");
    set(COL.kva,       row.kva_trafo);
    set(COL.alamat,    row.alamat ?? "", { align: "left" });

    set(COL.bR,   Math.round(row.arus_r_before),    { bgColor: bfg });
    set(COL.bS,   Math.round(row.arus_s_before),    { bgColor: bfg });
    set(COL.bT,   Math.round(row.arus_t_before),    { bgColor: bfg });
    set(COL.bN,   Math.round(row.arus_n_before),    { bgColor: bfg });
    set(COL.bKva, Math.round(row.beban_kva_before), { bgColor: bfg });
    set(COL.bPct, Math.round(row.beban_pct_before), {
      bold: true,
      bgColor: row.beban_pct_before >= 80 ? "FFCDD2" : bfg,
    });

    set(COL.aR,   Math.round(row.arus_r_after),    { bgColor: afg });
    set(COL.aS,   Math.round(row.arus_s_after),    { bgColor: afg });
    set(COL.aT,   Math.round(row.arus_t_after),    { bgColor: afg });
    set(COL.aN,   Math.round(row.arus_n_after),    { bgColor: afg });
    set(COL.aKva, Math.round(row.beban_kva_after), { bgColor: afg });
    set(COL.aPct, Math.round(row.beban_pct_after), {
      bold: true,
      bgColor: row.beban_pct_after >= 80 ? "FFCDD2" : afg,
    });

    set(COL.delta, delta, {
      bold: true,
      bgColor:   delta > 0 ? "DCEDC8" : delta < 0 ? "FFCDD2" : CLR_DELTA,
      fontColor: delta > 0 ? "2E7D32" : delta < 0 ? "C62828" : "000000",
    });

    set(COL.petugas, row.petugas_penyeimbang ?? "");
    set(COL.catatan, row.catatan ?? "", { align: "left" });
  });

  ws.views = [{ state: "frozen", xSplit: 7, ySplit: 2 }];
  await downloadBuffer(wb, filename);
}
