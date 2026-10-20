import { CLR_HEADER, downloadBuffer, styleCell } from "@/lib/xlsxGaya";
import type { UsulanJtr } from "../_hooks/useUsulanJtr";
import { LABEL_RENCANA } from "../_lib/rencanaJtr";
import { labelBulanWo } from "./bulanWo";

/** Excel daftar usulan perbaikan JTR — terutama bahan perencanaan sisip gardu. */

const KOLOM: { judul: string; lebar: number; isi: (u: UsulanJtr, i: number) => string | number }[] = [
  { judul: "No", lebar: 5, isi: (_, i) => i + 1 },
  { judul: "ULP", lebar: 12, isi: (u) => u.ulp },
  { judul: "Penyulang", lebar: 14, isi: (u) => u.penyulang ?? "" },
  { judul: "Gardu", lebar: 10, isi: (u) => u.gardu_kode },
  { judul: "Jurusan", lebar: 8, isi: (u) => u.jurusan },
  { judul: "Pekerjaan", lebar: 18, isi: (u) => LABEL_RENCANA[u.pekerjaan] },
  { judul: "Usulan", lebar: 40, isi: (u) => u.ringkas },
  { judul: "Arus R/S/T (A)", lebar: 14, isi: (u) => [u.dasar.a_r, u.dasar.a_s, u.dasar.a_t].map((x) => Math.round(x ?? 0)).join("/") },
  { judul: "Trafo", lebar: 14, isi: (u) => `${u.dasar.kva ?? "-"} kVA (${Math.round(u.dasar.persen_beban ?? 0)}%)` },
  { judul: "Kabel", lebar: 16, isi: (u) => u.dasar.kabel ?? "" },
  { judul: "Terjauh (m)", lebar: 11, isi: (u) => Math.round(u.dasar.terjauh_m ?? 0) },
  { judul: "Rincian", lebar: 60, isi: (u) => u.dasar.rinci.join("\n") },
  { judul: "Material", lebar: 40, isi: (u) => u.material.filter((m) => m.jumlah > 0).map((m) => `${m.nama}: ${m.jumlah} ${m.satuan}`).join("\n") },
  { judul: "Catatan", lebar: 28, isi: (u) => u.catatan ?? "" },
  { judul: "Titik (lat, lng)", lebar: 24, isi: (u) => (u.titik_lat !== null ? `${u.titik_lat}, ${u.titik_lng}` : "") },
  { judul: "Tahap", lebar: 12, isi: (u) => u.tahap },
  { judul: "WO ke", lebar: 12, isi: (u) => u.regu ?? "" },
  { judul: "Bulan WO", lebar: 14, isi: (u) => (u.wo_bulan ? labelBulanWo(u.wo_bulan) : "") },
  { judul: "Diusulkan", lebar: 22, isi: (u) => `${u.dibuat_oleh ?? ""}, ${u.dibuat_at.slice(0, 10)}` },
];

export async function unduhUsulanJtr(daftar: UsulanJtr[], nama: string) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Usulan Perbaikan JTR");
  ws.columns = KOLOM.map((k) => ({ width: k.lebar }));
  const kepala = ws.addRow(KOLOM.map((k) => k.judul));
  kepala.eachCell((c) => styleCell(c, { bold: true, bgColor: CLR_HEADER }));
  daftar.forEach((u, i) => {
    const baris = ws.addRow(KOLOM.map((k) => k.isi(u, i)));
    baris.eachCell((c) => styleCell(c, { align: "left" }));
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  await downloadBuffer(wb, nama);
}
