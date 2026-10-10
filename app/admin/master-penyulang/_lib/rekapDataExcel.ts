import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_TEAL, CLR_WHITE, downloadBuffer, mergeSet, styleCell } from "@/lib/xlsxGaya";
import type { Kelompok, PenyulangRekap, TotalRekap } from "../_hooks/useRekapData";

/**
 * Excel Rekap Data — bentuknya sama dengan tabel di layar: kepala dua baris
 * dengan judul kelompok bergabung, baris penyulang tebal, segmennya menjorok
 * di bawahnya, dan baris jumlah di akhir.
 */

type Sel = Pick<PenyulangRekap, "kms" | "tiang" | "gardu" | "gardu_kva" | "ukuran" | "jenis" | "jenis_tiang" | "peralatan">;

const FMT_KMS = "#,##0.000";

export async function unduhRekapData(penyulang: PenyulangRekap[], kelompok: Kelompok[], total: TotalRekap, ulp: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rekap Data", { views: [{ state: "frozen", xSplit: 2, ySplit: 4 }] });

  const kolomIsi = kelompok.flatMap((k) => k.kolom.map((c) => ({ k, c })));
  const jumlahKolom = 4 + kolomIsi.length + 2;

  mergeSet(ws, 1, 1, 1, jumlahKolom, `REKAP DATA JTM HASIL INSPEKSI — ${ulp.toUpperCase()}`, { bold: true, size: 12, align: "left" });
  ws.getRow(1).height = 22;

  // Kepala dua baris.
  const H = { bold: true, bgColor: CLR_HEADER };
  mergeSet(ws, 3, 1, 4, 1, "Penyulang / Segmen", H);
  mergeSet(ws, 3, 2, 4, 2, "ULP", H);
  mergeSet(ws, 3, 3, 4, 3, "kms", H);
  mergeSet(ws, 3, 4, 4, 4, "Tiang", H);
  let c = 5;
  for (const k of kelompok) {
    mergeSet(ws, 3, c, 3, c + k.kolom.length - 1, k.judul, { bold: true, bgColor: CLR_TEAL });
    k.kolom.forEach((o, i) => mergeSet(ws, 4, c + i, 4, c + i, o.label, { bold: true, bgColor: CLR_TEAL }));
    c += k.kolom.length;
  }
  mergeSet(ws, 3, c, 3, c + 1, "Gardu", { bold: true, bgColor: CLR_TEAL });
  mergeSet(ws, 4, c, 4, c, "Jumlah", { bold: true, bgColor: CLR_TEAL });
  mergeSet(ws, 4, c + 1, 4, c + 1, "kVA", { bold: true, bgColor: CLR_TEAL });

  ws.getColumn(1).width = 46;
  ws.getColumn(2).width = 13;
  for (let i = 3; i <= jumlahKolom; i++) ws.getColumn(i).width = 10;

  let r = 5;
  const tulis = (nama: string, ulpBaris: string, b: Sel, gaya: { bold?: boolean; bgColor?: string }) => {
    const nilai: (string | number | null)[] = [
      nama,
      ulpBaris,
      b.kms || null,
      b.tiang || null,
      ...kolomIsi.map(({ k, c: o }) => b[k.kunci][o.kode] || null),
      b.gardu || null,
      b.gardu_kva || null,
    ];
    nilai.forEach((v, i) => {
      const sel = ws.getCell(r, i + 1);
      sel.value = v;
      styleCell(sel, { ...gaya, bgColor: gaya.bgColor ?? CLR_WHITE, align: i < 2 ? "left" : "right", wrap: false });
      const kms = i === 2 || (i >= 4 && i < 4 + kolomIsi.length && kolomIsi[i - 4].k.satuan === "kms");
      if (kms) sel.numFmt = FMT_KMS;
    });
    r++;
  };

  for (const p of penyulang) {
    tulis(p.penyulang, p.ulp, p, { bold: true, bgColor: "E8F5E9" });
    for (const s of p.segmenDaftar) tulis(`    └ ${s.segmen ?? ""}`, "", s, {});
  }
  tulis("JUMLAH", "", total, { bold: true, bgColor: CLR_HEADER });

  const tgl = new Date().toISOString().slice(0, 10);
  await downloadBuffer(wb, `Rekap_Data_JTM_${ulp.replace(/\s+/g, "")}_${tgl}.xlsx`);
}
