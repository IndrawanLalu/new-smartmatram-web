import ExcelJS from "exceljs";
import type { PengukuranGardu } from "../_hooks/usePengukuranGardu";

// ── Warna ──────────────────────────────────────────────────────────────────────
const CLR_PINK   = "F8BBD9";
const CLR_TEAL   = "B2DFDB";
const CLR_GREEN  = "C8E6C9";
const CLR_HEADER = "FFD966";
const CLR_BORDER = "BDBDBD";
const CLR_WHITE  = "FFFFFF";

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

export async function downloadXlsx(rows: PengukuranGardu[], filename: string) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("Pengukuran Gardu", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 },
  });

  // ── Kumpulkan jurusan keys aktual dari data (sorted) ──────────────────────
  const jurusanKeys = [
    ...new Set(rows.flatMap((r) => Object.keys(r.perjurusan ?? {}))),
  ].sort();

  // Label tampilan: "A" → "Line A", "KHUSUS" → "Line Khusus", dsb
  const jurusanLabel = (key: string) =>
    key.toLowerCase() === "khusus" ? "Line Khusus" : `Line ${key}`;

  // ── Layout kolom ──────────────────────────────────────────────────────────
  // Fixed: No(1) Tgl(2) Penyulang(3) Nomor(4) KVA(5) Alamat(6)
  // Jurusan arus: tiap jur = 4 col (R,S,T,N)
  // Beban Total: 4 col (R,S,T,N)
  // Teg Gardu: 6 col (R-N,S-N,T-N,R-S,S-T,R-T)
  // Total Beban(kVA), % Beban
  // Tegangan Ujung: tiap jur = 3 col (R-N,S-N,T-N)
  // Pelaksana, Titik Koordinat

  const FIXED_START   = 1;  // kolom 1–6
  const JUR_ARUS_START = 7;
  const nJur = jurusanKeys.length;
  const BEBAN_TOT_START  = JUR_ARUS_START + nJur * 4;
  const TEG_GARDU_START  = BEBAN_TOT_START + 4;
  const TOT_BEBAN_COL    = TEG_GARDU_START + 6;
  const PCT_BEBAN_COL    = TOT_BEBAN_COL + 1;
  const TU_START         = PCT_BEBAN_COL + 1;
  const PELAKSANA_COL    = TU_START + nJur * 3;
  const KOORDINAT_COL    = PELAKSANA_COL + 1;

  // Set lebar kolom
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 13;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 8;
  ws.getColumn(5).width = 6;
  ws.getColumn(6).width = 28;
  for (let c = 7; c <= KOORDINAT_COL; c++) ws.getColumn(c).width = 5.5;
  ws.getColumn(PELAKSANA_COL).width  = 13;
  ws.getColumn(KOORDINAT_COL).width  = 16;

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 18;
  ws.getRow(3).height = 15;

  // ── ROW 1 — grup besar ────────────────────────────────────────────────────
  const H = { bold: true, size: 9, bgColor: CLR_HEADER };

  // No, Tanggal, Penyulang
  mergeSet(ws, 1,1, 3,1, "No",                  H);
  mergeSet(ws, 1,2, 3,2, "Tanggal\nPengukuran", H);
  mergeSet(ws, 1,3, 3,3, "Penyulang",           H);
  // Gardu (Nomor + KVA)
  mergeSet(ws, 1,4, 1,5, "Gardu", H);
  mergeSet(ws, 2,4, 3,4, "Nomor", H);
  mergeSet(ws, 2,5, 3,5, "KVA",   H);
  // Alamat
  mergeSet(ws, 1,6, 3,6, "Alamat", H);

  // Jurusan (arus) — pink
  if (nJur > 0) {
    mergeSet(ws, 1, JUR_ARUS_START, 1, JUR_ARUS_START + nJur * 4 - 1, "Jurusan",
      { ...H, bgColor: CLR_PINK });
  }

  // Beban Total
  mergeSet(ws, 1, BEBAN_TOT_START, 1, BEBAN_TOT_START + 3, "Beban Total", H);

  // Tegangan Gardu — biru
  mergeSet(ws, 1, TEG_GARDU_START, 1, TEG_GARDU_START + 5, "Tegangan Gardu",
    { ...H, bgColor: CLR_TEAL });

  // Total Beban & % Beban
  mergeSet(ws, 1, TOT_BEBAN_COL, 3, TOT_BEBAN_COL, "Total\nBeban\n(kVA)", H);
  mergeSet(ws, 1, PCT_BEBAN_COL, 3, PCT_BEBAN_COL, "% Beban", H);

  // Tegangan Ujung — hijau
  if (nJur > 0) {
    mergeSet(ws, 1, TU_START, 1, TU_START + nJur * 3 - 1, "Tegangan Ujung",
      { ...H, bgColor: CLR_GREEN });
  }

  // Pelaksana, Koordinat
  mergeSet(ws, 1, PELAKSANA_COL, 3, PELAKSANA_COL, "Pelaksana",      H);
  mergeSet(ws, 1, KOORDINAT_COL, 3, KOORDINAT_COL, "Titik Koordinat", H);

  // ── ROW 2 — sub-grup per jurusan ──────────────────────────────────────────
  jurusanKeys.forEach((key, ji) => {
    const start = JUR_ARUS_START + ji * 4;
    mergeSet(ws, 2, start, 2, start + 3, jurusanLabel(key),
      { bold: true, size: 9, bgColor: CLR_PINK });
  });

  // Beban Total sub-header (R,S,T,N) langsung di row 3
  mergeSet(ws, 2, BEBAN_TOT_START, 2, BEBAN_TOT_START + 3, "R / S / T / N",
    { bold: true, size: 8, bgColor: CLR_HEADER });

  // Tegangan Gardu sub-header
  mergeSet(ws, 2, TEG_GARDU_START, 2, TEG_GARDU_START + 5, "R-N / S-N / T-N / R-S / S-T / R-T",
    { bold: true, size: 8, bgColor: CLR_TEAL });

  // Tegangan Ujung per jurusan
  jurusanKeys.forEach((key, ji) => {
    const start = TU_START + ji * 3;
    mergeSet(ws, 2, start, 2, start + 2, jurusanLabel(key),
      { bold: true, size: 9, bgColor: CLR_GREEN });
  });

  // ── ROW 3 — leaf headers ──────────────────────────────────────────────────
  const leaf = (col: number, label: string, bg: string) => {
    const c = ws.getCell(3, col);
    c.value = label;
    styleCell(c, { bold: true, size: 8, bgColor: bg });
  };

  jurusanKeys.forEach((_, ji) => {
    const s = JUR_ARUS_START + ji * 4;
    ["R", "S", "T", "N"].forEach((ph, pi) => leaf(s + pi, ph, CLR_PINK));
  });

  ["R", "S", "T", "N"].forEach((ph, i) => leaf(BEBAN_TOT_START + i, ph, CLR_HEADER));
  ["R-N", "S-N", "T-N", "R-S", "S-T", "R-T"].forEach((ph, i) => leaf(TEG_GARDU_START + i, ph, CLR_TEAL));

  jurusanKeys.forEach((_, ji) => {
    const s = TU_START + ji * 3;
    ["R-N", "S-N", "T-N"].forEach((ph, pi) => leaf(s + pi, ph, CLR_GREEN));
  });

  // ── DATA ROWS ─────────────────────────────────────────────────────────────
  rows.forEach((row, idx) => {
    const r = 4 + idx;
    ws.getRow(r).height = 14;
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

    // Jurusan arus — pakai key aktual
    jurusanKeys.forEach((key, ji) => {
      const s = JUR_ARUS_START + ji * 4;
      const j = row.perjurusan?.[key];
      set(s,     j?.arus?.R != null ? Math.round(j.arus.R) : 0);
      set(s + 1, j?.arus?.S != null ? Math.round(j.arus.S) : 0);
      set(s + 2, j?.arus?.T != null ? Math.round(j.arus.T) : 0);
      set(s + 3, j?.arus?.N != null ? Math.round(j.arus.N) : 0);
    });

    // Beban Total
    set(BEBAN_TOT_START,     Math.round(row.total_arus_r));
    set(BEBAN_TOT_START + 1, Math.round(row.total_arus_s));
    set(BEBAN_TOT_START + 2, Math.round(row.total_arus_t));
    set(BEBAN_TOT_START + 3, Math.round(row.total_arus_n));

    // Tegangan Gardu
    set(TEG_GARDU_START,     Math.round(row.total_teg_rn));
    set(TEG_GARDU_START + 1, Math.round(row.total_teg_sn));
    set(TEG_GARDU_START + 2, Math.round(row.total_teg_tn));
    set(TEG_GARDU_START + 3, row.total_teg_rs != null ? Math.round(row.total_teg_rs) : "");
    set(TEG_GARDU_START + 4, row.total_teg_st != null ? Math.round(row.total_teg_st) : "");
    set(TEG_GARDU_START + 5, row.total_teg_rt != null ? Math.round(row.total_teg_rt) : "");

    // Total Beban & % Beban
    set(TOT_BEBAN_COL, Math.round(row.beban_kva));
    const pct = Math.round(row.persen_beban);
    set(PCT_BEBAN_COL, pct, {
      bold: pct >= 80,
      bgColor: pct >= 80 ? "FFCDD2" : pct < 20 ? "E3F2FD" : bg,
    });

    // Tegangan Ujung — pakai key aktual
    jurusanKeys.forEach((key, ji) => {
      const s = TU_START + ji * 3;
      const j = row.perjurusan?.[key];
      set(s,     j?.tegangan?.R != null ? Math.round(j.tegangan.R) : 0);
      set(s + 1, j?.tegangan?.S != null ? Math.round(j.tegangan.S) : 0);
      set(s + 2, j?.tegangan?.T != null ? Math.round(j.tegangan.T) : 0);
    });

    set(PELAKSANA_COL, row.petugas_nama ?? "");
    set(KOORDINAT_COL, "");
  });

  // Freeze panes: beku 6 kolom pertama + 3 baris header
  ws.views = [{ state: "frozen", xSplit: 6, ySplit: 3 }];

  // ── Download ──────────────────────────────────────────────────────────────
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
