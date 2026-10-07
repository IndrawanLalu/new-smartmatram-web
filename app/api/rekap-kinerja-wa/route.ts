import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { gatewayEnabled, gatewaySend } from "@/lib/wa/gateway";
import { BULAN, META } from "@/app/admin/kinerja-yantek/_lib/kinerjaMeta";
import { tanggalPanjang } from "@/app/admin/kinerja-yantek/_lib/realisasiHarian";
import { bulanIniWita, keBarisBulanan, rekapBulanan, teksWaBulanan } from "@/app/admin/kinerja-yantek/_lib/realisasiBulanan";

/**
 * Rekap Kinerja bulan berjalan, keempat ULP dalam satu pesan, ke grup WA UP3
 * (`wa_settings` kategori `rekap_kinerja`, satu baris untuk UP3).
 * Dipicu container `pekerja` jam 18.00 WITA:
 *   POST /api/rekap-kinerja-wa   header X-Cron-Secret: <CRON_SECRET>
 *   ?coba=1  → hanya mengembalikan teksnya, tidak mengirim.
 * Teksnya sama persis dengan tombol "Kirim ke WA" di Rekap Kinerja → Per bulan.
 */

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const coba = req.nextUrl.searchParams.get("coba") === "1";

  const { tahun, bulan } = bulanIniWita();
  let rows: Record<string, unknown>[];
  try {
    rows = await fetchAllRows<Record<string, unknown>>(() =>
      supabaseAdmin
        .rpc("realisasi_bulanan", { p_ulp: "SEMUA", p_tahun: tahun, p_bulan: bulan })
        .order("ulp")
        .order("kunci")
        .order("tgl"),
    );
  } catch (e) {
    // Gagal baca ≠ nol: jangan kirim rekap kosong ke grup (teknisaplikasi butir 6).
    return NextResponse.json({ error: `realisasi_bulanan gagal: ${(e as Error).message}` }, { status: 500 });
  }

  const wita = new Date(Date.now() + 8 * 3600 * 1000);
  const hariIni = wita.toISOString().slice(0, 10);
  const jam = `${String(wita.getUTCHours()).padStart(2, "0")}.${String(wita.getUTCMinutes()).padStart(2, "0")}`;
  const teks = teksWaBulanan(
    `${BULAN[bulan - 1]} ${tahun}`,
    rekapBulanan(rows.map(keBarisBulanan), META),
    META,
    UNIT,
    `Data s.d. ${tanggalPanjang(hariIni)} pukul ${jam} WITA`,
  );
  if (coba) return NextResponse.json({ teks });

  const { data: tujuan, error } = await supabaseAdmin
    .from("wa_settings")
    .select("group_id")
    .eq("category", "rekap_kinerja")
    .eq("enabled", true)
    .neq("group_id", "");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!tujuan?.length) return NextResponse.json({ skipped: true, reason: "grup rekap_kinerja belum diisi / nonaktif" });
  if (!gatewayEnabled()) return NextResponse.json({ error: "WA gateway tidak aktif (WA_USE_GATEWAY)" }, { status: 503 });

  const terkirim: string[] = [];
  for (const { group_id } of tujuan) {
    try {
      await gatewaySend({ to: group_id, text: teks });
      terkirim.push(group_id);
    } catch (e) {
      return NextResponse.json({ error: `kirim ke ${group_id} gagal: ${(e as Error).message}`, terkirim }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true, terkirim, periode: `${tahun}-${String(bulan).padStart(2, "0")}` });
}
