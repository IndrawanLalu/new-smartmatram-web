/**
 * Upsert data inspeksi dan inspeksi_pohon dari JSON ke Supabase.
 * Data lama yang ID-nya sama akan di-UPDATE, data baru akan di-INSERT.
 *
 * Cara pakai:
 *   node scripts/upsert-inspeksi.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const SUPABASE_URL = "https://ffvmimsldyerckznemsu.supabase.co";
const SUPABASE_SERVICE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZmdm1pbXNsZHllcmNrem5lbXN1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI1NDM1NSwiZXhwIjoyMDg3ODMwMzU1fQ.JWJ4wNZJeC81c-_3Da8DutClB7xzBGjVbI_bv3YYe_k";
const DATA_DIR = "D:/downloadan/datafirebase";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

function readJson(filename) {
  const raw = JSON.parse(readFileSync(`${DATA_DIR}/${filename}`, "utf8"));
  return Array.isArray(raw) ? raw : Object.values(raw);
}

const clean = (val) => (val === "" ? null : val);

// Upsert chunk 500 row per request
async function upsert(table, rows) {
  if (!rows.length) {
    console.log(`⏭  ${table}: kosong, skip`);
    return;
  }

  const CHUNK = 500;
  let total = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: "id", ignoreDuplicates: false });

    if (error) {
      console.error(`❌ ${table} [${i}–${i + chunk.length}]: ${error.message}`);
      console.error("   Sample row:", JSON.stringify(chunk[0], null, 2));
      return;
    }
    total += chunk.length;
  }

  console.log(`✅ ${table}: ${total} rows (upserted)`);
}

// ── Transform — hanya kolom yang ada di Supabase ──────────────────────────────

function transformInspeksi(docs) {
  return docs.map((row) => ({
    id:               clean(row.id),
    category:         clean(row.category),
    deskripsi:        clean(row.deskripsi),
    temuan:           clean(row.temuan),
    status:           clean(row.status) ?? "Temuan",
    lokasi:           clean(row.lokasi),
    ulp:              clean(row.ulp),
    penyulang:        clean(row.penyulang),
    inspektor:        clean(row.inspektor),
    nama_inspektor:   clean(row.nama_inspektor),
    eksekutor:        clean(row.eksekutor),
    team_name:        clean(row.team_name),
    keterangan:       clean(row.keterangan),
    koordinat:        clean(row.koordinat),
    foto_sebelum_url: clean(row.foto_sebelum_url),
    foto_lokasi_url:  clean(row.foto_lokasi_url),
    tgl_inspeksi:     clean(row.tgl_inspeksi),
    tgl_eksekusi:     clean(row.tgl_eksekusi),
    created_at:       clean(row.created_at),
    updated_at:       clean(row.updated_at),
  }));
}

function transformInspeksiPohon(docs) {
  return docs.map((row) => ({
    id:                    clean(row.id),
    deskripsi:             clean(row.deskripsi),
    eksekutor:             clean(row.eksekutor),
    petugas:               clean(row.petugas),
    inspektor:             clean(row.inspektor),
    team_name:             clean(row.team_name),
    keterangan:            clean(row.keterangan),
    penyulang:             clean(row.penyulang),
    ulp:                   clean(row.ulp),
    status:                clean(row.status) ?? "Temuan",
    lokasi:                clean(row.lokasi),
    koordinat:             clean(row.koordinat),
    jenis_pohon:           clean(row.jenis_pohon),
    tinggi_pohon:          row.tinggi_pohon != null ? Number(row.tinggi_pohon) : null,
    jarak_ke_jaringan:     row.jarak_ke_jaringan != null ? Number(row.jarak_ke_jaringan) : null,
    tingkat_risiko:        clean(row.tingkat_risiko),
    prediksi_inspektur:    clean(row.prediksi_inspektur),
    tindakan_rekomendasi:  clean(row.tindakan_rekomendasi),
    foto_sebelum_url:      clean(row.foto_sebelum_url),
    foto_lokasi_url:       clean(row.foto_lokasi_url),
    tgl_inspeksi:          clean(row.tgl_inspeksi),
    tgl_eksekusi:          clean(row.tgl_eksekusi),
    created_at:            clean(row.created_at),
    updated_at:            clean(row.updated_at),
  }));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Upsert inspeksi & inspeksi_pohon → Supabase\n");

  const inspeksiRows = readJson("inspeksi.json");
  const pohonRows    = readJson("inspeksi_pohon.json");

  console.log(`📦 inspeksi.json      : ${inspeksiRows.length} rows`);
  console.log(`📦 inspeksi_pohon.json: ${pohonRows.length} rows\n`);

  await upsert("inspeksi",       transformInspeksi(inspeksiRows));
  await upsert("inspeksi_pohon", transformInspeksiPohon(pohonRows));

  console.log("\n🎉 Selesai!");
}

main().catch((err) => {
  console.error("💥 Fatal:", err.message);
  process.exit(1);
});
