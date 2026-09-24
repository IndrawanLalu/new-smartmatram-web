// Pindahkan berkas data/yantek/*.json ke tabel `yantek_harian` (sekali jalan).
//
//   node scripts/pindah-yantek-ke-supabase.mjs
//
// Butuh `scripts/yantek-harian.sql` sudah dijalankan, dan .env.local berisi
// NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Aman diulang: tanggal
// yang sama DITIMPA dengan isi berkas (upsert), tidak digandakan.
//
// Satu tanggal satu permintaan — satu tanggal bisa ratusan KB, dan mengirim
// seluruh 20 MB sekaligus lebih mudah putus di jalan.

import fs from "fs";
import path from "path";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }),
);
const URL_SB = env.NEXT_PUBLIC_SUPABASE_URL;
const KUNCI = env.SUPABASE_SERVICE_ROLE_KEY;
const DIR = path.join("data", "yantek");

const berkas = fs.readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
let ok = 0, gagal = 0, baris = 0;

for (const f of berkas) {
  const tanggal = f.replace(/\.json$/, "");
  const isi = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const rows = Array.isArray(isi.rows) ? isi.rows : [];
  const res = await fetch(`${URL_SB}/rest/v1/yantek_harian`, {
    method: "POST",
    headers: {
      apikey: KUNCI,
      Authorization: `Bearer ${KUNCI}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      tanggal,
      label: isi.label ?? tanggal,
      rows,
      disimpan_at: isi.savedAt ? new Date(isi.savedAt).toISOString() : new Date().toISOString(),
    }),
  });
  if (res.ok) { ok++; baris += rows.length; }
  else { gagal++; console.error(`✗ ${tanggal}: ${res.status} ${await res.text()}`); }
}

console.log(`Selesai: ${ok} tanggal (${baris} baris) terpindah, ${gagal} gagal, dari ${berkas.length} berkas.`);
