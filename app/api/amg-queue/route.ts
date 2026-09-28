import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// User klik "Kirim ke AMG" → tandai antre. Agen lokal (smart-agent) yang mengirim.
export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as { pengukuranId?: string; pengukuranIds?: string[] };
  const ids = body.pengukuranIds ?? (body.pengukuranId ? [body.pengukuranId] : []);
  if (ids.length === 0) return NextResponse.json({ error: "pengukuranId(s) wajib" }, { status: 400 });

  // Gerbang `tahan_amg`: pengukuran yang sedang dikembalikan ke petugas, dan —
  // sejak aturan ULP berlaku — yang tegangan ujungnya belum disetujui, tidak
  // boleh diantre. Semua atau tidak sama sekali,
  // supaya kirim massal tidak diam-diam mengantre sebagian. Fungsi belum
  // terpasang (PGRST202) = aturan belum ada = seperti semula.
  const { data: tahan, error: eTahan } = await supabaseAdmin.rpc("tahan_amg", { p_ids: ids });
  if (eTahan && eTahan.code !== "PGRST202") {
    return NextResponse.json({ error: eTahan.message }, { status: 500 });
  }
  const ditahan = (tahan ?? []) as { id: string; no_gardu: string; alasan: string }[];
  if (ditahan.length > 0) {
    const rinci = ditahan.slice(0, 5).map((x) => `${x.no_gardu}: ${x.alasan}`).join("\n");
    return NextResponse.json(
      {
        error:
          `${ditahan.length} pengukuran ditahan dari AMG — tidak ada yang diantre. Keluarkan dari pilihan.\n` +
          rinci + (ditahan.length > 5 ? "\n…" : ""),
        ditahan: ditahan.map((x) => x.id),
      },
      { status: 409 },
    );
  }

  // amg_attempts direset agar baris yang sudah mentok 3 kali bisa dicoba lagi
  // setelah penyebabnya dibereskan (mis. URL AMG diperbaiki).
  const { error } = await supabaseAdmin
    .from("pengukuran_gardu")
    .update({
      amg_queued_at: new Date().toISOString(),
      amg_sent_at: null,
      amg_error: null,
      amg_attempts: 0,
    })
    .in("id", ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, queued: ids.length });
}
