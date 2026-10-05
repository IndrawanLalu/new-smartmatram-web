import { supabaseAdmin } from "@/lib/supabase-admin";
import { gatewaySend } from "@/lib/wa/gateway";

/** Grup WA tujuan untuk kategori notif × ULP (`wa_settings`); "" = belum diatur / mati. */
export async function grupWa(kategori: string, ulp: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("wa_settings")
    .select("group_id")
    .eq("category", kategori)
    .eq("ulp", ulp.toUpperCase())
    .eq("enabled", true)
    .maybeSingle();
  return (data?.group_id as string) ?? "";
}

/** Kirim lewat wa-gateway, coba ulang bila gateway sedang sibuk/putus sebentar. */
export async function kirimGrup(grup: string, teks: string, foto?: string, coba = 5, jedaMs = 5000) {
  for (let i = 1; i <= coba; i++) {
    try {
      await gatewaySend({ to: grup, text: teks, mediaUrl: foto });
      return true;
    } catch (e) {
      console.warn(`[wa] gateway gagal (${(e as Error).message}), coba ${i}/${coba}`);
      await new Promise((r) => setTimeout(r, jedaMs));
    }
  }
  console.error(`[wa] gagal kirim ke ${grup} setelah ${coba}x`);
  return false;
}
