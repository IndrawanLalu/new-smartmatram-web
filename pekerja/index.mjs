/**
 * SMART Mataram — "pekerja": pemicu yang tidak bisa dikerjakan web sendiri.
 *
 *   1. REALTIME  temuan inspeksi yang BARU menjadi Urgent / pohon yang BARU
 *                menjadi "Sangat Tinggi" → diteruskan ke web
 *                (`POST http://web:3000/api/wa-notify`, bentuk payload sama
 *                dengan webhook Supabase) → web kirim WA lewat gateway.
 *                Temuan JTM yang BARU berkategori Urgent (inspeksi_jtm_periksa)
 *                → ditahan 30 detik per tiang → `/api/wa-notify-jtm`.
 *   2. JADWAL    pengingat temuan urgent 08/11/15/18 WITA → `/api/wa-reminder`.
 *
 * Kenapa container sendiri: di homelab notif realtime mati diam-diam karena
 * pemicunya (wa-bot lama) tidak ikut dinyalakan, dan sebelumnya karena secret
 * webhook Supabase melenceng. Pekerja menyambung KELUAR ke Supabase dan bicara ke
 * web lewat jaringan Docker internal — tidak butuh URL publik, dan membaca `.env`
 * yang sama dengan web, jadi secret-nya tidak bisa berbeda.
 *
 * Isi pesan tetap di web (satu tempat). Pekerja hanya memicu.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SECRET = process.env.CRON_SECRET;
const WEB = (process.env.WEB_URL || "http://web:3000").replace(/\/$/, "");
const JAM_PENGINGAT = (process.env.JAM_PENGINGAT || "8,11,15,18").split(",").map(Number);

const log = (...a) => console.log(new Date().toISOString(), ...a);

if (!SUPABASE_URL || !SUPABASE_KEY || !SECRET) {
  log("❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / CRON_SECRET belum ada di .env");
  process.exit(1);
}

// ── Kirim ke web, dengan coba ulang singkat (web bisa sedang dibuat ulang) ────
async function kirim(path, init, label) {
  for (let ke = 1; ke <= 3; ke++) {
    try {
      const res = await fetch(`${WEB}${path}`, init);
      const isi = await res.text();
      log(`→ ${label}: HTTP ${res.status} ${isi.slice(0, 160)}`);
      if (res.status < 500) return;
    } catch (e) {
      log(`→ ${label}: gagal (${e.message}), coba ${ke}/3`);
    }
    await new Promise((r) => setTimeout(r, ke * 5000));
  }
}

// ── 1. Realtime ──────────────────────────────────────────────────────────────
// Dedupe 5 menit: INSERT disusul UPDATE beruntun, atau event ganda saat
// tersambung ulang. Penjaga "baru menjadi" ada di sini DAN di web.
const terkirim = new Map();
const sudah = (kunci) => {
  const kini = Date.now();
  for (const [k, t] of terkirim) if (kini - t > 5 * 60 * 1000) terkirim.delete(k);
  if (terkirim.has(kunci)) return true;
  terkirim.set(kunci, kini);
  return false;
};

const ATURAN = {
  inspeksi: (r) => r?.category === "Urgent",
  inspeksi_pohon: (r) => r?.tingkat_risiko === "Sangat Tinggi",
};

function tanganiPerubahan(payload) {
  const { table, eventType, new: baru, old: lama } = payload;
  const penting = ATURAN[table];
  if (!penting || !penting(baru)) return;
  // Tugas dari "Tugaskan" temuan JTM: WA-nya sudah terkirim saat regu menilai.
  if (table === "inspeksi" && baru.source === "inspeksi_jtm") return;
  // UPDATE yang memang sudah penting sebelumnya (ditugaskan, diproses, …) bukan berita baru.
  if (eventType === "UPDATE" && penting(lama)) return;
  if (sudah(`${table}:${baru.id}`)) return;
  void kirim(
    "/api/wa-notify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-webhook-secret": SECRET },
      body: JSON.stringify({ type: eventType, table, record: baru, old_record: lama ?? null }),
    },
    `notif ${table} ${baru.ulp ?? ""} ${baru.id}`,
  );
}

// Temuan JTM: satu kiriman regu menulis banyak baris penilaian sekaligus. Yang
// baru menjadi Urgent dikumpulkan per tiang (titik) selama 30 detik, lalu
// diteruskan sebagai SATU pesan per tiang.
const antreJtm = new Map(); // titik_id -> { ids: Set, waktu }
function tanganiJtm(payload) {
  const { eventType, new: baru, old: lama } = payload;
  if (baru?.kategori_temuan !== "Urgent") return;
  if (eventType === "UPDATE" && lama?.kategori_temuan === "Urgent") return;
  if (sudah(`jtm:${baru.id}`)) return;
  const a = antreJtm.get(baru.titik_id) ?? { ids: new Set(), waktu: null };
  a.ids.add(baru.id);
  if (!a.waktu) {
    a.waktu = setTimeout(() => {
      antreJtm.delete(baru.titik_id);
      void kirim(
        "/api/wa-notify-jtm",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-webhook-secret": SECRET },
          body: JSON.stringify({ periksa_ids: [...a.ids] }),
        },
        `notif JTM tiang ${baru.titik_id} (${a.ids.size} temuan)`,
      );
    }, 30 * 1000);
  }
  antreJtm.set(baru.titik_id, a);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

/** Satu kanal per kelompok tabel: kalau satu gagal (mis. tabel JTM belum masuk
 *  publication karena SQL-nya belum dijalankan), notif temuan lama tetap jalan. */
function pantau(nama, langganan) {
  let kanal = supabase.channel(nama);
  for (const [table, fn] of langganan) {
    kanal = kanal
      .on("postgres_changes", { event: "INSERT", schema: "public", table }, fn)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table }, fn);
  }
  // Satu kanal hanya bereaksi SEKALI pada putus. removeChannel sendiri memicu
  // CLOSED lagi; tanpa penjaga ini terjadi rekursi sampai Node crash (kejadian
  // nyata 6 Okt 2026, saat jaringan container belum siap di detik pertama).
  let putus = false;
  kanal.subscribe((status, err) => {
    if (putus) return;
    log(`realtime ${nama}: ${status}${err ? ` (${err.message})` : ""}`);
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      putus = true;
      setTimeout(() => {
        supabase.removeChannel(kanal).catch(() => {}).finally(() => pantau(nama, langganan));
      }, 15000);
    }
  });
}
pantau("temuan", [["inspeksi", tanganiPerubahan], ["inspeksi_pohon", tanganiPerubahan]]);
pantau("temuan-jtm", [["inspeksi_jtm_periksa", tanganiJtm]]);

// ── 2. Jadwal (WITA = UTC+8) ─────────────────────────────────────────────────
let terakhirJadwal = "";
setInterval(() => {
  const wita = new Date(Date.now() + 8 * 3600 * 1000);
  const jam = wita.getUTCHours();
  const menit = wita.getUTCMinutes();
  const kunci = `${wita.toISOString().slice(0, 10)} ${jam}`;
  if (menit !== 0 || !JAM_PENGINGAT.includes(jam) || terakhirJadwal === kunci) return;
  terakhirJadwal = kunci;
  void kirim("/api/wa-reminder", { method: "POST", headers: { "X-Cron-Secret": SECRET } }, `pengingat ${jam}:00 WITA`);
}, 20 * 1000);

log(`pekerja jalan — web ${WEB}, pengingat jam ${JAM_PENGINGAT.join("/")} WITA`);
