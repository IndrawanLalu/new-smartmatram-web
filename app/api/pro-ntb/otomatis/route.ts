import { after, NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { kirimOtomatisBulan } from "@/lib/proNtbKirim";

export const dynamic = "force-dynamic";

/**
 * Kirim otomatis PRO NTB (scripts/pro-ntb-otomatis.sql) — dipanggil pekerja
 * tiap menit (header X-Cron-Secret). ULP yang `kirim_otomatis` dan
 * `jam_kirim`:`menit_kirim`-nya = jam WITA sekarang dikirim per tab, lalu dicek ulang. Tanggal 1–5 bulan
 * lalu ikut dikirim.
 *
 * Menjawab SEGERA, pekerjaannya jalan sesudahnya (`after`): satu putaran bisa
 * > 5 menit, dan pekerja akan mengulang panggilan yang tidak terjawab.
 */

const WITA = () => new Date(Date.now() + 8 * 3600 * 1000);
const bulanGeser = (geser: number) => {
  const d = WITA();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + geser);
  return d.toISOString().slice(0, 7);
};
/** Putaran yang mulai < 1 jam lalu dan belum selesai = masih berjalan. */
const MASIH_JALAN_MS = 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const jam = WITA().getUTCHours();
  const menit = WITA().getUTCMinutes();
  const { data, error } = await supabaseAdmin.from("pro_ntb_sheet")
    .select("ulp,otomatis_mulai,otomatis_selesai").eq("kirim_otomatis", true).eq("jam_kirim", jam).eq("menit_kirim", menit);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sekarang = Date.now();
  const ulp = (data ?? [])
    .filter((r) => !(r.otomatis_mulai && !r.otomatis_selesai && sekarang - Date.parse(r.otomatis_mulai) < MASIH_JALAN_MS))
    .map((r) => r.ulp as string);
  if (!ulp.length) return NextResponse.json({ ok: true, jam, menit, ulp: [] });

  const bulan = WITA().getUTCDate() <= 5 ? [bulanGeser(-1), bulanGeser(0)] : [bulanGeser(0)];
  after(async () => {
    for (const u of ulp) {
      await supabaseAdmin.from("pro_ntb_sheet").update({ otomatis_mulai: new Date().toISOString(), otomatis_selesai: null }).eq("ulp", u);
      const ringkas: string[] = [];
      for (const b of bulan) {
        try { ringkas.push(await kirimOtomatisBulan(u, b)); }
        catch (e) { ringkas.push(`${b}: gagal — ${(e as Error).message}`); }
      }
      await supabaseAdmin.from("pro_ntb_sheet")
        .update({ otomatis_selesai: new Date().toISOString(), otomatis_ringkas: ringkas.join(" | ") }).eq("ulp", u);
    }
  });
  return NextResponse.json({ ok: true, jam, menit, ulp, bulan });
}
