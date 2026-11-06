import { NextResponse } from "next/server";
import { muatJaringan } from "@/lib/prediksiGangguan/jaringan";
import { tentukanPenyulang } from "@/lib/prediksiGangguan/penyulangTrip";
import { ambilPeristiwa } from "@/lib/prediksiGangguan/peristiwa";
import { hapusTemuan, nilaiSemuaTemuan, simpanTemuan } from "@/lib/prediksiGangguan/temuan";
import { akses } from "../_akses";

export const dynamic = "force-dynamic";

async function izin(kunci: string) {
  const a = await akses();
  if (!a) return { galat: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!a.bolehIsi) return { galat: NextResponse.json({ error: "Hanya UP3 dan admin yang boleh mengisi lokasi temuan." }, { status: 403 }) };
  const p = await ambilPeristiwa(kunci);
  if (!p) return { galat: NextResponse.json({ error: "Gangguan tidak ditemukan." }, { status: 404 }) };
  if (a.unit && p.ulp && p.ulp !== a.unit) return { galat: NextResponse.json({ error: "Gangguan ULP lain." }, { status: 403 }) };
  return { a, p };
}

// POST { kunci, tiangId, catatan } → simpan/ganti lokasi temuan, lalu nilai
// POST { nilaiUlang: true } → nilai ulang semua temuan (kalibrasi berubah)
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body.nilaiUlang) {
      const a = await akses();
      if (!a?.bolehIsi) return NextResponse.json({ error: "Hanya UP3 dan admin." }, { status: 403 });
      return NextResponse.json({ jumlah: await nilaiSemuaTemuan(a.unit) });
    }
    const r = await izin(String(body.kunci ?? ""));
    if ("galat" in r) return r.galat;
    // Jaringan yang sama dengan prediksinya (outlet GH / koreksi web).
    const trip = await tentukanPenyulang(r.p.penyulang, r.p.keypoint, r.p.kunci);
    const j = trip.penyulang ? await muatJaringan(trip.penyulang) : null;
    const t = j?.titik.get(String(body.tiangId ?? ""));
    if (!t?.anggota) return NextResponse.json({ error: `Tiang tidak ada di jaringan ${trip.penyulang ?? r.p.penyulang}.` }, { status: 400 });
    const temuan = await simpanTemuan(r.p, { id: t.id, kode: t.kode }, body.catatan ?? null, r.a.me.name);
    return NextResponse.json({ temuan });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// DELETE ?kunci=… → hapus lokasi temuan yang salah isi
export async function DELETE(req: Request) {
  try {
    const r = await izin(new URL(req.url).searchParams.get("kunci") ?? "");
    if ("galat" in r) return r.galat;
    return NextResponse.json({ terhapus: await hapusTemuan(r.p) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
