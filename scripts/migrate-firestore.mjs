/**
 * Migrasi data Firestore JSON → Supabase
 *
 * Cara pakai:
 *   1. Isi SUPABASE_URL dan SUPABASE_SERVICE_KEY di bawah
 *   2. node scripts/migrate-firestore.mjs
 *
 * Jalankan dari root project: d:\Indrawan\PROJECT\smart-mataram-next\
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// ── Config ───────────────────────────────────────────────────────────────────

const SUPABASE_URL = "https://ffvmimsldyerckznemsu.supabase.co"; // ganti
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmdm1pbXNsZHllcmNrem5lbXN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI1NDM1NSwiZXhwIjoyMDg3ODMwMzU1fQ.JWJ4wNZJeC81c-_3Da8DutClB7xzBGjVbI_bv3YYe_k"; // Settings → API → service_role

const DATA_DIR = "D:/downloadan/datafirebase";

// ── Init ─────────────────────────────────────────────────────────────────────

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(filename) {
  const raw = JSON.parse(readFileSync(`${DATA_DIR}/${filename}`, "utf8"));
  return Array.isArray(raw) ? raw : Object.values(raw);
}

// String kosong → null
const clean = (val) => (val === "" ? null : val);

function cleanRow(row) {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, clean(v)]));
}

// Batch insert ke Supabase (500 row per request)
async function insert(table, rows) {
  if (!rows.length) {
    console.log(`⏭  ${table}: kosong, skip`);
    return;
  }

  const CHUNK = 500;
  let total = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase.from(table).insert(chunk);

    if (error) {
      console.error(`❌ ${table} [${i}–${i + chunk.length}]: ${error.message}`);
      console.error("   Sample row:", JSON.stringify(chunk[0], null, 2));
      return;
    }
    total += chunk.length;
  }

  console.log(`✅ ${table}: ${total} rows`);
}

// ── Transform per Collection ─────────────────────────────────────────────────

// id kolom Supabase bertipe TEXT — pakai Firestore ID langsung (tidak dibuang)

function transformGardu(docs) {
  return docs.map((row) => cleanRow(row));
}

function transformInspeksi(docs) {
  return docs.map((row) => cleanRow(row));
}

function transformInspeksiPohon(docs) {
  return docs.map((row) => cleanRow(row));
}

function transformPetugas(docs) {
  return docs.map((row) => cleanRow(row));
}

// jalur_koordinat tidak punya id sendiri, jalur_id = Firestore ID dari jalur
// Karena kita pakai Firestore ID di tabel jalur, tidak perlu remapping
function transformKoordinat(docs) {
  return docs.map((row) => cleanRow(row));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Mulai migrasi Firestore → Supabase\n");

  // 1. Gardu
  await insert("gardu", transformGardu(readJson("gardu.json")));

  // 2. Inspeksi
  await insert("inspeksi", transformInspeksi(readJson("inspeksi.json")));

  // 3. Inspeksi Pohon
  await insert(
    "inspeksi_pohon",
    transformInspeksiPohon(readJson("inspeksi_pohon.json")),
  );

  // 4. Petugas
  await insert("petugas", transformPetugas(readJson("petugas.json")));

  // 5. Jalur + Jalur Koordinat
  // jalur pakai Firestore ID langsung, jalur_koordinat.jalur_id sudah match
  await insert("jalur", transformGardu(readJson("jalur.json")));
  await insert("jalur_koordinat", transformKoordinat(readJson("jalur_koordinat.json")));

  console.log("\n🎉 Migrasi selesai!");
}


main().catch((err) => {
  console.error("💥 Fatal:", err.message);
  process.exit(1);
});
