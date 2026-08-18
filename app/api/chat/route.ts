import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { fetchSheetData } from "@/lib/sheets";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Provider-agnostic: endpoint apa pun yang OpenAI-compatible (Gemini, OpenRouter,
// Groq, DeepSeek, ...). Pindah provider = cukup ubah env, tanpa sentuh kode.
const BASE = process.env.CHAT_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai";
const API_KEY = process.env.CHAT_API_KEY ?? process.env.GEMINI_API_KEY ?? "";
// Daftar model = rantai failover. Model pertama dipakai dulu; kalau timeout/error,
// otomatis lanjut ke model berikutnya. CHAT_MODELS (koma) atau CHAT_MODEL (tunggal).
const MODELS = (process.env.CHAT_MODELS ?? process.env.CHAT_MODEL ?? "gemini-2.5-flash")
  .split(",").map((s) => s.trim()).filter(Boolean);
// Model penalar (gpt-oss, o-series, Gemini thinking) menghabiskan sebagian
// anggaran ini untuk token penalaran yang TIDAK ikut tampil di jawaban. Diukur
// 2026-08-18 pada gpt-oss-120b: pertanyaan dokumen dengan 2048 berhenti di
// tengah kalimat (finish_reason "length"), dengan 4096 selesai utuh memakai
// ~3.400 token. Karena alur cari_standar memang menuntut jawaban lengkap,
// bawaannya 4096 — bukan angka pilih-pilih, itu batas terukurnya.
const MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS ?? 4096);
// Timeout per percobaan model. Jika tak ada respons sampai sekian → pindah model.
const TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS ?? 15000);
const ULP_VALID = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

// reasoning_effort HANYA dikirim untuk model "thinking" Gemini (2.5/3.x).
// Provider lain menolak param ini (Ollama qwen2.5) atau memaknainya berbeda —
// gpt-oss di Groq menerimanya, tapi tidak dikirim karena bawaannya sudah pas.
function isThinking(model: string): boolean {
  if (!/gemini/i.test(model)) return false;
  return /2\.5|gemini-3|flash-latest/.test(model);
}

// ── Batas pemakaian harian (pagar anti tagihan lari) ─────────────────────────
// Hitung per PESAN user (bukan per panggilan API). Counter in-memory: reset tiap
// ganti hari & saat server restart. Untuk plafon mutlak yg tahan restart, set juga
// quota/budget di Google Cloud Console.
const GLOBAL_DAILY_LIMIT = Number(process.env.CHAT_DAILY_LIMIT ?? 250);
const USER_DAILY_LIMIT = Number(process.env.CHAT_USER_DAILY_LIMIT ?? 25);
let usageDay = "";
let usageGlobal = 0;
const usageByUser = new Map<string, number>();

// Null = boleh (sekaligus dicatat +1); string = pesan penolakan bila kena batas.
function checkUsage(userId: string): string | null {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== usageDay) { usageDay = day; usageGlobal = 0; usageByUser.clear(); }
  if (usageGlobal >= GLOBAL_DAILY_LIMIT) {
    return "Kuota harian chatbot sudah tercapai. Silakan coba lagi besok. 🙏";
  }
  const used = usageByUser.get(userId) ?? 0;
  if (used >= USER_DAILY_LIMIT) {
    return `Kamu sudah memakai ${USER_DAILY_LIMIT} pesan hari ini (batas harian). Coba lagi besok. 🙏`;
  }
  usageGlobal += 1;
  usageByUser.set(userId, used + 1);
  return null;
}

function systemPrompt(): string {
  const hari = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `Kamu "Asisten Smart Mataram" untuk PLN ULP Mataram/Ampenan. Hari ini: ${hari}.
- Jawab jelas & sopan, Bahasa Indonesia. Untuk pertanyaan DATA/angka: ringkas. Untuk pertanyaan DOKUMEN/standar/buku: jawab LENGKAP & terstruktur (boleh beberapa paragraf atau poin), uraikan isi kutipan, jangan satu kalimat.
- Kamu PUNYA alat untuk mengambil data nyata. Jika user menanyakan data (jumlah gangguan, penyulang terbanyak, risiko besok), WAJIB pakai alat — jangan mengarang angka.
- Setelah dapat hasil alat, rangkum jadi jawaban natural. Sebutkan angkanya. Jika data kosong, katakan apa adanya.
- PENTING: gunakan PERSIS nama penyulang & ULP dari hasil alat. JANGAN mengarang/menebak ULP suatu penyulang — kalau hasil alat tidak menyebut ULP-nya, jangan tulis ULP-nya.
- "risiko/prediksi/besok" → pakai alat risiko_besok. "terbanyak/sering/sudah terjadi" → top_penyulang/statistik_gangguan.
- "durasi/lama padam/berapa jam padam" → pakai statistik_gangguan (ada durasi total, rata-rata, per ULP, dan 3 kejadian terlama). "penyulang mana paling lama padam" → top_penyulang dengan urut='durasi'. Sebutkan satuannya (jam/menit) dan jangan campur "jumlah kejadian" dengan "lama padam" — itu dua hal berbeda.
- "gardu/beban/overload/suhu/alamat/lokasi gardu" → pakai alat data_gardu. Jika hasil punya maps_url, sertakan link Google Maps itu di jawaban.
- Pertanyaan soal STANDAR/KONSTRUKSI/SPLN/spesifikasi/teori kelistrikan, ATAU soal ISI/TOPIK BUKU & DOKUMEN (mis. "buku 2 tentang apa", "isi buku ...", "menurut buku ...") → WAJIB panggil alat cari_standar DULU, lalu jawab berdasarkan kutipan & sebutkan sumber (buku + halaman). Jangan jawab dari ingatanmu sendiri, jangan mengarang.
- ULP yang valid: AMPENAN, CAKRANEGARA, GERUNG, TANJUNG.`;
}

