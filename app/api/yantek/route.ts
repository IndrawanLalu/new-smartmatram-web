import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeAllUnits } from "@/lib/roles";
import { POSKO_MAP } from "@/app/admin/yantek/_lib/yantek";
import { ambilRentang, ambilTanggal, daftarTanggal, hapusTanggal, simpanTanggal } from "@/lib/yantekStore";

/**
 * Data yantek APKT per tanggal — tabel `yantek_harian` di Supabase.
 *
 * Sampai 24 Sep 2026 disimpan sebagai berkas `data/yantek/*.json`; di Docker
 * homelab berkas itu tidak bisa ditulis (EACCES) dan hilang setiap rebuild.
 * Bentuk jawaban API ini DIPERTAHANKAN persis, jadi halaman Yantek dan
 * pemanggil lain tidak perlu tahu datanya pindah.
 *
 * Galat server dijawab 500 berikut pesannya — bukan daftar kosong
 * (teknisaplikasi.md butir 6).
 */

const TGL = /^\d{4}-\d{2}-\d{2}$/;
const sahTanggal = (d: string) => TGL.test(d) || d === "unknown";

async function masuk() {
  const sb = await createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  return { sb, user };
}

const gagal = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : "Gagal membaca data yantek" }, { status: 500 });

// ── GET ───────────────────────────────────────────────────────────────────────
// ?date=2026-05-29  → rows untuk tanggal itu
// ?month=2026-05    → rows sebulan
// (tidak ada ?all=true — menarik seluruh data sepanjang masa sekaligus tidak
//  boleh; lihat teknisaplikasi.md butir 13)
// (kosong)          → daftar tanggal + jumlah baris

export async function GET(req: Request) {
  const { sb, user } = await masuk();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const month = searchParams.get("month");

  try {
    if (date) {
      if (!sahTanggal(date)) return NextResponse.json({ error: "Format date harus YYYY-MM-DD" }, { status: 400 });
      return NextResponse.json(await ambilTanggal(sb, date));
    }

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return NextResponse.json({ error: "Format month harus YYYY-MM" }, { status: 400 });
      }
      const isi = await ambilRentang(sb, `${month}-01`, `${month}-31`);
      return NextResponse.json({ rows: isi.flatMap((x) => x.rows) });
    }

    return NextResponse.json(await daftarTanggal(sb));
  } catch (e) {
    return gagal(e);
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────
// Body: { date, label, rows } — tulis / timpa satu tanggal.

export async function POST(req: Request) {
  const { sb, user } = await masuk();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { date, label, rows } = (await req.json()) as { date: string; label: string; rows: unknown[] };
  if (!date || !sahTanggal(date) || !Array.isArray(rows)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) dan rows wajib diisi" }, { status: 400 });
  }

  try {
    await simpanTanggal(sb, date, label ?? date, rows, user.id);
    return NextResponse.json({ ok: true, date, count: rows.length });
  } catch (e) {
    return gagal(e);
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────
// ?date=2026-05-29&posko=441501  → hapus tanggal itu, posko itu saja
// ?date=2026-05-29                → semua posko (hanya UP3)
//
// Admin ULP DIPAKSA ke posko ULP-nya sendiri di sini, bukan cuma di layar:
// kalau tidak, cacat yang sama dengan penimpaan 24 Sep 2026 — satu ULP
// menghapus data ULP lain — tinggal lewat pintu yang berbeda.

export async function DELETE(req: Request) {
  const { sb, user } = await masuk();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date || !sahTanggal(date)) return NextResponse.json({ error: "date wajib diisi" }, { status: 400 });

  const saya = await getCurrentUser();
  let posko = Number(searchParams.get("posko")) || undefined;
  if (!saya || !canSeeAllUnits(saya.role)) {
    const milik = POSKO_MAP.find((p) => p.ulp === saya?.unit)?.idPosko;
    if (!milik) return NextResponse.json({ error: "ULP Anda tidak punya posko yantek" }, { status: 403 });
    if (posko && posko !== milik) {
      return NextResponse.json({ error: "Hanya data posko ULP sendiri yang boleh dihapus" }, { status: 403 });
    }
    posko = milik;
  }

  try {
    await hapusTanggal(sb, date, posko);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return gagal(e);
  }
}
