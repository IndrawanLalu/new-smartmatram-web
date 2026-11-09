import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeAllUnits } from "@/lib/roles";
import { cekProNtb, ulpBerSheet } from "@/lib/proNtbCek";

export const dynamic = "force-dynamic";

/**
 * Cek PRO NTB → simpan ringkasan untuk kolom "PRO NTB" Rekap Kinerja
 * (scripts/pro-ntb-cek.sql).
 *
 * POST header X-Cron-Secret (pekerja, tiap malam): semua ULP yang spreadsheet-nya
 *      diatur, bulan berjalan — tanggal 1–5 juga bulan lalu (koreksi susulan).
 * POST { ulp, bulan } (tombol "Cek PRO NTB sekarang"); ulp "SEMUA" = UP3 saja.
 */

const bulanWita = (geser = 0) => {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + geser);
  return d.toISOString().slice(0, 7);
};

export async function POST(req: NextRequest) {
  const rahasia = req.headers.get("x-cron-secret");
  if (rahasia) {
    if (rahasia !== process.env.CRON_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const tgl = Number(new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(8, 10));
    const bulan = tgl <= 5 ? [bulanWita(-1), bulanWita()] : [bulanWita()];
    const hasil: Record<string, string> = {};
    for (const ulp of await ulpBerSheet()) {
      for (const b of bulan) {
        try {
          const r = await cekProNtb(ulp, b, "malam", "pekerja");
          hasil[`${ulp} ${b}`] = r.galat ?? `${r.ringkas.length} jenis`;
        } catch (e) {
          hasil[`${ulp} ${b}`] = (e as Error).message;
        }
      }
    }
    return NextResponse.json({ ok: true, hasil });
  }

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const ulp = String(body.ulp ?? "").toUpperCase();
  const bulan = String(body.bulan ?? "");
  if (!/^\d{4}-\d{2}$/.test(bulan)) return NextResponse.json({ error: "Pilih satu bulan." }, { status: 400 });
  const semua = ulp === "SEMUA";
  if (semua ? !canSeeAllUnits(me.role) : !canSeeAllUnits(me.role) && (me.unit ?? "").toUpperCase() !== ulp) {
    return NextResponse.json({ error: "ULP lain." }, { status: 403 });
  }
  try {
    const daftar = semua ? await ulpBerSheet() : [ulp];
    const hasil: Record<string, string | null> = {};
    for (const u of daftar) hasil[u] = (await cekProNtb(u, bulan, "tombol", me.name || me.email)).galat;
    return NextResponse.json({ ok: true, hasil });
  } catch (e) {
    const m = (e as Error).message;
    return NextResponse.json({ error: /pro_ntb_cek/.test(m) ? `${m} — jalankan scripts/pro-ntb-cek.sql di Supabase.` : m }, { status: 500 });
  }
}
