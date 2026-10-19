import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { UNITS } from "@/lib/roles";
import { JENIS_BUAT } from "@/lib/gambar/buat";
import { GagalLaporan, JENIS_LAPORAN, type JenisLaporan, type Permintaan } from "@/lib/gambar/laporan";

/**
 * Gambar laporan (PNG 1920×1080).
 *   Per bulan  : GET /api/gambar/<jenis>?ulp=AMPENAN&bulan=2026-10[&halaman=2][&unduh=1]
 *   Per tanggal: GET /api/gambar/<jenis>?tgl=2026-10-14[&unduh=1]   (semua ULP, UP3 saja)
 *   jenis: lib/gambar/laporan.ts. Header `X-Jumlah-Halaman` = banyak halaman
 *   laporan itu (rating > 30 petugas dipecah). `unduh=1` → disajikan sebagai lampiran.
 * Per bulan: UP3 memilih ULP; peran lain selalu ULP sendiri, apa pun isi `ulp`.
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ jenis: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jenis } = await params;
  const info = JENIS_LAPORAN.find((j) => j.kunci === jenis);
  if (!info) return NextResponse.json({ error: `Jenis laporan tidak dikenal: ${jenis}` }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const halaman = Math.max(1, Number(sp.get("halaman") ?? 1) || 1);

  let minta: Permintaan;
  let namaBerkas: string;
  if (info.per === "tanggal") {
    if (user.role !== "UP3") return NextResponse.json({ error: "Gambar ini berisi semua ULP — hanya untuk UP3." }, { status: 403 });
    const tgl = sp.get("tgl") ?? "";
    if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(tgl)) {
      return NextResponse.json({ error: "Parameter tgl harus YYYY-MM-DD." }, { status: 400 });
    }
    const [tahun, bulan] = tgl.split("-").map(Number);
    minta = { ulp: "SEMUA", tahun, bulan, tgl, halaman };
    namaBerkas = `${jenis}-${tgl}`;
  } else {
    const ulp = (user.role === "UP3" ? (sp.get("ulp") ?? "") : (user.unit ?? "")).toUpperCase();
    if (!UNITS.some((u) => u.value === ulp)) {
      return NextResponse.json({ error: "Pilih satu ULP (AMPENAN, CAKRANEGARA, GERUNG, TANJUNG)." }, { status: 400 });
    }
    const bulanArg = sp.get("bulan") ?? "";
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(bulanArg)) {
      return NextResponse.json({ error: "Parameter bulan harus YYYY-MM." }, { status: 400 });
    }
    const [tahun, bulan] = bulanArg.split("-").map(Number);
    minta = { ulp, tahun, bulan, tgl: "", halaman };
    namaBerkas = `${jenis}-${ulp.toLowerCase()}-${bulanArg}`;
  }

  try {
    const { gambar, jumlahHalaman } = await JENIS_BUAT[jenis as JenisLaporan](minta);
    if (sp.get("unduh") === "1") {
      const akhiran = jumlahHalaman > 1 ? `-${halaman}` : "";
      gambar.headers.set("Content-Disposition", `attachment; filename="${namaBerkas}${akhiran}.png"`);
    }
    gambar.headers.set("X-Jumlah-Halaman", String(jumlahHalaman));
    gambar.headers.set("Cache-Control", "private, no-store");
    return gambar;
  } catch (e) {
    const status = e instanceof GagalLaporan ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
