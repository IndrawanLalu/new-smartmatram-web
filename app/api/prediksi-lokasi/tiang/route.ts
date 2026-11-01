import { NextResponse } from "next/server";
import { jaringanUntuk } from "@/lib/prediksiGangguan/hitung";
import { akses } from "../_akses";

export const dynamic = "force-dynamic";

// GET /api/prediksi-lokasi/tiang?penyulang=BUNG KARNO → pilihan tiang lokasi temuan
export async function GET(req: Request) {
  const a = await akses();
  if (!a) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const penyulang = new URL(req.url).searchParams.get("penyulang") ?? "";
  try {
    const j = await jaringanUntuk(penyulang);
    if (!j) return NextResponse.json({ tiang: [] });
    const tiang = [...j.titik.values()].filter((t) => t.anggota)
      .map((t) => ({ id: t.id, kode: t.kode, km: Math.round(t.km * 100) / 100 }))
      .sort((x, y) => x.kode.localeCompare(y.kode, "id", { numeric: true }));
    return NextResponse.json({ tiang });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
