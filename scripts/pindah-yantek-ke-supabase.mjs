// Pindahkan berkas data/yantek/*.json ke tabel `yantek_harian` (sekali jalan).
//
//   node scripts/pindah-yantek-ke-supabase.mjs
//
// Butuh `yantek-harian.sql` + `yantek-harian-posko.sql` sudah dijalankan, dan
// .env.local berisi NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
//
// Dipecah per TANGGAL × POSKO, dan HANYA MENGISI YANG BELUM ADA
// (ignore-duplicates): tarikan yang lebih baru di database tidak pernah
// ditimpa isi berkas lama. Aman diulang.
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
const muatan = [];

for (const f of berkas) {
  const tanggal = f.replace(/\.json$/, "");
  const isi = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  const rows = Array.isArray(isi.rows) ? isi.rows : [];
  const perPosko = new Map();
  for (const r of rows) {
    const p = Number(r?.id_posko) || 0;
    perPosko.set(p, [...(perPosko.get(p) ?? []), r]);
  }
  for (const [id_posko, isiPosko] of perPosko) {
    muatan.push({
      tanggal,
      id_posko,
      label: isi.label ?? tanggal,
      rows: isiPosko,
      disimpan_at: isi.savedAt ? new Date(isi.savedAt).toISOString() : new Date().toISOString(),
    });
  }
}

// Tiap permintaan diberi batas waktu dan dicoba ulang. Tanpa itu, satu
// sambungan yang macet menahan seluruh skrip tanpa keluaran apa pun, dan
// sambungan yang putus melempar galat yang menghentikan sisanya (24 Sep 2026).
async function kirim(m) {
  for (let coba = 1; ; coba++) {
    try {
      const res = await fetch(`${URL_SB}/rest/v1/yantek_harian?on_conflict=tanggal,id_posko&select=tanggal`, {
        method: "POST",
        signal: AbortSignal.timeout(60_000),
        headers: {
          apikey: KUNCI,
          Authorization: `Bearer ${KUNCI}`,
          "Content-Type": "application/json",
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify(m),
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      // representation kosong = sudah ada di database, dilewati.
      return (await res.json()).length > 0;
    } catch (e) {
      if (coba >= 3) throw e;
      console.warn(`  ↻ ${m.tanggal}/${m.id_posko} percobaan ${coba} gagal: ${e.message} — ulang`);
    }
  }
}

for (const [i, m] of muatan.entries()) {
  try {
    if (await kirim(m)) { ok++; baris += m.rows.length; console.log(`✓ ${m.tanggal}/${m.id_posko} (${m.rows.length})`); }
  } catch (e) {
    gagal++;
    console.error(`✗ ${m.tanggal}/${m.id_posko}: ${e.message}`);
  }
  if ((i + 1) % 25 === 0) console.log(`… ${i + 1}/${muatan.length}`);
}

console.log(`Selesai: ${ok} tanggal×posko baru (${baris} baris) masuk, ${muatan.length - ok - gagal} sudah ada & dilewati, ${gagal} gagal.`);
