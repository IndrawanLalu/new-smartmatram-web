import { NextResponse } from "next/server";
import { prediksiLokasi } from "@/lib/prediksiGangguan/hitung";
import { ambilPeristiwa, temuanUntuk } from "@/lib/prediksiGangguan/peristiwa";
import { daftarTemuan } from "@/lib/prediksiGangguan/temuan";
import { trafoPenyulang } from "@/lib/prediksiGangguan/sumber";
import { akses } from "../_akses";

export const dynamic = "force-dynamic";

// GET /api/prediksi-lokasi/hitung?kunci=S|BUNG KARNO|2026-10-28|14:54:00
export async function GET(req: Request) {
  const a = await akses();
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const kunci = new URL(req.url).searchParams.get("kunci") ?? "";
  try {
    const p = await ambilPeristiwa(kunci);
    if (!p) return NextResponse.json({ error: "Gangguan tidak ditemukan." }, { status: 404 });
    if (a.unit && p.ulp && p.ulp !== a.unit) return NextResponse.json({ error: "Gangguan ULP lain." }, { status: 403 });
    const temuan = temuanUntuk(p, await daftarTemuan(p.tanggal, p.tanggal, null)) ?? null;
    // Gangguan bertemuan dinilai tanpa kalibrasi dari dirinya sendiri — sama dengan rapor.
    const hasil = await prediksiLokasi({
      penyulang: p.penyulang, keypoint: p.keypoint, kunci: p.kunci, arus: p.arus, bebanKw: p.bebanKw,
      trafoGi: p.trafoGi ?? (await trafoPenyulang(p.penyulang)),
      kecualiTemuan: temuan?.id, tiangTemuan: temuan?.tiang_id ?? undefined,
    });
    return NextResponse.json({ peristiwa: p, hasil, temuan });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
