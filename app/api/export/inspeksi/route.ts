import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentUser } from "@/lib/auth";
import ExcelJS from "exceljs";

const INSPEKSI_FIELDS =
  "id, penyulang, lokasi, temuan, status, category, tgl_inspeksi, nama_inspektor, eksekutor, ulp, koordinat, foto_sebelum_url, foto_lokasi_url";
const POHON_FIELDS =
  "id, penyulang, lokasi, deskripsi, status, tingkat_risiko, tgl_inspeksi, nama_inspektor, eksekutor, ulp, koordinat, foto_sebelum_url, foto_lokasi_url";

function mapsUrl(koordinat: string | null | undefined): string | null {
  if (!koordinat) return null;
  const parts = koordinat.split(",");
  if (parts.length < 2) return null;
  const lat = parseFloat(parts[0].trim());
  const lng = parseFloat(parts[1].trim());
  if (isNaN(lat) || isNaN(lng)) return null;
  return `https://maps.google.com/?q=${lat},${lng}`;
}

async function fetchImageBuffer(
  url: string
): Promise<{ buffer: Buffer; extension: "jpeg" | "png" | "gif" } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const ct  = res.headers.get("content-type") ?? "";
    const ext = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : "jpeg";
    return { buffer: Buffer.from(await res.arrayBuffer()), extension: ext };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp           = new URL(req.url).searchParams;
  const jenis        = sp.get("jenis") ?? "jaringan";
  const search       = sp.get("search") ?? "";
  const startDate    = sp.get("startDate") ?? "";
  const endDate      = sp.get("endDate") ?? "";
  const ulp          = sp.get("ulp") ?? "";
  const penyulang    = sp.get("penyulang") ?? "";
  const status       = sp.get("status") ?? "";
  const category     = sp.get("category") ?? "";
  const tingkatRisiko = sp.get("tingkat_risiko") ?? "";

  const isJaringan = jenis !== "pohon";
  const table      = isJaringan ? "inspeksi" : "inspeksi_pohon";
  const fields     = isJaringan ? INSPEKSI_FIELDS : POHON_FIELDS;

  let qb = supabaseAdmin.from(table).select(fields);

  if (user.role !== "UP3" && user.unit) qb = qb.eq("ulp", user.unit);
  if (ulp)          qb = qb.eq("ulp", ulp);
  if (penyulang)    qb = qb.ilike("penyulang", `%${penyulang}%`);
  if (status)       qb = qb.eq("status", status);
  if (startDate)    qb = qb.gte("tgl_inspeksi", startDate);
  if (endDate)      qb = qb.lte("tgl_inspeksi", endDate);
  if (isJaringan && category)     qb = qb.eq("category", category);
  if (!isJaringan && tingkatRisiko) qb = qb.eq("tingkat_risiko", tingkatRisiko);
  if (search) {
    const q = `%${search}%`;
    qb = isJaringan
      ? qb.or(`penyulang.ilike.${q},lokasi.ilike.${q},temuan.ilike.${q}`)
      : qb.or(`penyulang.ilike.${q},lokasi.ilike.${q},deskripsi.ilike.${q}`);
  }

  const { data, error } = await qb.order("tgl_inspeksi", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as Record<string, string>[];

  // ── Build Excel ──────────────────────────────────────────────────────────────

  const workbook = new ExcelJS.Workbook();
  const sheet    = workbook.addWorksheet(isJaringan ? "Inspeksi Jaringan" : "Inspeksi Pohon");

  sheet.columns = [
    { header: "No",                                        key: "no",       width: 5  },
    { header: "Tgl Inspeksi",                              key: "tgl",      width: 14 },
    { header: "ULP",                                       key: "ulp",      width: 14 },
    { header: "Penyulang",                                 key: "penyulang",width: 18 },
    { header: isJaringan ? "Temuan" : "Deskripsi",        key: "temuan",   width: 35 },
    { header: "Lokasi / Alamat",                           key: "lokasi",   width: 30 },
    { header: "Titik Koordinat",                           key: "koordinat",width: 22 },
    { header: "Foto Sebelum",                              key: "foto1",    width: 25 },
    { header: "Foto Lokasi",                               key: "foto2",    width: 25 },
  ];

  // Header style
  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE0F2F1" } };
    cell.font      = { bold: true, color: { argb: "FF00695C" }, size: 11 };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border    = {
      top: { style: "thin" }, bottom: { style: "thin" },
      left: { style: "thin" }, right: { style: "thin" },
    };
  });

  // Data rows
  for (let i = 0; i < rows.length; i++) {
    const r        = rows[i];
    const rowIndex = i + 2; // 1-based, row 1 = header
    const row      = sheet.getRow(rowIndex);
    const maps     = mapsUrl(r.koordinat);

    row.getCell("no").value       = i + 1;
    row.getCell("tgl").value      = r.tgl_inspeksi ?? "";
    row.getCell("ulp").value      = r.ulp ?? "";
    row.getCell("penyulang").value = r.penyulang ?? "";
    row.getCell("temuan").value   = isJaringan ? (r.temuan ?? "") : (r.deskripsi ?? "");
    row.getCell("lokasi").value   = r.lokasi ?? "";

    if (maps) {
      row.getCell("koordinat").value = { text: maps, hyperlink: maps };
      row.getCell("koordinat").font  = { color: { argb: "FF0563C1" }, underline: true };
    } else {
      row.getCell("koordinat").value = r.koordinat ?? "";
    }

    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border    = {
        top: { style: "thin" }, bottom: { style: "thin" },
        left: { style: "thin" }, right: { style: "thin" },
      };
    });

    // Photos
    let hasImage = false;

    const fotoSebelum = r.foto_sebelum_url;
    const fotoLokasi  = r.foto_lokasi_url;

    if (fotoSebelum) {
      const img = await fetchImageBuffer(fotoSebelum);
      if (img) {
        const imgId = workbook.addImage({ buffer: img.buffer, extension: img.extension });
        sheet.addImage(imgId, { tl: { col: 7, row: i + 1 }, br: { col: 8, row: i + 2 } });
        hasImage = true;
      } else {
        row.getCell("foto1").value = fotoSebelum;
        row.getCell("foto1").font  = { color: { argb: "FF0563C1" }, underline: true };
      }
    }

    if (fotoLokasi) {
      const img = await fetchImageBuffer(fotoLokasi);
      if (img) {
        const imgId = workbook.addImage({ buffer: img.buffer, extension: img.extension });
        sheet.addImage(imgId, { tl: { col: 8, row: i + 1 }, br: { col: 9, row: i + 2 } });
        hasImage = true;
      } else {
        row.getCell("foto2").value = fotoLokasi;
        row.getCell("foto2").font  = { color: { argb: "FF0563C1" }, underline: true };
      }
    }

    if (hasImage) row.height = 85;
    else          row.height = 18;
  }

  const buffer   = await workbook.xlsx.writeBuffer();
  const label    = isJaringan ? "inspeksi-jaringan" : "inspeksi-pohon";
  const date     = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as Buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${label}-${date}.xlsx"`,
    },
  });
}
