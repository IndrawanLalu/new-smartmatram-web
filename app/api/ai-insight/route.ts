import { GoogleGenerativeAI } from "@google/generative-ai";

// Vercel: perpanjang timeout untuk Gemini 2.5 Pro (thinking model butuh waktu lebih)
export const maxDuration = 60;

// ── Types ─────────────────────────────────────────────────────────────────────

interface AiInsightPayload {
  tanggal: string;
  unit: string;
  gangguanCount: number;
  gangguanTerbanyak: { penyulang: string; count: number }[];
  garduTerpantau: number;
  avgBeban: number;
  garduOverload: { no_gardu: string; persen_beban: number; penyulang: string | null }[];
  garduSuhuTinggi: { no_gardu: string; suhu: number }[];
  inspeksiUrgent: number;
  inspeksiDalamProses: number;
}

// ── Prompt Builder ─────────────────────────────────────────────────────────────

function buildPrompt(d: AiInsightPayload): string {
  const overloadList =
    d.garduOverload.length > 0
      ? d.garduOverload.map((g) => `${g.no_gardu} (${g.persen_beban.toFixed(0)}%, feeder: ${g.penyulang ?? "-"})`).join(", ")
      : "tidak ada";

  const suhuList =
    d.garduSuhuTinggi.length > 0
      ? d.garduSuhuTinggi.map((g) => `${g.no_gardu} (${g.suhu}°C)`).join(", ")
      : "tidak ada";

  const gangguanList =
    d.gangguanTerbanyak.length > 0
      ? d.gangguanTerbanyak.map((g) => `${g.penyulang} (${g.count}x)`).join(", ")
      : "tidak ada data";

  return `Kamu adalah analis jaringan listrik PLN yang berpengalaman. Berikan analisis singkat, tajam, dan actionable berdasarkan data monitoring real-time berikut:

TANGGAL: ${d.tanggal}
UNIT: ${d.unit}

DATA GANGGUAN (bulan ini):
- Total gangguan: ${d.gangguanCount}
- Penyulang paling sering: ${gangguanList}

DATA GARDU:
- Total terpantau: ${d.garduTerpantau} gardu
- Rata-rata beban: ${d.avgBeban.toFixed(1)}%
- Overload (≥80%): ${overloadList}
- Suhu tinggi (>60°C): ${suhuList}

DATA INSPEKSI:
- Perlu tindakan segera: ${d.inspeksiUrgent} item
- Dalam proses: ${d.inspeksiDalamProses} item

Berikan respons dengan format PERSIS seperti ini (tidak perlu markdown, gunakan teks biasa):

RINGKASAN
[1-2 kalimat kondisi umum jaringan hari ini]

PRIORITAS TINDAKAN
⚠ [tindakan paling mendesak pertama]
⚠ [tindakan paling mendesak kedua]
⚠ [tindakan paling mendesak ketiga]

INSIGHT
[1 pola atau anomali menarik yang terdeteksi dari data di atas]

Gunakan bahasa Indonesia profesional. Singkat, padat, dan fokus pada tindakan. Total maksimal 120 kata.`;
}

// ── Route Handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response("GEMINI_API_KEY tidak dikonfigurasi", { status: 500 });
  }

  let payload: AiInsightPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 8192,
      },
    });

    const result = await model.generateContentStream(buildPrompt(payload));

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const text = chunk.text();
            if (text) controller.enqueue(new TextEncoder().encode(text));
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal menghubungi Gemini";
    return new Response(msg, { status: 500 });
  }
}
