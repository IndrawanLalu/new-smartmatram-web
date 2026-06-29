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
const MAX_TOKENS = Number(process.env.CHAT_MAX_TOKENS ?? 2048);
// Timeout per percobaan model. Jika tak ada respons sampai sekian → pindah model.
const TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS ?? 15000);
const ULP_VALID = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

// reasoning_effort HANYA didukung model "thinking" Gemini (2.5/3.x). Provider lain
// (Groq llama-3.3, Ollama qwen2.5, dll) menolak param ini → jangan dikirim.
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
- Jawab ringkas, jelas, sopan, Bahasa Indonesia.
- Kamu PUNYA alat untuk mengambil data nyata. Jika user menanyakan data (jumlah gangguan, penyulang terbanyak, risiko besok), WAJIB pakai alat — jangan mengarang angka.
- Setelah dapat hasil alat, rangkum jadi jawaban natural. Sebutkan angkanya. Jika data kosong, katakan apa adanya.
- PENTING: gunakan PERSIS nama penyulang & ULP dari hasil alat. JANGAN mengarang/menebak ULP suatu penyulang — kalau hasil alat tidak menyebut ULP-nya, jangan tulis ULP-nya.
- "risiko/prediksi/besok" → pakai alat risiko_besok. "terbanyak/sering/sudah terjadi" → top_penyulang/statistik_gangguan.
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
      description: "Gangguan penyulang yang SUDAH TERJADI (sumber resmi: Google Sheet gangguanPenyulang). Filter tahun/bulan/ULP; jika tahun tak disebut, default tahun berjalan. Mengembalikan total + rincian per ULP + per PENYEBAB. Bila difilter ULP + bulan, juga DAFTAR kejadian (penyulang, tanggal, penyebab). Pakai untuk 'berapa gangguan' DAN 'penyebab gangguan'.",
      parameters: {
        type: "object",
        properties: {
          tahun: { type: "integer", description: "Tahun, mis. 2026. Default tahun ini." },
          bulan: { type: "integer", description: "Bulan 1-12 (opsional)." },
          ulp: { type: "string", description: "AMPENAN/CAKRANEGARA/GERUNG/TANJUNG (opsional)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "top_penyulang",
      description: "Daftar penyulang dengan gangguan terbanyak yang SUDAH TERJADI (sumber resmi: Google Sheet gangguanPenyulang). Default tahun = tahun berjalan jika tak disebut. BUKAN prediksi.",
      parameters: {
        type: "object",
        properties: {
          tahun: { type: "integer", description: "Tahun, mis. 2026." },
          bulan: { type: "integer", description: "Bulan 1-12 (opsional)." },
          ulp: { type: "string", description: "ULP (opsional)." },
          limit: { type: "integer", description: "Jumlah penyulang teratas (default 10)." },
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
      description: "Info & beban gardu distribusi (kondisi TERKINI). Bisa cari gardu tertentu (no_gardu), filter per ULP/penyulang, atau yang overload/suhu tinggi. Mengembalikan alamat, persen beban, suhu trafo, daya, tanggal ukur, status WO, dan link Google Maps (maps_url). Pakai utk pertanyaan soal gardu: beban, overload, suhu, alamat, lokasi/peta.",
      parameters: {
        type: "object",
        properties: {
          no_gardu: { type: "string", description: "Kode gardu spesifik, mis. AM003, MM049 (opsional)." },
          ulp: { type: "string", description: "AMPENAN/CAKRANEGARA/GERUNG/TANJUNG (opsional)." },
          penyulang: { type: "string", description: "Nama penyulang (opsional)." },
          hanya_overload: { type: "boolean", description: "true = hanya gardu beban >= 80%." },
          hanya_suhu_tinggi: { type: "boolean", description: "true = hanya gardu suhu trafo > 60 derajat C." },
          limit: { type: "integer", description: "Maksimal baris yang ditampilkan (default 15)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cari_standar",
      description: "Cari isi DOKUMEN PEMBELAJARAN PLN yang sudah di-ingest (buku standar konstruksi, SPLN, materi teknik). Pakai untuk SEMUA pertanyaan soal isi/topik buku atau dokumen tsb — termasuk 'buku X tentang apa', 'isi buku ...', 'menurut buku ...', standar, konstruksi, spesifikasi, jarak aman, teori/materi kelistrikan. Mengembalikan kutipan + sumber (buku & halaman) untuk dikutip. JANGAN jawab pertanyaan seperti ini dari ingatan; selalu pakai alat ini dulu.",
      parameters: {
        type: "object",
        properties: {
          pertanyaan: { type: "string", description: "Pertanyaan / istilah yang dicari di dokumen." },
          buku: { type: "string", description: "Batasi ke buku tertentu (opsional, mis. 'PLN buku 2')." },
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
interface GangguanRow { ulp: string; penyulang: string; penyebab: string; date: Date }
async function fetchGangguanSheet(): Promise<GangguanRow[]> {
  const raw = await fetchSheetData("gangguanPenyulang", "A:S");
  const out: GangguanRow[] = [];
  for (const r of raw) {
    const date = parseTglID(r.TANGGAL);
    if (!date) continue;
    out.push({
      ulp: (r.ULP ?? "").trim().toUpperCase(),
      penyulang: (r.PENYULANG_GANGGUAN ?? r["PENYULANG GANGGUAN"] ?? "").trim(),
      penyebab: (r.PENYEBAB_GANGGUAN ?? r["PENYEBAB GANGGUAN"] ?? "").trim(),
      date,
    });
  }
  return out;
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
const EMBED_KEY = process.env.GEMINI_API_KEY ?? "";
async function embedQuery(text: string): Promise<number[] | null> {
  if (!EMBED_KEY) return null;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${EMBED_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: 1536,
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
  const perUlp: Record<string, number> = {};
  const perPenyebab: Record<string, number> = {};
  for (const r of rows) {
    perUlp[r.ulp || "?"] = (perUlp[r.ulp || "?"] ?? 0) + 1;
    const cause = r.penyebab || "(tidak tercatat)";
    perPenyebab[cause] = (perPenyebab[cause] ?? 0) + 1;
  }
  // Daftar kejadian (penyulang + tgl + penyebab) hanya bila ULP & bulan spesifik — ringkas & akurat.
  const detail = ulp && a.bulan
    ? rows.slice(0, 40).map((r) => ({
        penyulang: r.penyulang,
        tgl: `${r.date.getDate()} ${BULAN_ID[r.date.getMonth() + 1]} ${r.date.getFullYear()}`,
        penyebab: r.penyebab || "tidak tercatat",
      }))
    : undefined;
  return {
    sumber: "Google Sheet gangguanPenyulang (data resmi)",
    periode: a.bulan ? `${BULAN_ID[a.bulan]} ${tahun}` : `tahun ${tahun}`,
    ulp_filter: ulp ?? "semua ULP",
    total: rows.length,
    per_ulp: perUlp,
    per_penyebab: perPenyebab,
    ...(detail ? { detail } : {}),
  };
}

async function topPenyulang(a: { tahun?: number; bulan?: number; ulp?: string; limit?: number }) {
  const tahun = a.tahun ?? new Date().getFullYear();
  const ulp = normUlp(a.ulp);
  const limit = Math.min(Math.max(a.limit ?? 10, 1), 20);
  const rows = filterGangguan(await fetchGangguanSheet(), tahun, a.bulan, ulp);
  const m: Record<string, number> = {};
  const ulpOf: Record<string, string> = {};
  for (const r of rows) {
    if (!r.penyulang) continue;
    m[r.penyulang] = (m[r.penyulang] ?? 0) + 1;
    if (r.ulp) ulpOf[r.penyulang] = r.ulp;
  }
  const top = Object.entries(m)
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([penyulang, jumlah]) => ({ penyulang, ulp: ulpOf[penyulang] ?? "?", jumlah }));
  return {
    sumber: "Google Sheet gangguanPenyulang (data resmi)",
    periode: a.bulan ? `${BULAN_ID[a.bulan]} ${tahun}` : `tahun ${tahun}`,
    ulp_filter: ulp ?? "semua ULP", top,
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

async function dataGardu(sb: SB, a: { no_gardu?: string; ulp?: string; penyulang?: string; hanya_overload?: boolean; hanya_suhu_tinggi?: boolean; limit?: number }) {
  const ulp = normUlp(a.ulp);
  const limit = Math.min(Math.max(a.limit ?? 15, 1), 50);
  let q = sb.from("gardu_latest_state")
    .select("no_gardu, alamat, penyulang, petugas_unit, persen_beban, suhu_trafo, kva_trafo, event_date, wo_sent_at", { count: "exact" });
  if (a.no_gardu) q = q.ilike("no_gardu", a.no_gardu.trim());
  if (ulp) q = q.eq("petugas_unit", ulp);
  if (a.penyulang) q = q.ilike("penyulang", `%${a.penyulang.trim()}%`);
  if (a.hanya_overload) q = q.gte("persen_beban", OVERLOAD_PCT);
  if (a.hanya_suhu_tinggi) q = q.gt("suhu_trafo", HIGH_TEMP_C);
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
    filter: {
      no_gardu: a.no_gardu ?? null, ulp: ulp ?? "semua ULP", penyulang: a.penyulang ?? null,
      overload: !!a.hanya_overload, suhu_tinggi: !!a.hanya_suhu_tinggi,
    },
    total_cocok: count ?? gardu.length,
    ditampilkan: gardu.length,
    gardu,
  };
}

async function cariStandar(sb: SB, a: { pertanyaan?: string; buku?: string }) {
  const q = (a.pertanyaan ?? "").trim();
  if (!q) return { error: "pertanyaan kosong" };
  const vec = await embedQuery(q);
  if (!vec) return { error: "Pencarian dokumen tak tersedia (GEMINI_API_KEY belum diset di server)." };
  const { data, error } = await sb.rpc("match_dokumen", {
    query_embedding: vec,
    match_count: 6,
    filter_buku: a.buku ?? null,
  });
  if (error) return { error: error.message };
  const hits = (data ?? []) as { buku: string; halaman: number; konten: string; similarity: number }[];
  if (hits.length === 0) return { info: "Tidak ditemukan bagian dokumen yang relevan." };
  return {
    catatan: "Jawab HANYA berdasarkan kutipan di bawah. WAJIB sebutkan sumber (buku + halaman). Jika kutipan tak menjawab, katakan tidak ditemukan di dokumen — jangan mengarang.",
    kutipan: hits.map((h) => ({
      buku: h.buku, halaman: h.halaman, isi: h.konten, skor: Math.round(h.similarity * 100) / 100,
    })),
  };
}

async function runTool(name: string, args: Record<string, unknown>, sb: SB): Promise<unknown> {
  try {
    if (name === "statistik_gangguan") return await statistikGangguan(args);
    if (name === "top_penyulang") return await topPenyulang(args);
    if (name === "risiko_besok") return await risikoBesok(sb);
    if (name === "data_gardu") return await dataGardu(sb, args);
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

function chatErr(status: number, body: string): string {
  if (status === 429) return "Semua model sedang kena rate limit. Tunggu ±1 menit lalu coba lagi.";
  if (status === 401 || status === 403) return "API key chat tidak valid / tak berwenang.";
  return `Model error ${status}: ${body.slice(0, 150) || "permintaan gagal"}`;
}

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
      const res = await chatOnce(model, messages, stream, withTools);
      if (res.ok) return { res, model };
      lastStatus = res.status;
      lastBody = await res.text().catch(() => "");
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
