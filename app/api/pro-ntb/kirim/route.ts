import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canSeeAllUnits } from "@/lib/roles";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { TAB_PRO_NTB, type TabProNtb } from "@/lib/proNtbSheet";
import { cekProNtbUlang } from "@/lib/proNtbCek";
import { kirimTab, siapkanMuatan } from "@/lib/proNtbKirim";

export const dynamic = "force-dynamic";

/**
 * Kirim ke spreadsheet PRO NTB lewat Apps Script (8 Nov 2026, tahap 2,
 * scripts/pro-ntb-kirim.sql + scripts/apps-script-pro-ntb.gs).
 *
 * GET  ?ulp=…                           → terpasang? (URL disamarkan, kunci tidak pernah dikirim balik)
 * POST { aksi: "kunci", ulp }           → buat kunci rahasia BARU (tampil sekali)
 * POST { aksi: "url", ulp, url }        → simpan URL aplikasi web
 * POST { aksi: "kirim", ulp, bulan, tab, coba, cekSesudah } → satu tab ke Apps Script (isi disusun di server)
 * POST { aksi: "otomatis", ulp, nyala, jam, menit } → Kirim otomatis terjadwal (pro-ntb-otomatis.sql)
 */

const pesanTabel = (m: string) =>
  /pro_ntb_(sheet_kunci|kirim_log)/.test(m) ? `${m} — jalankan scripts/pro-ntb-kirim.sql di Supabase.` : m;

async function izin(ulp: string, ubah: boolean) {
  const me = await getCurrentUser();
  if (!me) return { galat: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!ulp || ulp === "SEMUA") return { galat: NextResponse.json({ error: "Pilih satu ULP." }, { status: 400 }) };
  if (!canSeeAllUnits(me.role) && (me.unit ?? "").toUpperCase() !== ulp) {
    return { galat: NextResponse.json({ error: "Spreadsheet ULP lain." }, { status: 403 }) };
  }
  if (ubah && me.role !== "UP3" && me.role !== "admin") {
    return { galat: NextResponse.json({ error: "Hanya UP3 dan admin." }, { status: 403 }) };
  }
  return { me };
}

export async function GET(req: Request) {
  const ulp = (new URL(req.url).searchParams.get("ulp") ?? "").toUpperCase();
  const r = await izin(ulp, false);
  if ("galat" in r) return r.galat;
  const [{ data, error }, o] = await Promise.all([
    supabaseAdmin.from("pro_ntb_sheet_kunci").select("script_url,updated_at,updated_by").eq("ulp", ulp).maybeSingle(),
    supabaseAdmin.from("pro_ntb_sheet").select("kirim_otomatis,jam_kirim,menit_kirim,otomatis_mulai,otomatis_selesai,otomatis_ringkas").eq("ulp", ulp).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: pesanTabel(error.message) }, { status: 500 });
  return NextResponse.json({
    // null = kolom belum ada (pro-ntb-otomatis.sql belum dijalankan) / spreadsheet belum diatur.
    otomatis: o.error ? null : o.data ?? null,
    adaKunci: !!data,
    url: data?.script_url ? `${data.script_url.slice(0, 48)}…` : null,
    diubah: data ? `${data.updated_by ?? "-"} · ${data.updated_at}` : null,
  });
}


export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const ulp = String(body.ulp ?? "").toUpperCase();
  const aksi = String(body.aksi ?? "");
  const r = await izin(ulp, true);
  if ("galat" in r) return r.galat;
  const oleh = r.me.name || r.me.email;

  try {
    if (aksi === "kunci") {
      const rahasia = randomBytes(18).toString("base64url");
      const { error } = await supabaseAdmin.from("pro_ntb_sheet_kunci")
        .upsert({ ulp, rahasia, updated_at: new Date().toISOString(), updated_by: oleh });
      if (error) throw new Error(error.message);
      return NextResponse.json({ rahasia });
    }

    if (aksi === "url") {
      const url = String(body.url ?? "").trim();
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) {
        return NextResponse.json({ error: "URL harus URL aplikasi web Apps Script (…/macros/s/…/exec)." }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin.from("pro_ntb_sheet_kunci")
        .update({ script_url: url, updated_at: new Date().toISOString(), updated_by: oleh }).eq("ulp", ulp).select("ulp");
      if (error) throw new Error(error.message);
      if (!data?.length) return NextResponse.json({ error: "Buat kunci dulu, baru simpan URL." }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "otomatis") {
      const jam = Number(body.jam), menit = Number(body.menit ?? 0);
      if (!Number.isInteger(jam) || jam < 0 || jam > 23 || !Number.isInteger(menit) || menit < 0 || menit > 59) {
        return NextResponse.json({ error: "Jam 00.00–23.59." }, { status: 400 });
      }
      const { data, error } = await supabaseAdmin.from("pro_ntb_sheet")
        .update({ kirim_otomatis: body.nyala === true, jam_kirim: jam, menit_kirim: menit, updated_at: new Date().toISOString(), updated_by: oleh })
        .eq("ulp", ulp).select("ulp");
      if (error) throw new Error(pesanTabel(error.message));
      if (!data?.length) return NextResponse.json({ error: "Atur spreadsheet ULP ini dulu." }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    if (aksi === "kirim") {
      const coba = body.coba !== false;
      const tab = String(body.tab ?? "") as TabProNtb;
      const bulan = String(body.bulan ?? "");
      // Sinkron selalu sebulan dari tanggal 1 (keputusan user 8 Nov): realisasi
      // bisa berubah sesudah disetujui, jadi sebulan dikirim ulang utuh.
      if (!/^\d{4}-\d{2}$/.test(bulan)) return NextResponse.json({ error: "Pilih satu bulan." }, { status: 400 });
      // Satu tab per panggilan (9 Nov 2026) — semua tab sekaligus melewati batas 6 menit Google.
      if (!(TAB_PRO_NTB as readonly string[]).includes(tab)) return NextResponse.json({ error: "Sebutkan satu tab." }, { status: 400 });
      if (!coba) {
        const { data: o } = await supabaseAdmin.from("pro_ntb_sheet").select("otomatis_mulai,otomatis_selesai").eq("ulp", ulp).maybeSingle();
        if (o?.otomatis_mulai && !o.otomatis_selesai && Date.now() - Date.parse(o.otomatis_mulai) < 3600_000) {
          return NextResponse.json({ error: "Kirim otomatis sedang berjalan untuk ULP ini — tunggu sampai selesai." }, { status: 409 });
        }
      }
      // Isi disusun di server dari pro_ntb_baris — sama dengan Kirim otomatis.
      const { dari, sampai, muatan } = await siapkanMuatan(ulp, bulan);
      const r = await kirimTab({ ulp, tab, baris: muatan.filter((b) => b.tab === tab), dari, sampai, coba, oleh, sumber: "tombol" });
      // Tab terakhir kiriman sungguhan: status PRO NTB Rekap Kinerja ikut
      // diperbarui (gagal mengecek tidak menggagalkan kiriman).
      if (!coba && body.cekSesudah === true) await cekProNtbUlang(ulp, bulan, "kirim", oleh);
      if (!r.ok) return NextResponse.json({ error: r.error ?? "gagal", hasil: r.hasil }, { status: r.status });
      return NextResponse.json({ ok: true, coba, hasil: r.hasil });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: pesanTabel((e as Error).message) }, { status: 500 });
  }
}
