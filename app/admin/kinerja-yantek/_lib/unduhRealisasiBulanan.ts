import ExcelJS from "exceljs";
import { CLR_HEADER, CLR_WHITE, downloadBuffer, mergeSet, styleCell, type GayaSel } from "@/lib/xlsxGaya";
import { tambahHasilInspeksi, type IsiHasil } from "@/lib/hasilInspeksiExcel";
import { lembarPerabasan } from "@/app/admin/wo-perabasan/_lib/unduhExcel";
import { lembarPemeliharaan } from "@/app/admin/pemeliharaan-jaringan/_lib/unduhExcel";
import { lembarHargardu } from "@/app/admin/hargardu/_lib/unduhExcel";
import { lembarOptimasi } from "@/app/admin/optimasi-trafo/_lib/unduhExcel";
import { lembarPengukuran, lembarPenyeimbangan } from "@/app/admin/pengukuran-gardu/_utils/downloadXlsx";
import { lembarJtm } from "@/app/admin/jtm/_lib/unduhExcel";
import { lembarJtr } from "@/app/admin/jtr/_lib/unduhExcel";
import { BULAN, capaianSla, capaianWo, type BarisKinerja } from "./kinerjaMeta";
import type { BahanLampiran, BarisRealisasi } from "./ambilLampiran";

/**
 * Excel Realisasi Bulanan — lampiran tagihan (rencana-lampiran-tagihan.md):
 *
 *   "Rekap Realisasi"   tabel yang sama dengan Rekap Kinerja di layar.
 *   satu lembar / jenis  format unduhan MODULNYA (lembarX yang sama dengan
 *                        tombol Excel di modul itu), hanya pekerjaan disetujui.
 *   JTM & JTR            ringkas per segmen / per gardu, lalu Hasil Inspeksi
 *                        per tiang + Rekap Temuan (rute /api/export, bentuk=isi).
 *
 * Tanpa tautan foto (keputusan user 16 Okt 2026). Dimuat lewat import() saat
 * tombol ditekan — exceljs berukuran ratusan KB.
 */

const SELANG = "F5F5F5";
const fmt = (v: number | null, desimal: boolean) =>
  v === null ? "—" : desimal ? v.toFixed(2).replace(".", ",") : v.toLocaleString("id-ID");

function lembarRekap(wb: ExcelJS.Workbook, baris: BarisKinerja[], judul: string) {
  const ws = wb.addWorksheet("Rekap Realisasi", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: "frozen", ySplit: 3 }],
  });
  const KOLOM: { judul: string; lebar: number }[] = [
    { judul: "No", lebar: 4 },
    { judul: "Jenis pekerjaan", lebar: 34 },
    { judul: "Satuan", lebar: 10 },
    { judul: "WO terbit", lebar: 11 },
    { judul: "SLA", lebar: 10 },
    { judul: "Realisasi", lebar: 11 },
    { judul: "Belum disetujui", lebar: 11 },
    { judul: "Capaian WO", lebar: 10 },
    { judul: "Capaian SLA", lebar: 10 },
    { judul: "Keterangan", lebar: 60 },
  ];
  mergeSet(ws, 1, 1, 1, KOLOM.length, judul, { bold: true, size: 12, align: "left" });
  ws.getRow(1).height = 22;
  KOLOM.forEach((k, i) => {
    ws.getColumn(i + 1).width = k.lebar;
    mergeSet(ws, 3, i + 1, 3, i + 1, k.judul, { bold: true, size: 9, bgColor: CLR_HEADER });
  });
  ws.getRow(3).height = 28;

  baris.forEach((b, idx) => {
    const r = 4 + idx;
    const bg = idx % 2 === 0 ? CLR_WHITE : SELANG;
    const set = (c: number, v: string | number, extra?: GayaSel) => {
      const cell = ws.getCell(r, c);
      cell.value = v;
      styleCell(cell, { bgColor: bg, size: 9, ...extra });
    };
    const persen = (v: number | null) => (v === null ? "—" : `${v}%`);
    set(1, idx + 1);
    set(2, b.jenis, { align: "left", bold: true });
    set(3, b.satuan);
    set(4, b.dinilaiSla ? "—" : fmt(b.woTerbit, b.desimal), { align: "right" });
    set(5, fmt(b.sla, b.desimal), { align: "right" });
    set(6, fmt(b.realisasi, b.desimal), { align: "right", bold: true });
    set(7, fmt(b.belumApprove, b.desimal), { align: "right" });
    set(8, persen(capaianWo(b)), { align: "right" });
    set(9, persen(capaianSla(b)), { align: "right" });
    set(10, b.catatan, { align: "left" });
  });
  const r = 5 + baris.length;
  mergeSet(ws, r, 1, r, KOLOM.length,
    "Realisasi = pekerjaan yang sudah DISETUJUI. Lembar berikutnya merinci pekerjaan yang disetujui per jenis. " +
      "Tidak ada baris total — satuannya bercampur (KMS, gardu, pekerjaan).",
    { size: 9, align: "left", fontColor: "5D6D7E" });
}

