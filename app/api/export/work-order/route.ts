import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/auth";
import { fetchAllRows } from "@/lib/supabasePaginate";

interface WoColumnDef {
  key: string;
  label: string;
  hidden?: boolean;
}

interface ExportRow {
  data: Record<string, string> | null;
  regu: string | null;
  verifier_role: string | null;
  status: string;
  tgl_realisasi: string | null;
  selesai_by: string | null;
  selesai_alamat: string | null;
  catatan_petugas: string | null;
  verified_by: string | null;
  verified_at: string | null;
  sla_ok: boolean | null;
  verified_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
  urutan: number;
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function stage(r: ExportRow): string {
  if (r.approved_at) return "Disetujui";
  if (r.verified_at) return "Diverifikasi";
  if (r.status === "Selesai") return "Dikerjakan";
  return "Belum";
}

const safeName = (s: string) => s.replace(/[^\w\s-]/g, "").trim().slice(0, 60) || "WO";

// GET /api/export/work-order?batchId=...
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const batchId = new URL(req.url).searchParams.get("batchId");
  if (!batchId) return NextResponse.json({ error: "batchId wajib" }, { status: 400 });

  const { data: batch, error } = await supabaseAdmin
    .from("wo_batch")
    .select("judul, ulp, bulan, tahun, columns, measure_column, measure_unit")
    .eq("id", batchId)
    .single();

  if (error || !batch) return NextResponse.json({ error: "WO tidak ditemukan" }, { status: 404 });
  if (user.role !== "UP3" && batch.ulp !== user.unit) {
    return NextResponse.json({ error: "WO ini di luar unit Anda" }, { status: 403 });
  }

  const rows = await fetchAllRows<ExportRow>(() =>
    supabaseAdmin
      .from("wo_item")
      .select(
        "data, regu, verifier_role, status, tgl_realisasi, selesai_by, selesai_alamat, catatan_petugas, verified_by, verified_at, sla_ok, verified_note, approved_by, approved_at, urutan",
      )
      .eq("batch_id", batchId)
      .order("urutan", { ascending: true })
      .order("id", { ascending: true }),
  );

  const cols: WoColumnDef[] = ((batch.columns ?? []) as WoColumnDef[]).filter((c) => !c.hidden);

  const wb = new ExcelJS.Workbook();
  wb.creator = "SMART-Mataram";
  wb.created = new Date();
  const ws = wb.addWorksheet("Work Order", {
    views: [{ state: "frozen", ySplit: 4, xSplit: 1 }],
  });

  // Judul laporan
  const periode = `${MONTHS[batch.bulan - 1] ?? batch.bulan} ${batch.tahun}`;
  ws.mergeCells(1, 1, 1, cols.length + 12);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = batch.judul || "Work Order";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF004D40" } };

  ws.mergeCells(2, 1, 2, cols.length + 12);
  const subCell = ws.getCell(2, 1);
  subCell.value = `ULP ${batch.ulp} · ${periode} · diekspor ${new Date().toLocaleString("id-ID")}`;
  subCell.font = { size: 10, color: { argb: "FF5D6D7E" } };

  const header = [
    "No",
    ...cols.map((c) =>
      c.key === batch.measure_column && batch.measure_unit
        ? `${c.label} (${batch.measure_unit})`
        : c.label,
    ),
    "Regu",
    "Verifikator (role)",
    "Tahap",
    "Status",
    "Tgl Realisasi",
    "Petugas Penyelesai",
    "Lokasi Penyelesaian",
    "Catatan Petugas",
    "Diverifikasi Oleh",
    "SLA",
    "Catatan Verifikasi",
    "Disetujui Oleh",
  ];

  ws.addRow([]);
  const headerRow = ws.addRow(header);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: "FF00695C" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2F1" } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFB2DFDB" } } };
  });

  rows.forEach((r, i) => {
    const data = r.data ?? {};
    ws.addRow([
      i + 1,
      ...cols.map((c) => data[c.key] ?? ""),
      r.regu ?? "",
      r.verifier_role ?? "",
      stage(r),
      r.status,
      r.tgl_realisasi ?? "",
      r.selesai_by ?? "",
      r.selesai_alamat ?? "",
      r.catatan_petugas ?? "",
      r.verified_by ?? "",
      r.sla_ok === null ? "" : r.sla_ok ? "Sesuai" : "Tidak sesuai",
      r.verified_note ?? "",
      r.approved_by ?? "",
    ]);
  });

  ws.columns.forEach((col, i) => {
    col.width = i === 0 ? 6 : Math.min(34, Math.max(12, String(header[i] ?? "").length + 6));
  });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: header.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `WO_${safeName(batch.judul)}_${batch.bulan}-${batch.tahun}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