// ── Definisi alat (schema utk Ollama / OpenAI-style) ────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "statistik_gangguan",
      description: "Gangguan penyulang yang SUDAH TERJADI (sumber resmi: Google Sheet gangguanPenyulang). Filter tahun/bulan/ULP; jika tahun tak disebut, default tahun berjalan. Mengembalikan total, DURASI PADAM (total jam + rata-rata menit, keseluruhan & per ULP), 3 kejadian TERLAMA, rincian per PENYEBAB, per FASILITAS padam (GI/PLTD, RECLOSER, dll) dan per INDIKATOR (EF/OC). Bila difilter ULP + bulan, juga DAFTAR kejadian (penyulang, tanggal, durasi, fasilitas, indikator, penyebab). Pakai untuk 'berapa gangguan', 'penyebab gangguan', DAN semua pertanyaan soal LAMA/DURASI PADAM.",
      parameters: {
        type: "object",
        properties: {
          tahun: { type: ["integer", "string"], description: "Tahun, mis. 2026. Default tahun ini." },
          bulan: { type: ["integer", "string"], description: "Bulan sebagai ANGKA 1-12 (Juli = 7)." },
          ulp: { type: "string", description: "AMPENAN/CAKRANEGARA/GERUNG/TANJUNG (opsional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "top_penyulang",
      description: "Peringkat penyulang dari gangguan yang SUDAH TERJADI (sumber resmi: Google Sheet gangguanPenyulang), lengkap dengan jumlah kejadian + total jam padam + rata-rata menit per penyulang. Default urut berdasarkan JUMLAH kejadian; pakai urut='durasi' untuk 'penyulang mana yang paling lama padam'. Default tahun = tahun berjalan. BUKAN prediksi.",
      parameters: {
        type: "object",
        properties: {
          tahun: { type: ["integer", "string"], description: "Tahun, mis. 2026." },
          bulan: { type: ["integer", "string"], description: "Bulan sebagai ANGKA 1-12 (Juli = 7)." },
          ulp: { type: "string", description: "ULP (opsional)." },
          limit: { type: ["integer", "string"], description: "Jumlah penyulang teratas (default 10)." },
          urut: { type: "string", enum: ["jumlah", "durasi"], description: "'jumlah' = paling sering terganggu (default); 'durasi' = paling lama padam." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "risiko_besok",
      description: "PREDIKSI risiko gangguan untuk BESOK (H+1, masa depan) dari model ML — daftar penyulang kritis & waspada beserta skor 0-100. Pakai alat INI untuk pertanyaan soal 'risiko', 'prediksi', atau 'besok'.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "data_gardu",
      description: "Info & beban gardu distribusi (kondisi TERKINI). Bisa cari gardu tertentu (no_gardu), filter per ULP/penyulang, yang overload/suhu tinggi, atau di atas ambang tertentu (min_persen/min_suhu). Mengembalikan alamat, persen beban, suhu trafo, daya, tanggal ukur, status WO, dan link Google Maps (maps_url). Pakai utk pertanyaan soal gardu: beban, overload, suhu, alamat, lokasi/peta.",
      parameters: {
        type: "object",
        properties: {
          no_gardu: { type: "string", description: "Kode gardu spesifik, mis. AM003, MM049 (opsional)." },
          ulp: { type: "string", description: "AMPENAN/CAKRANEGARA/GERUNG/TANJUNG (opsional)." },
          penyulang: { type: "string", description: "Nama penyulang (opsional)." },
          hanya_overload: { type: "boolean", description: "true = hanya gardu beban >= 80%." },
          hanya_suhu_tinggi: { type: "boolean", description: "true = hanya gardu suhu trafo > 60 derajat C." },
          min_persen: { type: ["number", "string"], description: "Ambang beban bawah, mis. 100 utk 'beban di atas 100%'. Pakai ini (BUKAN hanya_overload) kalau user menyebut angka persen sendiri." },
          min_suhu: { type: ["number", "string"], description: "Ambang suhu trafo bawah dalam derajat C, mis. 70." },
          limit: { type: ["integer", "string"], description: "Maksimal baris yang ditampilkan (default 15)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cari_standar",
      description: "Cari isi DOKUMEN PEMBELAJARAN PLN yang sudah di-ingest (buku standar konstruksi, SPLN, materi teknik). Pakai untuk SEMUA pertanyaan soal isi/topik buku atau dokumen tsb — termasuk 'buku X tentang apa', 'isi buku ...', 'menurut buku ...', standar, konstruksi, spesifikasi, jarak aman, teori/materi kelistrikan. Mencari di SEMUA buku & mengembalikan kutipan + sumber (buku & halaman) untuk dikutip. JANGAN jawab pertanyaan seperti ini dari ingatan; selalu pakai alat ini dulu.",
      parameters: {
        type: "object",
        properties: {
          pertanyaan: { type: "string", description: "Pertanyaan / istilah / topik yang dicari di dokumen." },
        },
        required: ["pertanyaan"],
      },
    },
  },
];

// ── Helper ──────────────────────────────────────────────────────────────────────
type SB = SupabaseClient;

function normUlp(u?: string): string | null {
  if (!u) return null;
  const up = u.trim().toUpperCase();
  return ULP_VALID.includes(up) ? up : null;
}

// ── Gangguan penyulang: SUMBER TUNGGAL = Google Sheet "gangguanPenyulang" ─────
// (BUKAN ml_outage_events / padam_apkt). Default periode = tahun berjalan.
const BULAN_ID = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const MONTH_IDX: Record<string, number> = {
  Januari: 0, Februari: 1, Maret: 2, April: 3, Mei: 4, Juni: 5,
  Juli: 6, Agustus: 7, September: 8, Oktober: 9, November: 10, Desember: 11,
};
function parseTglID(s?: string): Date | null {
  if (!s) return null;
  const p = s.trim().split(" ");
  if (p.length !== 3) return null;
  const d = parseInt(p[0]); const m = MONTH_IDX[p[1]]; const y = parseInt(p[2]);
  if (isNaN(d) || m === undefined || isNaN(y)) return null;
  return new Date(y, m, d);
}
/** Kolom DURASI sheet ditulis "H:MM:SS" ("0:55:12"). Jam bisa >24 untuk padam
 *  panjang, jadi jangan diparse sebagai jam dinding. Dikembalikan dalam menit
 *  supaya bisa dijumlah & dirata-rata tanpa aritmatika waktu. */
function durasiMenit(s?: string): number | null {
  const p = (s ?? "").trim().split(":").map(Number);
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null;
  return p[0] * 60 + p[1] + p[2] / 60;
}

interface GangguanRow {
  ulp: string; penyulang: string; penyebab: string; date: Date;
  durasiMnt: number | null; durasiTeks: string; fasilitas: string; indikator: string; kode: string;
}

async function fetchGangguanSheet(): Promise<GangguanRow[]> {
  const raw = await fetchSheetData("gangguanPenyulang", "A:S");
  const out: GangguanRow[] = [];
  for (const r of raw) {
    const date = parseTglID(r.TANGGAL);
    if (!date) continue;
    const ulp = (r.ULP ?? "").trim().toUpperCase();
    // Sheet ini dulu se-UIW NTB: 2022-2024 memuat PRAYA/SELONG/PRINGGABAYA yang
    // milik UP3 lain (2026 sudah bersih). Tanpa pagar ini, pertanyaan tahun lama
    // tanpa sebut ULP menghitung UP3 lain dan tak sebanding dengan angka aplikasi.
    if (!ULP_VALID.includes(ulp)) continue;
    const durasiTeks = (r.DURASI ?? "").trim();
    out.push({
      ulp,
      penyulang: (r.PENYULANG_GANGGUAN ?? r["PENYULANG GANGGUAN"] ?? "").trim(),
      penyebab: (r.PENYEBAB_GANGGUAN ?? r["PENYEBAB GANGGUAN"] ?? "").trim(),
      date,
      durasiMnt: durasiMenit(durasiTeks),
      durasiTeks,
      fasilitas: (r.FASILITAS_PADAM ?? r["FASILITAS PADAM"] ?? "").trim(),
      indikator: (r.INDIKATOR ?? "").trim(),
      kode: (r.KODE ?? "").trim(),
    });
  }
  return out;
}

/** Ringkasan durasi sekelompok kejadian. Menit dibulatkan 1 desimal — presisi
 *  detik tak berarti untuk laporan, dan angka panjang memboroskan token. */
function ringkasDurasi(rows: GangguanRow[]) {
  const nilai = rows.map((r) => r.durasiMnt).filter((n): n is number => n !== null);
  if (!nilai.length) return { jumlah: rows.length, total_jam: null, rata2_menit: null };
  const total = nilai.reduce((a, b) => a + b, 0);
  return {
    jumlah: rows.length,
    total_jam: Math.round((total / 60) * 10) / 10,
    rata2_menit: Math.round((total / nilai.length) * 10) / 10,
  };
}
// Filter sheet sesuai tahun/bulan/ulp (default tahun = tahun berjalan).
function filterGangguan(all: GangguanRow[], tahun: number, bulan?: number, ulp?: string | null): GangguanRow[] {
  return all.filter((r) => {
    if (r.date.getFullYear() !== tahun) return false;
    if (bulan && bulan >= 1 && bulan <= 12 && r.date.getMonth() + 1 !== bulan) return false;
    if (ulp && r.ulp !== ulp) return false;
    return true;
  });
}

const OVERLOAD_PCT = 80;
const HIGH_TEMP_C = 60;

// Embedding query utk RAG. Selalu pakai GEMINI_API_KEY (model embedding khusus),
// terlepas dari provider chat. Harus cocok dgn ingest: gemini-embedding-001 @ 1536.
// Embedding query RAG — HARUS sama dgn yg dipakai saat ingest (ingest_dokumen.py)
// & dimensi tabel dokumen_chunks. Default Ollama nomic-embed-text (gratis, lokal);
// utk VPS set EMBED_PROVIDER=gemini + EMBED_MODEL=gemini-embedding-001.
const EMBED_PROVIDER = process.env.EMBED_PROVIDER ?? "ollama";
const EMBED_BASE = process.env.EMBED_BASE_URL ?? "http://127.0.0.1:11434";
const EMBED_MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text";
const EMBED_DIM = Number(process.env.EMBED_DIM ?? 768);

async function embedQuery(text: string): Promise<number[] | null> {
  try {
    if (EMBED_PROVIDER === "ollama") {
      const r = await fetch(`${EMBED_BASE}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: EMBED_MODEL, input: `search_query: ${text}` }),
      });
      if (!r.ok) return null;
      const j = (await r.json()) as { embeddings?: number[][] };
      return j.embeddings?.[0] ?? null;
    }
    const key = process.env.GEMINI_API_KEY ?? "";
    if (!key) return null;
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: EMBED_DIM,
        }),
      },
    );
    if (!r.ok) return null;
    const j = (await r.json()) as { embedding?: { values?: number[] } };
    return j.embedding?.values ?? null;
  } catch { return null; }
}

// no_gardu → URL Google Maps (kolom "TITIK GARDU" di sheet dataGarduProbis). Cached 5 menit di lib/sheets.
async function garduMapsMap(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const rows = await fetchSheetData("dataGarduProbis", "A:Z");
    for (const r of rows) {
      const kode = (r["NO GARDU"] ?? "").trim().toUpperCase();
      const titik = (r["TITIK GARDU"] ?? "").trim();
      if (kode && /^https?:\/\//.test(titik)) map.set(kode, titik);
    }
  } catch { /* sheet gagal → jalan tanpa koordinat presisi */ }
  return map;
}

// ── Eksekutor alat ──────────────────────────────────────────────────────────────
async function statistikGangguan(a: { tahun?: number; bulan?: number; ulp?: string }) {
  const tahun = a.tahun ?? new Date().getFullYear();
  const ulp = normUlp(a.ulp);
  const rows = filterGangguan(await fetchGangguanSheet(), tahun, a.bulan, ulp);

  const grupUlp: Record<string, GangguanRow[]> = {};
  const perPenyebab: Record<string, number> = {};
  const perFasilitas: Record<string, number> = {};
  const perIndikator: Record<string, number> = {};
  for (const r of rows) {
    (grupUlp[r.ulp || "?"] ??= []).push(r);
    perPenyebab[r.penyebab || "(tidak tercatat)"] = (perPenyebab[r.penyebab || "(tidak tercatat)"] ?? 0) + 1;
    if (r.fasilitas) perFasilitas[r.fasilitas] = (perFasilitas[r.fasilitas] ?? 0) + 1;
    if (r.indikator) perIndikator[r.indikator] = (perIndikator[r.indikator] ?? 0) + 1;
  }
  const perUlp = Object.fromEntries(
    Object.entries(grupUlp).map(([u, rs]) => [u, ringkasDurasi(rs)]),
  );

  const terlama = [...rows]
    .filter((r) => r.durasiMnt !== null)
    .sort((x, y) => y.durasiMnt! - x.durasiMnt!)
    .slice(0, 3)
    .map((r) => ({
      penyulang: r.penyulang,
      ulp: r.ulp,
      tgl: `${r.date.getDate()} ${BULAN_ID[r.date.getMonth() + 1]} ${r.date.getFullYear()}`,
      durasi: r.durasiTeks,
      penyebab: r.penyebab || "tidak tercatat",
    }));

  // Daftar kejadian hanya bila ULP & bulan spesifik — ringkas & akurat.
  const detail = ulp && a.bulan
    ? rows.slice(0, 40).map((r) => ({
        penyulang: r.penyulang,
        tgl: `${r.date.getDate()} ${BULAN_ID[r.date.getMonth() + 1]} ${r.date.getFullYear()}`,
        durasi: r.durasiTeks || "tidak tercatat",
        fasilitas: r.fasilitas || null,
        indikator: r.indikator || null,
        penyebab: r.penyebab || "tidak tercatat",
      }))
    : undefined;

  return {
    sumber: "Google Sheet gangguanPenyulang (data resmi)",
    cakupan: `ULP ${ULP_VALID.join(", ")} (UP3 Mataram)`,
    periode: a.bulan ? `${BULAN_ID[a.bulan]} ${tahun}` : `tahun ${tahun}`,
    ulp_filter: ulp ?? "semua ULP",
    total: rows.length,
    durasi: ringkasDurasi(rows),
    catatan_durasi: "total_jam = akumulasi lama padam; rata2_menit = rata-rata per kejadian.",
    per_ulp: perUlp,
    per_penyebab: perPenyebab,
    ...(Object.keys(perFasilitas).length ? { per_fasilitas: perFasilitas } : {}),
    ...(Object.keys(perIndikator).length ? { per_indikator: perIndikator } : {}),
    ...(terlama.length ? { terlama } : {}),
    ...(detail ? { detail } : {}),
  };
}

async function topPenyulang(a: { tahun?: number; bulan?: number; ulp?: string; limit?: number; urut?: string }) {
  const tahun = a.tahun ?? new Date().getFullYear();
  const ulp = normUlp(a.ulp);
  const limit = Math.min(Math.max(a.limit ?? 10, 1), 20);
  // "paling sering" dan "paling lama padam" adalah dua peringkat berbeda —
  // penyulang dgn 1 gangguan 3 jam kalah sering tapi paling parah dampaknya.
  const urutDurasi = (a.urut ?? "").toLowerCase().startsWith("dur");
  const rows = filterGangguan(await fetchGangguanSheet(), tahun, a.bulan, ulp);

  const grup: Record<string, GangguanRow[]> = {};
  const ulpOf: Record<string, string> = {};
  for (const r of rows) {
    if (!r.penyulang) continue;
    (grup[r.penyulang] ??= []).push(r);
    if (r.ulp) ulpOf[r.penyulang] = r.ulp;
  }

  const top = Object.entries(grup)
    .map(([penyulang, rs]) => ({ penyulang, ulp: ulpOf[penyulang] ?? "?", ...ringkasDurasi(rs) }))
    .sort((x, y) => (urutDurasi ? (y.total_jam ?? 0) - (x.total_jam ?? 0) : y.jumlah - x.jumlah))
    .slice(0, limit);

  return {
    sumber: "Google Sheet gangguanPenyulang (data resmi)",
    cakupan: `ULP ${ULP_VALID.join(", ")} (UP3 Mataram)`,
    periode: a.bulan ? `${BULAN_ID[a.bulan]} ${tahun}` : `tahun ${tahun}`,
    ulp_filter: ulp ?? "semua ULP",
    diurutkan_berdasarkan: urutDurasi ? "total lama padam" : "jumlah kejadian",
    top,
  };
}

async function risikoBesok(sb: SB) {
  const { data: latest } = await sb.from("daily_feeder_risk").select("tgl").order("tgl", { ascending: false }).limit(1).maybeSingle();
  if (!latest?.tgl) return { info: "Belum ada prediksi risiko. Pipeline ML mungkin belum dijalankan." };
  const { data } = await sb
    .from("daily_feeder_risk")
    .select("penyulang, ulp, risk_score, risk_level, predicted_cause")
    .eq("tgl", latest.tgl)
    .neq("risk_level", "aman")
    .order("risk_score", { ascending: false });
  const rows = data ?? [];
  // Sudah dikelompokkan per ULP agar model menyajikan apa adanya (tak salah grup).
  const per_ulp: Record<string, { penyulang: string; skor: number; level: string; dugaan: string | null }[]> = {};
  for (const r of rows) {
    const u = r.ulp ?? "?";
    (per_ulp[u] ??= []).push({
      penyulang: r.penyulang, skor: Math.round(r.risk_score), level: r.risk_level, dugaan: r.predicted_cause,
    });
  }
  return {
    tanggal: latest.tgl,
    kritis: rows.filter((r) => r.risk_level === "kritis").length,
    waspada: rows.filter((r) => r.risk_level === "waspada").length,
    catatan: "Data sudah dikelompokkan per ULP. Sajikan sesuai pengelompokan ini; JANGAN pindahkan penyulang ke ULP lain.",
    per_ulp,
  };
}

async function dataGardu(sb: SB, a: {
  no_gardu?: string; ulp?: string; penyulang?: string;
  hanya_overload?: boolean; hanya_suhu_tinggi?: boolean;
  min_persen?: number; min_suhu?: number; limit?: number;
}) {
  const ulp = normUlp(a.ulp);
  const limit = Math.min(Math.max(a.limit ?? 15, 1), 50);
  let q = sb.from("gardu_latest_state")
    .select("no_gardu, alamat, penyulang, petugas_unit, persen_beban, suhu_trafo, kva_trafo, event_date, wo_sent_at", { count: "exact" });
  if (a.no_gardu) q = q.ilike("no_gardu", a.no_gardu.trim());
  if (ulp) q = q.eq("petugas_unit", ulp);
  if (a.penyulang) q = q.ilike("penyulang", `%${a.penyulang.trim()}%`);
  // Ambang eksplisit menang atas flag: kalau user menyebut ">100%", jangan
  // diam-diam dilebarkan jadi ">=80%" oleh hanya_overload yang ikut terkirim.
  if (a.min_persen !== undefined) q = q.gte("persen_beban", a.min_persen);
  else if (a.hanya_overload) q = q.gte("persen_beban", OVERLOAD_PCT);
  if (a.min_suhu !== undefined) q = q.gt("suhu_trafo", a.min_suhu);
  else if (a.hanya_suhu_tinggi) q = q.gt("suhu_trafo", HIGH_TEMP_C);
  const { data, count, error } = await q.order("persen_beban", { ascending: false }).limit(limit);
  if (error) return { error: error.message };

  const rows = (data ?? []) as Record<string, unknown>[];
  const maps = await garduMapsMap();
  const gardu = rows.map((r) => {
    const kode = String(r.no_gardu ?? "").toUpperCase();
    const alamat = (r.alamat as string) ?? null;
    const beban = r.persen_beban as number | null;
    return {
      no_gardu: r.no_gardu,
      alamat,
      penyulang: r.penyulang,
      ulp: r.petugas_unit,
      persen_beban: beban != null ? Math.round(beban * 10) / 10 : null,
      suhu_trafo: r.suhu_trafo,
      daya_kva: r.kva_trafo,
      tanggal_ukur: r.event_date,
      status_wo: r.wo_sent_at ? "sudah di-WO" : "belum di-WO",
      maps_url: maps.get(kode)
        ?? (alamat ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alamat)}` : null),
    };
  });
  return {
    // Ambang yang BENAR-BENAR dipakai ikut dikirim balik supaya model menyebut
    // angka yang sama dengan yang difilter, bukan menebak dari pertanyaan.
    filter: {
      no_gardu: a.no_gardu ?? null, ulp: ulp ?? "semua ULP", penyulang: a.penyulang ?? null,
      beban_minimal_persen: a.min_persen ?? (a.hanya_overload ? OVERLOAD_PCT : null),
      suhu_minimal_c: a.min_suhu ?? (a.hanya_suhu_tinggi ? HIGH_TEMP_C : null),
    },
    total_cocok: count ?? gardu.length,
    ditampilkan: gardu.length,
    gardu,
  };
}

async function cariStandar(sb: SB, a: { pertanyaan?: string }) {
  const q = (a.pertanyaan ?? "").trim();
  if (!q) return { error: "pertanyaan kosong" };
  const vec = await embedQuery(q);
  if (!vec) return { error: "Pencarian dokumen tak tersedia (embedding gagal)." };
  const { data, error } = await sb.rpc("match_dokumen", {
    query_embedding: vec,
    match_count: 10,
    filter_buku: null,
  });
  if (error) return { error: error.message };
  const hits = (data ?? []) as { buku: string; halaman: number; konten: string; similarity: number }[];
  if (hits.length === 0) return { info: "Tidak ditemukan bagian dokumen yang relevan." };
  return {
    catatan: "Susun jawaban LENGKAP & terstruktur dari SEMUA kutipan relevan di bawah (uraikan, jangan satu kalimat). WAJIB sebutkan sumber (buku + halaman) di tiap poin penting. Hanya berdasarkan kutipan ini; jika tak menjawab, katakan tidak ditemukan — jangan mengarang.",
    kutipan: hits.map((h) => ({
      buku: h.buku, halaman: h.halaman, isi: h.konten, skor: Math.round(h.similarity * 100) / 100,
    })),
  };
}

// ── Normalisasi argumen dari model ──────────────────────────────────────────────
// Model kelas 70B masih sering mengirim `"bulan": "Juli"` atau `"limit": "10"`.
// Groq MEMVALIDASI argumen terhadap skema di sisi mereka dan menolak seluruh
// request (400 tool_use_failed) kalau tipenya meleset — model tidak diberi
// kesempatan memperbaiki diri. Karena itu skema di TOOLS sengaja menerima angka
// ATAU string, lalu dirapikan di sini. Satu tempat, executor tetap bertipe ketat.
function toStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function toNum(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const n = Number(v.replace(/[%\s]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

function toInt(v: unknown): number | undefined {
  const n = toNum(v);
  return n === undefined ? undefined : Math.trunc(n);
}

/** Awalan nama bulan ID + EN — model tidak selalu menjawab dalam bahasa prompt. */
const BULAN_PREFIX = ["jan", "feb", "mar", "apr", "mei|may", "jun", "jul", "ag|au", "sep", "o[kc]t", "nov", "de[sc]"];

/** "7" · 7 · "Juli" · "juli 2026" · "July" → 7. Di luar 1-12 = dianggap tak disebut. */
function toBulan(v: unknown): number | undefined {
  const n = toInt(v);
  if (n !== undefined) return n >= 1 && n <= 12 ? n : undefined;
  const s = toStr(v)?.toLowerCase();
  if (!s) return undefined;
  const idx = BULAN_PREFIX.findIndex((p) => new RegExp(`^(${p})`).test(s));
  return idx >= 0 ? idx + 1 : undefined;
}

function toBool(v: unknown): boolean | undefined {
  if (typeof v === "boolean") return v;
  const s = toStr(v)?.toLowerCase();
  if (s === "true" || s === "ya" || s === "1") return true;
  if (s === "false" || s === "tidak" || s === "0") return false;
  return undefined;
}

async function runTool(name: string, args: Record<string, unknown>, sb: SB): Promise<unknown> {
  try {
    if (name === "statistik_gangguan")
      return await statistikGangguan({
        tahun: toInt(args.tahun),
        bulan: toBulan(args.bulan),
        ulp: toStr(args.ulp),
      });
    if (name === "top_penyulang")
      return await topPenyulang({
        tahun: toInt(args.tahun),
        bulan: toBulan(args.bulan),
        ulp: toStr(args.ulp),
        limit: toInt(args.limit),
        urut: toStr(args.urut),
      });
    if (name === "risiko_besok") return await risikoBesok(sb);
    if (name === "data_gardu")
      return await dataGardu(sb, {
        no_gardu: toStr(args.no_gardu),
        ulp: toStr(args.ulp),
        penyulang: toStr(args.penyulang),
        hanya_overload: toBool(args.hanya_overload),
        hanya_suhu_tinggi: toBool(args.hanya_suhu_tinggi),
        min_persen: toNum(args.min_persen),
        min_suhu: toNum(args.min_suhu),
        limit: toInt(args.limit),
      });
    if (name === "cari_standar") return await cariStandar(sb, args);
    return { error: `alat tidak dikenal: ${name}` };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function parseArgs(a: unknown): Record<string, unknown> {
  if (a && typeof a === "object") return a as Record<string, unknown>;
  if (typeof a === "string") { try { return JSON.parse(a); } catch { return {}; } }
  return {};
}

interface ToolCall { id: string; type?: string; function: { name: string; arguments: string } }
interface ChatMessage { role: string; content?: string | null; tool_calls?: ToolCall[] }

/** Groq menolak seluruh request (400) kalau panggilan alat hasil generate model
 *  tak lolos validasi skema — kode `tool_use_failed`, atau pesan "did not match
 *  schema". Ini kesalahan model menyusun JSON, bukan kesalahan permintaan user. */
function isToolCallError(status: number, body: string): boolean {
  return status === 400 && /tool_use_failed|did not match schema|Failed to call a function/i.test(body);
}

function chatErr(status: number, body: string): string {
  if (status === 429) return "Semua model sedang kena rate limit. Tunggu ±1 menit lalu coba lagi.";
  if (status === 401 || status === 403) return "API key chat tidak valid / tak berwenang.";
  if (isToolCallError(status, body)) {
    return "Asisten gagal menyusun permintaan data (sudah dicoba ulang otomatis). Coba tulis ulang pertanyaannya lebih spesifik — sebutkan ULP, dan bulan sebagai angka.";
  }
  return `Model error ${status}: ${body.slice(0, 150) || "permintaan gagal"}`;
}

/** Disisipkan saat percobaan ulang: model diberi tahu persis apa yang salah.
 *  Tanpa ini, percobaan kedua cenderung mengulangi kesalahan yang sama. */
const TOOL_RETRIES = 2;

const REPAIR_HINT =
  "PERBAIKAN: panggilan alat barusan DITOLAK karena tidak sesuai skema. Ulangi sekali lagi dengan aturan ketat: " +
  "(1) hanya gunakan parameter yang ada di skema alat, jangan mengarang parameter baru; " +
  "(2) bulan & tahun ditulis sebagai ANGKA (Juli = 7, bukan \"Juli\"); " +
  "(3) untuk ambang beban/suhu yang disebut user (mis. 'di atas 100%'), pakai min_persen / min_suhu; " +
  "(4) argumen harus JSON valid.";

// Satu percobaan ke satu model, dengan timeout. fetch resolve saat header tiba
// (sebelum body) → utk stream, timeout hanya menjaga "time to first byte", bukan
// keseluruhan stream, jadi jawaban panjang tak terpotong.
async function chatOnce(model: string, messages: unknown[], stream: boolean, withTools: boolean): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      signal: ac.signal,
      body: JSON.stringify({
        model,
        messages,
        stream,
        max_tokens: MAX_TOKENS,
        ...(isThinking(model) ? { reasoning_effort: "none" } : {}),
        ...(withTools ? { tools: TOOLS, tool_choice: "auto" } : {}),
      }),
    });
  } finally {
    clearTimeout(timer);
  }
}

// Coba tiap model berurutan; lewati yang timeout / error (429/5xx/dll) → model berikutnya.
async function chatFailover(
  models: string[], messages: unknown[], stream: boolean, withTools: boolean,
): Promise<{ res: Response; model: string } | { error: string }> {
  let lastStatus = 0, lastBody = "";
  for (const model of models) {
    try {
      let res = await chatOnce(model, messages, stream, withTools);
      if (res.ok) return { res, model };
      lastStatus = res.status;
      lastBody = await res.text().catch(() => "");
      console.error(`[chat] ${model} → HTTP ${lastStatus}: ${lastBody.slice(0, 500)}`);

      // Panggilan alat cacat = kesalahan sesaat model menyusun token pemanggil
      // fungsi (mis. `<function=nama={…}` — tanda `>` hilang), BUKAN model ini
      // rusak; pindah model tak menolong. Ulangi ke model yang sama dengan
      // petunjuk perbaikan. Terukur 2026-07-31 pada llama-3.3-70b: tanpa
      // petunjuk gagal ~1 dari 3, dengan petunjuk 6 dari 6 lolos.
      for (let attempt = 0; attempt < TOOL_RETRIES && withTools && isToolCallError(lastStatus, lastBody); attempt++) {
        res = await chatOnce(model, [...messages, { role: "system", content: REPAIR_HINT }], stream, withTools);
        if (res.ok) return { res, model };
        lastStatus = res.status;
        lastBody = await res.text().catch(() => "");
        console.error(`[chat] ${model} retry#${attempt + 1} → HTTP ${lastStatus}: ${lastBody.slice(0, 500)}`);
      }
      // Termasuk 429: di OpenRouter rate-limit bersifat PER-MODEL (upstream), jadi
      // model berikutnya bisa saja jalan → tetap lanjut failover.
    } catch (e) {
      lastStatus = 0;
      lastBody = (e as Error).name === "AbortError" ? "timeout" : (e as Error).message;
    }
  }
  return { error: lastStatus ? chatErr(lastStatus, lastBody) : `Semua model gagal (${lastBody}).` };
}

// Parse stream OpenAI/SSE → teks polos. Pakai start() (baca habis dalam loop) — bukan
// pull() — karena pull() bisa menggantung setelah chunk pertama di sebagian runtime.
function sseStream(res: Response): Response {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = res.body!.getReader();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            const payload = s.slice(5).trim();
            if (payload === "[DONE]") return;
            try {
              const obj = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
              const c = obj.choices?.[0]?.delta?.content;
              if (c) controller.enqueue(encoder.encode(c));
            } catch { /* keep-alive / chunk parsial */ }
          }
        }
      } finally {
        try { controller.close(); } catch { /* sudah ditutup */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

// GET → status: model aktif + apakah API key sudah dikonfigurasi.
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const configured = Boolean(API_KEY);
  return NextResponse.json({ model: MODELS[0], models: MODELS, online: configured, installed: configured });
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const userMsgs = (body as { messages?: { role: string; content: string }[] }).messages;
  if (!Array.isArray(userMsgs) || userMsgs.length === 0) {
    return NextResponse.json({ error: "messages kosong" }, { status: 400 });
  }
  if (!API_KEY) {
    return NextResponse.json({ error: "API key chat (CHAT_API_KEY / GEMINI_API_KEY) belum diset di server." }, { status: 503 });
  }

  // Pagar pemakaian harian: tolak (sekaligus catat) sebelum memanggil LLM apa pun.
  const capMsg = checkUsage(user.id);
  if (capMsg) return NextResponse.json({ error: capMsg }, { status: 429 });

  // Pilihan model dari UI: jika user pilih 1 model -> mulai dari situ lalu sisanya
  // sebagai cadangan; jika "auto"/kosong -> pakai urutan default MODELS.
  const picked = (body as { model?: string }).model;
  const order = picked && MODELS.includes(picked)
    ? [picked, ...MODELS.filter((m) => m !== picked)]
    : MODELS;

  const messages: unknown[] = [{ role: "system", content: systemPrompt() }, ...userMsgs];

  // Ronde 1 (non-stream): model putuskan pakai alat atau tidak. Failover antar model.
  const a = await chatFailover(order, messages, false, true);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: 502 });

  const j1 = (await a.res.json()) as { choices?: { message?: ChatMessage }[] };
  const msg1 = j1.choices?.[0]?.message;
  const toolCalls = msg1?.tool_calls ?? [];

  if (toolCalls.length === 0) {
    // Tak perlu alat -> kirim jawaban langsung sebagai teks.
    const content = msg1?.content ?? "(tidak ada jawaban)";
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  // Jalankan alat -> susun pesan tool -> ronde 2 (stream) untuk jawaban final.
  // Echo pesan assistant apa adanya (berisi tool_calls + id) sesuai protokol OpenAI.
  messages.push({ ...msg1, content: msg1?.content ?? "" });
  for (const tc of toolCalls) {
    const result = await runTool(tc.function.name, parseArgs(tc.function.arguments), supabase);
    messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
  }

  // Ronde 2: utamakan model yang berhasil di ronde 1, sisanya cadangan.
  const order2 = [a.model, ...order.filter((m) => m !== a.model)];
  const b = await chatFailover(order2, messages, true, false);
  if ("error" in b) return NextResponse.json({ error: b.error }, { status: 502 });
  if (!b.res.body) return NextResponse.json({ error: "Respons stream kosong." }, { status: 502 });
  return sseStream(b.res);
}