/** Daftar sederhana (jenis yang belum punya unduhan modul: rabas di luar WO, tempelan dicentang). */
function lembarSederhana(
  wb: ExcelJS.Workbook,
  nama: string,
  kolom: { judul: string; lebar: number; kanan?: boolean }[],
  isi: (string | number)[][],
) {
  const ws = wb.addWorksheet(nama, { pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  kolom.forEach((k, i) => {
    ws.getColumn(i + 1).width = k.lebar;
    mergeSet(ws, 1, i + 1, 1, i + 1, k.judul, { bold: true, size: 9, bgColor: CLR_HEADER });
  });
  ws.getRow(1).height = 28;
  isi.forEach((baris, idx) => {
    const bg = idx % 2 === 0 ? CLR_WHITE : SELANG;
    baris.forEach((v, c) => {
      const cell = ws.getCell(2 + idx, c + 1);
      cell.value = v;
      styleCell(cell, { bgColor: bg, size: 9, align: kolom[c].kanan ? "right" : c === 0 ? "center" : "left" });
    });
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

const KOLOM_MANUAL = [
  { judul: "No", lebar: 4 },
  { judul: "Tanggal", lebar: 11 },
  { judul: "Objek", lebar: 30 },
  { judul: "Uraian / alamat", lebar: 40 },
  { judul: "KMS", lebar: 9, kanan: true },
  { judul: "Pelaksana", lebar: 22 },
];
const isiManual = (rows: BarisRealisasi[]) =>
  rows.map((m, i) => [i + 1, m.tgl, m.objek, m.rincian ?? "", m.km === null ? "" : m.km.toFixed(2).replace(".", ","), m.petugas ?? ""]);

async function isiPerTiang(url: string): Promise<IsiHasil | null> {
  const res = await fetch(url);
  if (res.status === 404) return null; // belum ada tiang untuk pilihan ini
  if (!res.ok) throw new Error(`Hasil inspeksi per tiang gagal dibaca (${res.status}).`);
  return (await res.json()) as IsiHasil;
}

export async function unduhRealisasiBulanan(
  ulp: string,
  tahun: number,
  bulan: number,
  rekap: BarisKinerja[],
  b: BahanLampiran,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART Mataram";
  const periode = `${BULAN[bulan - 1]} ${tahun}`;
  lembarRekap(wb, rekap, `REALISASI BULANAN YANTEK — ULP ${ulp} — ${periode}`);

  if (b.perabasan.length) lembarPerabasan(wb, b.perabasan, "Perabasan");
  if (b.luar.length) {
    lembarSederhana(
      wb,
      "Perabasan di Luar WO",
      [
        { judul: "No", lebar: 4 }, { judul: "Tanggal", lebar: 11 }, { judul: "ULP lokasi", lebar: 13 },
        { judul: "Penyulang", lebar: 16 }, { judul: "Jenis pohon", lebar: 18 }, { judul: "Lokasi", lebar: 34 },
        { judul: "Regu", lebar: 22 }, { judul: "Titik", lebar: 22 },
      ],
      b.luar.map((l, i) => [
        i + 1, l.tgl, l.ulp, l.penyulang, l.jenisPohon ?? "", l.lokasi ?? "", l.regu ?? "",
        l.lat !== null && l.lng !== null ? `${l.lat.toFixed(5)}, ${l.lng.toFixed(5)}` : "",
      ]),
    );
  }
  if (b.harjtm.length) {
    const ws = (lembarPemeliharaan(wb, b.harjtm, "Pemeliharaan Jaringan"), wb.getWorksheet("Pemeliharaan Jaringan"));
    // Kolom 12–13 = Foto Sebelum / Foto Sesudah — lampiran tagihan tanpa tautan foto.
    ws?.spliceColumns(12, 2);
  }
  if (b.hargardu.length) lembarHargardu(wb, b.hargardu, "Pemeliharaan Gardu");
  if (b.penyeimbangan.length) lembarPenyeimbangan(wb, b.penyeimbangan, "Penyeimbangan Beban");
  if (b.optimasi.length) lembarOptimasi(wb, b.optimasi, "Optimasi Trafo");
  if (b.pengukuran.length) await lembarPengukuran(wb, b.pengukuran, "Pengukuran & Tegangan Ujung");

  const jtm1 = b.jtm.filter((d) => d.tier !== "2");
  const jtm2 = b.jtm.filter((d) => d.tier === "2");
  for (const [daftar, label] of [[jtm1, "JTM"], [jtm2, "JTM Tier 2"]] as const) {
    if (!daftar.length) continue;
    lembarJtm(wb, daftar, `Inspeksi ${label} per Segmen`);
    const segmen = [...new Set(daftar.map((d) => d.segmen_id).filter((x): x is string => !!x))];
    const isi = await isiPerTiang(`/api/export/jtm?bentuk=isi&ulp=${encodeURIComponent(ulp)}&segmen=${segmen.join(",")}`);
    if (isi) tambahHasilInspeksi(wb, isi, `${label} Hasil per Tiang`, `${label} Rekap Temuan`);
  }
  const manualJtm2 = b.manual.filter((m) => m.kunci === "jtm2");
  if (manualJtm2.length) lembarSederhana(wb, "JTM Tier 2 (dicentang)", KOLOM_MANUAL, isiManual(manualJtm2));

  if (b.jtr.length) {
    lembarJtr(wb, b.jtr, "Inspeksi JTR per Gardu");
    const gardu = [...new Set(b.jtr.map((d) => d.gardu_kode))];
    const isi = await isiPerTiang(
      `/api/export/jtr?bentuk=isi&ulp=${encodeURIComponent(ulp)}&tahun=${tahun}&bulan=${bulan}&gardu_daftar=${gardu.map(encodeURIComponent).join(",")}`,
    );
    if (isi) tambahHasilInspeksi(wb, isi, "JTR Hasil per Tiang", "JTR Rekap Temuan");
  }

  for (const [kunci, nama] of [["igardu1", "Inspeksi Gardu Tier 1"], ["igardu2", "Inspeksi Gardu Tier 2"]] as const) {
    const rows = b.manual.filter((m) => m.kunci === kunci);
    if (rows.length) lembarSederhana(wb, nama, KOLOM_MANUAL, isiManual(rows));
  }

  await downloadBuffer(wb, `Realisasi_Bulanan_${ulp}_${tahun}-${String(bulan).padStart(2, "0")}.xlsx`);
}
