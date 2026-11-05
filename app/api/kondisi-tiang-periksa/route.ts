import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { gatewayEnabled, gatewaySend } from "@/lib/wa/gateway";

/**
 * Pengaman malam tabel ringkas `kondisi_tiang_terakhir` (kondisi-tiang-ringkas.sql).
 * Dipicu container `pekerja` tiap malam:
 *   POST /api/kondisi-tiang-periksa   header X-Cron-Secret: <CRON_SECRET>
 *
 * Membandingkan tabel dengan rumusnya per 2.000 tiang dan memperbaiki yang
 * berbeda (di database). Selisih > 0 berarti ada jalur perubahan data yang
 * belum terpantau pemicu — dilaporkan lewat WA ke `WA_ADMIN_TEKNIS` (nomor
 * atau JID) bila diisi; tanpa itu hanya tercatat di log pekerja.
 */

interface Potong {
  selisih: number;
  terakhir: string | null;
}

async function periksaPotong(setelah: string | null): Promise<Potong> {
  for (let ke = 1; ; ke++) {
    const { data, error } = await supabaseAdmin.rpc("kondisi_tiang_periksa", { p_setelah: setelah, p_jumlah: 2000 });
    if (!error) return (data as Potong[])[0];
    if (ke === 3) throw new Error(error.message);
    await new Promise((r) => setTimeout(r, ke * 3000));
  }
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mulai = Date.now();
  let selisih = 0;
  let potong = 0;
  let setelah: string | null = null;
  try {
    for (;;) {
      const r = await periksaPotong(setelah);
      if (!r.terakhir) break;
      selisih += r.selisih;
      potong++;
      setelah = r.terakhir;
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, potong, selisih }, { status: 500 });
  }

  const tujuan = process.env.WA_ADMIN_TEKNIS;
  let wa = "tidak dikirim";
  if (selisih > 0 && tujuan && gatewayEnabled()) {
    await gatewaySend({
      to: tujuan,
      text:
        `⚠️ SMART — kondisi tiang JTM: ${selisih} tiang berbeda dari rumusnya dan sudah diperbaiki otomatis.\n` +
        `Artinya ada perubahan data inspeksi JTM yang belum terpantau pemicu (kondisi-tiang-ringkas.sql). Mohon dicek.`,
    });
    wa = "terkirim";
  }

  return NextResponse.json({ selisih, potong, detik: Math.round((Date.now() - mulai) / 1000), wa });
}
