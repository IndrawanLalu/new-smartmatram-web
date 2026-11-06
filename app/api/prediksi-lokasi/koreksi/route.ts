import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { daftarPenyulangJtm } from "@/lib/prediksiGangguan/jaringan";
import { ambilPeristiwa, temuanUntuk } from "@/lib/prediksiGangguan/peristiwa";
import { koreksiTrip, lupakanTembolokTrip } from "@/lib/prediksiGangguan/penyulangTrip";
import { daftarTemuan, nilaiTemuan } from "@/lib/prediksiGangguan/temuan";
import { akses } from "../_akses";

export const dynamic = "force-dynamic";

/**
 * Koreksi penyulang yang trip untuk satu gangguan (scripts/prediksi-penyulang-trip.sql):
 * laporan menulis nama yang tidak ada di data JTM, atau penyulang masuk GH
 * yang outletnya belum dikenali. "Samakan nama" berlaku untuk semua laporan
 * bernama sama, sampai namanya diseragamkan.
 */

async function izin(kunci: string) {
  const a = await akses();
  if (!a) return { galat: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const p = await ambilPeristiwa(kunci);
  if (!p) return { galat: NextResponse.json({ error: "Gangguan tidak ditemukan." }, { status: 404 }) };
  if (a.unit && p.ulp && p.ulp !== a.unit) return { galat: NextResponse.json({ error: "Gangguan ULP lain." }, { status: 403 }) };
  return { a, p };
}

const pesanTabel = (m: string) =>
  /prediksi_(koreksi_trip|alias_penyulang)/.test(m) ? `${m} — jalankan scripts/prediksi-penyulang-trip.sql di Supabase.` : m;

/** Temuan gangguan ini dinilai ulang memakai jaringan barunya. */
async function nilaiUlang(kunci: string) {
  const p = await ambilPeristiwa(kunci);
  if (!p) return;
  const t = temuanUntuk(p, await daftarTemuan(p.tanggal, p.tanggal, null));
  if (t) await nilaiTemuan(t);
}

// GET ?kunci=… → daftar penyulang JTM + koreksi yang berlaku
export async function GET(req: Request) {
  const r = await izin(new URL(req.url).searchParams.get("kunci") ?? "");
  if ("galat" in r) return r.galat;
  try {
    return NextResponse.json({ penyulang: await daftarPenyulangJtm(), koreksi: await koreksiTrip(r.p.kunci) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// POST { kunci, penyulang, keypoint, samakanNama }
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await izin(String(body.kunci ?? ""));
  if ("galat" in r) return r.galat;
  if (!r.a.bolehIsi) return NextResponse.json({ error: "Hanya UP3 dan admin yang boleh mengoreksi." }, { status: 403 });
  const penyulang = String(body.penyulang ?? "").trim();
  if (!(await daftarPenyulangJtm()).includes(penyulang)) {
    return NextResponse.json({ error: `Penyulang ${penyulang || "(kosong)"} tidak ada di data JTM.` }, { status: 400 });
  }
  const keypoint = String(body.keypoint ?? "").trim() || null;
  const oleh = r.a.me.name;
  try {
    const { error } = await supabaseAdmin.from("prediksi_koreksi_trip")
      .upsert({ kunci: r.p.kunci, penyulang, keypoint, oleh, diubah_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    if (body.samakanNama && r.p.penyulang.trim().toUpperCase() !== penyulang) {
      const { error: e2 } = await supabaseAdmin.from("prediksi_alias_penyulang")
        .upsert({ nama: r.p.penyulang.trim().toUpperCase(), penyulang, oleh, diubah_at: new Date().toISOString() });
      if (e2) throw new Error(e2.message);
    }
    lupakanTembolokTrip();
    await nilaiUlang(r.p.kunci);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: pesanTabel((e as Error).message) }, { status: 500 });
  }
}

// DELETE ?kunci=… → kembali ke penentuan otomatis (nama yang disamakan tetap)
export async function DELETE(req: Request) {
  const r = await izin(new URL(req.url).searchParams.get("kunci") ?? "");
  if ("galat" in r) return r.galat;
  if (!r.a.bolehIsi) return NextResponse.json({ error: "Hanya UP3 dan admin yang boleh mengoreksi." }, { status: 403 });
  try {
    const { error } = await supabaseAdmin.from("prediksi_koreksi_trip").delete().eq("kunci", r.p.kunci);
    if (error) throw new Error(error.message);
    lupakanTembolokTrip();
    await nilaiUlang(r.p.kunci);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: pesanTabel((e as Error).message) }, { status: 500 });
  }
}
