import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { UNITS } from "@/lib/roles";
import { JENIS_BUAT } from "@/lib/gambar/buat";
import { GagalLaporan, JENIS_LAPORAN, type JenisLaporan } from "@/lib/gambar/laporan";

/**
 * Gambar laporan (PNG 1920×1080) satu ULP, satu bulan.
 *   GET /api/gambar/<jenis>?ulp=AMPENAN&bulan=2026-10[&halaman=2][&unduh=1]
 *   jenis: lib/gambar/laporan.ts. Header `X-Jumlah-Halaman` = banyak halaman
 *   laporan itu (rating > 30 petugas dipecah). `unduh=1` → disajikan sebagai lampiran.
 * UP3 memilih ULP; peran lain selalu ULP sendiri, apa pun isi `ulp`.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ jenis: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jenis } = await params;
  if (!JENIS_LAPORAN.some((j) => j.kunci === jenis)) {
    return NextResponse.json({ error: `Jenis laporan tidak dikenal: ${jenis}` }, { status: 404 });
  }
  const sp = req.nextUrl.searchParams;
  const ulp = (user.role === "UP3" ? (sp.get("ulp") ?? "") : (user.unit ?? "")).toUpperCase();
  if (!UNITS.some((u) => u.value === ulp)) {
    return NextResponse.json({ error: "Pilih satu ULP (AMPENAN, CAKRANEGARA, GERUNG, TANJUNG)." }, { status: 400 });
  }
  const bulanArg = sp.get("bulan") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulanArg)) {
    return NextResponse.json({ error: "Parameter bulan harus YYYY-MM." }, { status: 400 });
  }
  const [tahun, bulan] = bulanArg.split("-").map(Number);
  const halaman = Math.max(1, Number(sp.get("halaman") ?? 1) || 1);

  try {
    const { gambar, jumlahHalaman } = await JENIS_BUAT[jenis as JenisLaporan](ulp, tahun, bulan, halaman);
    if (sp.get("unduh") === "1") {
      const akhiran = jumlahHalaman > 1 ? `-${halaman}` : "";
      gambar.headers.set("Content-Disposition", `attachment; filename="${jenis}-${ulp.toLowerCase()}-${bulanArg}${akhiran}.png"`);
    }
    gambar.headers.set("X-Jumlah-Halaman", String(jumlahHalaman));
    gambar.headers.set("Cache-Control", "private, no-store");
    return gambar;
  } catch (e) {
    const status = e instanceof GagalLaporan ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
