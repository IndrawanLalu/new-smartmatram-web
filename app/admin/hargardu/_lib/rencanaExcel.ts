import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_WHITE, downloadBuffer, mergeSet, styleCell } from "@/lib/xlsxGaya";
import {
  duaBelasBulan, kunciBulan, kunciKeBulan, labelBulan,
  type BarisRencana, type BulanRencana, type GarduRencana, type IsiBerkas,
} from "./rencana";

/**
 * Templat Excel Rencana Pemeliharaan — dibuat aplikasi per ULP, bukan
 * disalin-salin antar ULP, supaya seragam dan kodenya pasti kode master.
 *
 *   Rencana    gardu master (terkunci) + kisi 12 bulan + Jumlah + Catatan
 *   Petunjuk   cara mengisi
 *   _meta      tersembunyi: penanda, versi, ULP, bulan awal, jumlah baris gardu
 *              — berkas ULP lain atau templat lama ditolak saat diunggah, dan
 *              baris hijau "Jumlah" (sel gabungan) tidak terbaca sebagai gardu
 */

const PENANDA = "SMART-RENCANA-HARGARDU";
const VERSI = 1;
const TANDA = "✓";

const KOLOM_TETAP: { judul: string; lebar: number }[] = [
  { judul: "No", lebar: 5 },
  { judul: "Kode Gardu", lebar: 11 },
  { judul: "Nama Gardu", lebar: 28 },
  { judul: "Penyulang", lebar: 16 },
  { judul: "Alamat", lebar: 28 },
  { judul: "kVA", lebar: 7 },
];
const JUDUL_BARIS = 3;
const ABU = "EEEEEE";
const HIJAU = "E2EFDA";

const kolomHuruf = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

const teks = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return "";
  if (typeof v === "object" && "text" in v) return String(v.text).trim();
  // Rumus (Jumlah, baris hijau): hasilnya, bukan isian — tanpa hasil = kosong.
  if (typeof v === "object" && "formula" in v) return String(("result" in v ? v.result : "") ?? "").trim();
  if (typeof v === "object" && "result" in v) return String(v.result ?? "").trim();
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("").trim();
  return String(v).trim();
};

interface OpsiTemplat {
  ulp: string;
  gardu: GarduRencana[];
  jendela: BulanRencana[];
  /** Rencana yang sudah tersimpan — templat unduhan ulang memuatnya, jadi revisi tidak mulai dari nol. */
  ada: Map<string, Set<string>>;
  catatan: Map<string, string>;
}

