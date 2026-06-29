import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OLLAMA_URL = process.env.OLLAMA_URL ?? "http://127.0.0.1:11434";
const MODEL = process.env.OLLAMA_MODEL ?? "qwen2.5:7b";
const ULP_VALID = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

function systemPrompt(): string {
  const hari = new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `Kamu "Asisten Smart Mataram" untuk PLN ULP Mataram/Ampenan. Hari ini: ${hari}.
- Jawab ringkas, jelas, sopan, Bahasa Indonesia.
- Kamu PUNYA alat untuk mengambil data nyata. Jika user menanyakan data (jumlah gangguan, penyulang terbanyak, risiko besok), WAJIB pakai alat — jangan mengarang angka.
- Setelah dapat hasil alat, rangkum jadi jawaban natural. Sebutkan angkanya. Jika data kosong, katakan apa adanya.
- PENTING: gunakan PERSIS nama penyulang & ULP dari hasil alat. JANGAN mengarang/menebak ULP suatu penyulang — kalau hasil alat tidak menyebut ULP-nya, jangan tulis ULP-nya.
- "risiko/prediksi/besok" → pakai alat risiko_besok. "terbanyak/sering/sudah terjadi" → top_penyulang/statistik_gangguan.
- ULP yang valid: AMPENAN, CAKRANEGARA, GERUNG, TANJUNG.`;
}

