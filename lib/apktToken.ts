import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Token antrean APKT: bookmark di halaman APKT (asal lain, tanpa sesi Smart)
// melaporkan "laporan ini sudah tersimpan di APKT". Isinya hanya batas waktu
// + tanda tangan HMAC; yang bisa dilakukan dengan token ini cuma menandai
// koreksi yang sudah ada sebagai masuk APKT.

const BERLAKU_MS = 7 * 24 * 3600 * 1000;

const tandaTangan = (exp: string) =>
  createHmac("sha256", `apkt-masuk:${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`)
    .update(exp)
    .digest("base64url");

export function buatTokenApkt(): string {
  const exp = String(Date.now() + BERLAKU_MS);
  return `${exp}.${tandaTangan(exp)}`;
}

export function cekTokenApkt(t: string | null): boolean {
  if (!t || !process.env.SUPABASE_SERVICE_ROLE_KEY) return false;
  const [exp, sig] = t.split(".");
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(tandaTangan(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}