export async function unduhTemplatRencana({ ulp, gardu, jendela, ada, catatan }: OpsiTemplat) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const ws = wb.addWorksheet("Rencana", { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });

  const kBulan1 = KOLOM_TETAP.length + 1;
  const kJumlah = kBulan1 + jendela.length;
  const kCatatan = kJumlah + 1;
  const hBulan1 = kolomHuruf(kBulan1);
  const hBulan12 = kolomHuruf(kJumlah - 1);
  const baris1 = JUDUL_BARIS + 1;
  const barisAkhir = JUDUL_BARIS + gardu.length;
  const barisTotal = barisAkhir + 1;

  mergeSet(ws, 1, 1, 1, kCatatan,
    `RENCANA PEMELIHARAAN GARDU — ULP ${ulp} — ${labelBulan(jendela[0])} s.d. ${labelBulan(jendela[jendela.length - 1])}`,
    { bold: true, size: 12, align: "left", wrap: false });
  mergeSet(ws, 2, 1, 2, kCatatan,
    `Beri tanda ${TANDA} pada bulan gardu dipelihara (pilih dari daftar, atau ketik huruf apa saja). Satu gardu boleh lebih dari satu bulan. Kolom abu-abu jangan diubah.`,
    { size: 9, align: "left", wrap: false, fontColor: "595959" });
  ws.getRow(1).height = 22;

  [...KOLOM_TETAP, ...jendela.map((b) => ({ judul: labelBulan(b), lebar: 8 })), { judul: "Jumlah", lebar: 8 }, { judul: "Catatan", lebar: 30 }]
    .forEach((k, i) => {
      ws.getColumn(i + 1).width = k.lebar;
      mergeSet(ws, JUDUL_BARIS, i + 1, JUDUL_BARIS, i + 1, k.judul, { bold: true, size: 9, bgColor: CLR_HEADER });
    });
  ws.getRow(JUDUL_BARIS).height = 24;

  gardu.forEach((g, idx) => {
    const r = baris1 + idx;
    const kode = g.kode.toUpperCase();
    const tanda = ada.get(kode);
    const tetap: (string | number)[] = [idx + 1, g.kode, g.nama ?? "", g.penyulang ?? "", g.alamat ?? "", g.kva_master ?? ""];
    tetap.forEach((v, i) => {
      const c = ws.getCell(r, i + 1);
      c.value = v;
      styleCell(c, { size: 9, bgColor: ABU, align: i === 2 || i === 4 ? "left" : "center", wrap: false });
    });
    jendela.forEach((b, i) => {
      const c = ws.getCell(r, kBulan1 + i);
      c.value = tanda?.has(kunciBulan(b)) ? TANDA : null;
      styleCell(c, { size: 10, bold: true, bgColor: CLR_WHITE, fontColor: "375623" });
      c.protection = { locked: false };
      // Daftar pilihan, tapi ketikan lain tetap diterima (tidak ada pesan galat).
      c.dataValidation = { type: "list", allowBlank: true, formulae: [`"${TANDA}"`], showErrorMessage: false };
    });
    const j = ws.getCell(r, kJumlah);
    j.value = { formula: `COUNTA(${hBulan1}${r}:${hBulan12}${r})` };
    styleCell(j, { size: 9, bgColor: ABU });
    const n = ws.getCell(r, kCatatan);
    n.value = catatan.get(kode) ?? null;
    styleCell(n, { size: 9, bgColor: CLR_WHITE, align: "left", wrap: false });
    n.protection = { locked: false };
  });

  mergeSet(ws, barisTotal, 1, barisTotal, KOLOM_TETAP.length, "Jumlah gardu per bulan", { bold: true, size: 9, bgColor: HIJAU, align: "right" });
  for (let c = kBulan1; c <= kJumlah; c++) {
    const h = kolomHuruf(c);
    const sel = ws.getCell(barisTotal, c);
    sel.value = { formula: `${c === kJumlah ? "SUM" : "COUNTA"}(${h}${baris1}:${h}${barisAkhir})` };
    styleCell(sel, { bold: true, size: 9, bgColor: HIJAU });
  }
  styleCell(ws.getCell(barisTotal, kCatatan), { size: 9, bgColor: HIJAU });

  ws.views = [{ state: "frozen", xSplit: 2, ySplit: JUDUL_BARIS }];
  ws.autoFilter = { from: { row: JUDUL_BARIS, column: 1 }, to: { row: barisAkhir, column: kCatatan } };
  // Tanpa kata sandi: yang terlanjur perlu membuka kunci bisa, tapi tidak
  // tanpa sengaja. Server tetap memeriksa ulang semuanya saat unggah.
  await ws.protect("", { selectLockedCells: true, selectUnlockedCells: true, autoFilter: true, formatColumns: true });

  const p = wb.addWorksheet("Petunjuk");
  p.getColumn(1).width = 110;
  [
    `Rencana Pemeliharaan Gardu — ULP ${ulp}`,
    "",
    `1. Isi di lembar "Rencana": beri tanda ${TANDA} pada kolom bulan gardu itu dipelihara.`,
    "2. Satu gardu boleh diberi tanda di lebih dari satu bulan. Gardu yang tidak diberi tanda tidak direncanakan.",
    "3. Kolom abu-abu (kode, nama, penyulang, alamat, kVA) diambil dari Master Gardu — jangan diubah.",
    "   Gardu yang belum ada di daftar: daftarkan dulu di menu Master Gardu, lalu unduh templat lagi.",
    "4. Baris hijau di bawah menghitung jumlah gardu per bulan — sesuaikan dengan kemampuan regu.",
    "5. Unggah berkas ini di SMART: Pemeliharaan Gardu → WO Pemeliharaan → Rencana Pemeliharaan → Unggah rencana.",
    "6. Unggah ulang boleh kapan saja: bulan yang WO-nya belum terbit diganti seluruhnya, yang sudah terbit tidak berubah.",
    "7. Templat ini hanya untuk ULP dan periode di judulnya. Setelah bulan pertamanya lewat, unduh templat baru.",
  ].forEach((t, i) => {
    const c = p.getCell(i + 1, 1);
    c.value = t;
    c.font = { bold: i === 0, size: i === 0 ? 12 : 10 };
  });

  const m = wb.addWorksheet("_meta", { state: "veryHidden" });
  [PENANDA, VERSI, ulp, kunciBulan(jendela[0]), gardu.length].forEach((v, i) => { m.getCell(i + 1, 1).value = v; });

  await downloadBuffer(wb, `Rencana_Pemeliharaan_${ulp}_${kunciBulan(jendela[0])}.xlsx`);
}

