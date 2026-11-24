import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { buatTokenApkt } from "@/lib/apktToken";

export const dynamic = "force-dynamic";

async function getAuth() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

// GET /api/apkt/koreksi → semua koreksi (untuk menandai tabel & memuat ulang form)
// + token antrean APKT (bookmark memakainya untuk menandai "masuk APKT").
// GET /api/apkt/koreksi?sejak=<ISO> → hanya laporan yang masuk APKT sesudah waktu itu
// (dipanggil halaman tiap 10 detik selama antrean dikerjakan — ringan, bukan semua baris).
export async function GET(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sejak = new URL(req.url).searchParams.get("sejak");
  if (sejak) {
    const { data, error } = await supabase
      .from("apkt_koreksi")
      .select("no_laporan, apkt_masuk_at")
      .gt("apkt_masuk_at", sejak);
    if (error) return NextResponse.json({ rows: [], error: error.message });
    return NextResponse.json({ rows: data ?? [] });
  }

  const { data, error } = await supabase
    .from("apkt_koreksi")
    .select("*")
    .order("tgl_koreksi", { ascending: false });
  if (error) return NextResponse.json({ rows: [], error: error.message });
  return NextResponse.json({ rows: data ?? [], token: buatTokenApkt() });
}

// POST /api/apkt/koreksi
//   { row } / { rows } (koreksi massal) → upsert by no_laporan
//   { tandaiMasuk: no } → tandai "Sudah dikoreksi" untuk laporan yang dikoreksi
//                         MANUAL di APKT (tanpa bookmark)
// Koreksi yang sudah masuk APKT TIDAK bisa diubah lagi dari Smart — isinya harus
// tetap sama dengan yang tersimpan di APKT.
export async function POST(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  if (typeof body.tandaiMasuk === "string" && body.tandaiMasuk) {
    const { data, error } = await supabase
      .from("apkt_koreksi")
      .update({ apkt_masuk_at: new Date().toISOString() })
      .eq("no_laporan", body.tandaiMasuk)
      .is("apkt_masuk_at", null)
      .select("no_laporan, apkt_masuk_at");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data?.length) return NextResponse.json({ error: "Koreksi belum tersimpan atau sudah ditandai." }, { status: 409 });
    return NextResponse.json({ ok: true, apkt_masuk_at: data[0].apkt_masuk_at });
  }

  const rows = (Array.isArray(body.rows) ? body.rows : body.row ? [body.row] : []) as Record<string, unknown>[];
  if (rows.length === 0 || rows.some((r) => !r?.no_laporan)) {
    return NextResponse.json({ error: "no_laporan wajib" }, { status: 400 });
  }

  const terkunci: { no_laporan: string }[] = [];
  const semuaNo = rows.map((r) => String(r.no_laporan));
  for (let i = 0; i < semuaNo.length; i += 200) {
    const { data, error: errKunci } = await supabase
      .from("apkt_koreksi")
      .select("no_laporan")
      .in("no_laporan", semuaNo.slice(i, i + 200))
      .not("apkt_masuk_at", "is", null);
    if (errKunci) return NextResponse.json({ error: errKunci.message }, { status: 500 });
    terkunci.push(...(data ?? []));
  }
  if (terkunci.length) {
    return NextResponse.json(
      { error: `Sudah dikoreksi di APKT, tidak bisa diubah dari Smart: ${terkunci.map((t) => t.no_laporan).join(", ")}` },
      { status: 409 },
    );
  }

  const tgl = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase
      .from("apkt_koreksi")
      .upsert(
        // apkt_masuk_at hanya diisi bookmark / tandaiMasuk, tidak dari isian koreksi.
        rows.slice(i, i + 500).map((r) => {
          const baris: Record<string, unknown> = { ...r, tgl_koreksi: tgl };
          delete baris.apkt_masuk_at;
          return baris;
        }),
        { onConflict: "no_laporan" },
      );
    if (error) {
      return NextResponse.json(
        { error: error.message, hint: "Pastikan scripts/apkt-koreksi-schema.sql sudah dijalankan." },
        { status: 500 },
      );
    }
  }
  return NextResponse.json({ ok: true, jumlah: rows.length });
}

// DELETE /api/apkt/koreksi  { nos: string[] }
// Kosongkan antrian: hapus koreksi yang BELUM masuk APKT (salah durasi dll),
// supaya bisa dikoreksi ulang. Yang sudah di APKT tidak tersentuh — dijaga di
// sini, bukan hanya di layar. Bookmark yang sedang berjalan melewati laporan
// yang koreksinya sudah tidak ada (cek → ada:false).
export async function DELETE(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const nos = (Array.isArray(body.nos) ? body.nos : [])
    .filter((n: unknown): n is string => typeof n === "string" && n.length > 0);
  if (nos.length === 0) return NextResponse.json({ error: "nos wajib" }, { status: 400 });

  let jumlah = 0;
  for (let i = 0; i < nos.length; i += 200) {
    const { data, error } = await supabase
      .from("apkt_koreksi")
      .delete()
      .in("no_laporan", nos.slice(i, i + 200))
      .is("apkt_masuk_at", null)
      .select("no_laporan");
    if (error) return NextResponse.json({ error: error.message, jumlah }, { status: 500 });
    jumlah += data?.length ?? 0;
  }
  return NextResponse.json({ ok: true, jumlah });
}