// ── Definisi alat (schema utk Ollama / OpenAI-style) ────────────────────────────
const TOOLS = [
  {
    type: "function",
    function: {
      name: "statistik_gangguan",
      description: "Jumlah gangguan penyulang yang SUDAH TERJADI (data historis), bisa difilter tahun, bulan, dan ULP. Mengembalikan total + rincian per ULP.",
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
      description: "Daftar penyulang dengan gangguan terbanyak yang SUDAH TERJADI (data historis masa lalu) pada periode tertentu. BUKAN prediksi.",
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
];

// ── Helper ──────────────────────────────────────────────────────────────────────
type SB = SupabaseClient;

async function fetchAll(sb: SB, table: string, columns: string, filter: (q: any) => any): Promise<any[]> {
  const PAGE = 1000;
  const out: any[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await filter(sb.from(table).select(columns).range(start, start + PAGE - 1));
    if (error) throw new Error(error.message);
    const b = data ?? [];
    out.push(...b);
    if (b.length < PAGE) break;
  }
  return out;
}

function dateRange(tahun?: number, bulan?: number): { from: string; to: string; label: string } | null {
  if (!tahun) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (bulan && bulan >= 1 && bulan <= 12) {
    const from = `${tahun}-${pad(bulan)}-01`;
    const to = bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${pad(bulan + 1)}-01`;
    const namaBln = ["", "Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"][bulan];
    return { from, to, label: `${namaBln} ${tahun}` };
  }
  return { from: `${tahun}-01-01`, to: `${tahun + 1}-01-01`, label: `tahun ${tahun}` };
}

function normUlp(u?: string): string | null {
  if (!u) return null;
  const up = u.trim().toUpperCase();
  return ULP_VALID.includes(up) ? up : null;
}

// ── Eksekutor alat ──────────────────────────────────────────────────────────────
async function statistikGangguan(sb: SB, a: { tahun?: number; bulan?: number; ulp?: string }) {
  const tahun = a.tahun ?? new Date().getFullYear();
  const rng = dateRange(tahun, a.bulan);
  const ulp = normUlp(a.ulp);
  const rows = await fetchAll(sb, "ml_outage_events", "ulp, tgl_gangguan", (q) => {
    let x = q;
    if (rng) x = x.gte("tgl_gangguan", rng.from).lt("tgl_gangguan", rng.to);
    if (ulp) x = x.eq("ulp", ulp);
    return x;
  });
  const perUlp: Record<string, number> = {};
  for (const r of rows) perUlp[r.ulp ?? "?"] = (perUlp[r.ulp ?? "?"] ?? 0) + 1;
  return { periode: rng?.label ?? `tahun ${tahun}`, ulp_filter: ulp ?? "semua ULP", total: rows.length, per_ulp: perUlp };
}

async function topPenyulang(sb: SB, a: { tahun?: number; bulan?: number; ulp?: string; limit?: number }) {
  const tahun = a.tahun ?? new Date().getFullYear();
  const rng = dateRange(tahun, a.bulan);
  const ulp = normUlp(a.ulp);
  const limit = Math.min(Math.max(a.limit ?? 10, 1), 20);
  const rows = await fetchAll(sb, "ml_outage_events", "penyulang, ulp, tgl_gangguan", (q) => {
    let x = q;
    if (rng) x = x.gte("tgl_gangguan", rng.from).lt("tgl_gangguan", rng.to);
    if (ulp) x = x.eq("ulp", ulp);
    return x;
  });
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
  return { periode: rng?.label ?? `tahun ${tahun}`, ulp_filter: ulp ?? "semua ULP", top };
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

async function runTool(name: string, args: Record<string, unknown>, sb: SB): Promise<unknown> {
  try {
    if (name === "statistik_gangguan") return await statistikGangguan(sb, args);
    if (name === "top_penyulang") return await topPenyulang(sb, args);
    if (name === "risiko_besok") return await risikoBesok(sb);
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

async function ollamaChat(messages: unknown[], stream: boolean, withTools: boolean): Promise<Response> {
  return fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, stream, ...(withTools ? { tools: TOOLS } : {}) }),
  });
}

function textStream(res: Response): Response {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) { controller.close(); return; }
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const s = line.trim();
        if (!s) continue;
        try {
          const obj = JSON.parse(s) as { message?: { content?: string } };
          if (obj.message?.content) controller.enqueue(encoder.encode(obj.message.content));
        } catch { /* abaikan */ }
      }
    },
    cancel() { reader.cancel().catch(() => {}); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

// GET → status: model aktif + apakah Ollama online & model sudah terunduh
export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let online = false;
  let installed = false;
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { cache: "no-store" });
    if (res.ok) {
      online = true;
      const j = (await res.json()) as { models?: { name: string }[] };
      installed = (j.models ?? []).some((m) => m.name === MODEL);
    }
  } catch { /* offline */ }
  return NextResponse.json({ model: MODEL, online, installed });
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

  const messages: unknown[] = [{ role: "system", content: systemPrompt() }, ...userMsgs];

  // Ronde 1: biarkan model memutuskan pakai alat atau tidak (tanpa stream agar mudah diparse).
  let r1: Response;
  try {
    r1 = await ollamaChat(messages, false, true);
  } catch {
    return NextResponse.json(
      { error: `Ollama tidak terjangkau di ${OLLAMA_URL}. Pastikan Ollama berjalan & model "${MODEL}" sudah diunduh.` },
      { status: 503 },
    );
  }
  if (!r1.ok) {
    const t = await r1.text().catch(() => "");
    return NextResponse.json({ error: `Ollama error ${r1.status}: ${t.slice(0, 200) || "model belum siap"}` }, { status: 502 });
  }

  const j1 = (await r1.json()) as { message?: { content?: string; tool_calls?: { function: { name: string; arguments: unknown } }[] } };
  const toolCalls = j1.message?.tool_calls ?? [];

  if (toolCalls.length === 0) {
    // Tak perlu alat → kirim jawaban langsung sebagai teks.
    const content = j1.message?.content ?? "(tidak ada jawaban)";
    return new Response(content, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }

  // Jalankan alat → susun pesan tool → ronde 2 (stream) untuk jawaban final.
  messages.push({ role: "assistant", content: j1.message?.content ?? "", tool_calls: toolCalls });
  for (const tc of toolCalls) {
    const result = await runTool(tc.function.name, parseArgs(tc.function.arguments), supabase);
    messages.push({ role: "tool", name: tc.function.name, content: JSON.stringify(result) });
  }

  let r2: Response;
  try {
    r2 = await ollamaChat(messages, true, false);
  } catch {
    return NextResponse.json({ error: "Ollama gagal pada tahap merangkum jawaban." }, { status: 503 });
  }
  if (!r2.ok || !r2.body) {
    return NextResponse.json({ error: `Ollama error ${r2.status}` }, { status: 502 });
  }
  return textStream(r2);
}