/** Baca berkas templat. Pencocokan ke master & WO dilakukan `susunPratinjau`. */
export async function bacaTemplatRencana(file: File): Promise<IsiBerkas> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new Error("Berkas tidak terbaca sebagai Excel (.xlsx).");
  }

  const m = wb.getWorksheet("_meta");
  if (!m || teks(m.getCell(1, 1).value) !== PENANDA) {
    throw new Error("Ini bukan templat Rencana Pemeliharaan dari SMART. Unduh templatnya dari tombol Unduh templat.");
  }
  if (Number(teks(m.getCell(2, 1).value)) !== VERSI) throw new Error("Versi templat tidak dikenali — unduh templat terbaru.");
  const ulp = teks(m.getCell(3, 1).value).toUpperCase();
  const dari = kunciKeBulan(teks(m.getCell(4, 1).value));
  const jumlahGardu = Number(teks(m.getCell(5, 1).value));
  if (!ulp || !dari.tahun || !dari.bulan || !Number.isInteger(jumlahGardu)) {
    throw new Error("Penanda templat rusak — unduh templat terbaru.");
  }

  const ws = wb.getWorksheet("Rencana");
  if (!ws) throw new Error('Lembar "Rencana" tidak ditemukan di berkas.');

  const judul = new Map<string, number>();
  ws.getRow(JUDUL_BARIS).eachCell({ includeEmpty: false }, (c, col) => judul.set(teks(c.value).toUpperCase(), col));
  const kKode = judul.get("KODE GARDU");
  const kCatatan = judul.get("CATATAN");
  const jendela = duaBelasBulan(dari);
  const kBulan = jendela.map((b) => judul.get(labelBulan(b).toUpperCase()));
  if (!kKode || kBulan.some((k) => !k)) throw new Error("Judul kolom templat berubah — unduh templat terbaru dan salin tandanya.");

  const baris: BarisRencana[] = [];
  const terlihat = new Set<string>();
  const kembar = new Set<string>();
  const tanda = new Set<string>();
  // Hanya baris gardu: tepat di bawahnya ada baris "Jumlah" bergabung, yang
  // teksnya terbaca di kolom kode dan rumusnya di kolom bulan.
  for (let r = JUDUL_BARIS + 1; r <= JUDUL_BARIS + jumlahGardu; r++) {
    const row = ws.getRow(r);
    const kode = teks(row.getCell(kKode).value).toUpperCase();
    if (!kode) continue;
    if (terlihat.has(kode)) kembar.add(kode);
    terlihat.add(kode);
    const catatan = kCatatan ? teks(row.getCell(kCatatan).value) || null : null;
    jendela.forEach((b, i) => {
      if (!teks(row.getCell(kBulan[i]!).value)) return;
      const k = `${kode}|${kunciBulan(b)}`;
      if (tanda.has(k)) return;                           // gardu kembar, bulan sama
      tanda.add(k);
      baris.push({ kode, tahun: b.tahun, bulan: b.bulan, catatan });
    });
  }
  return { ulp, dari, baris, kembar: [...kembar].sort() };
}
