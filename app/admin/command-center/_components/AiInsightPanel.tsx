"use client";

import { useState, useRef } from "react";
import { Sparkles, RefreshCw, Bot } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AiInsightData {
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

interface Props {
  data: AiInsightData;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Highlight baris yang diawali ⚠ dan judul section
function renderText(text: string) {
  return text.split("\n").map((line, i) => {
    if (line.startsWith("RINGKASAN") || line.startsWith("PRIORITAS") || line.startsWith("INSIGHT")) {
      return (
        <div key={i} className="text-[10px] font-bold text-[#5eead4] uppercase tracking-wider mt-2 mb-0.5 first:mt-0">
          {line}
        </div>
      );
    }
    if (line.startsWith("⚠")) {
      return (
        <div key={i} className="flex gap-1.5 text-[11px] text-red-700 font-medium py-0.5">
          <span className="shrink-0">⚠</span>
          <span>{line.slice(1).trim()}</span>
        </div>
      );
    }
    if (line.trim() === "") return <div key={i} className="h-1" />;
    return <div key={i} className="text-[11px] text-[#e2e8f0] leading-relaxed">{line}</div>;
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

type State = "idle" | "loading" | "done" | "error";

export default function AiInsightPanel({ data }: Props) {
  const [state, setState] = useState<State>("idle");
  const [text, setText] = useState("");
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function runAnalysis() {
    // Batalkan request sebelumnya jika ada
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setState("loading");
    setText("");
    setError(null);

    try {
      const res = await fetch("/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        signal: abort.signal,
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      setState("loading"); // tetap loading sampai dapat karakter pertama

      let firstChunk = true;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (firstChunk) {
          setState("done"); // ganti ke done saat karakter pertama datang (streaming dimulai)
          firstChunk = false;
        }
        setText((prev) => prev + chunk);
      }

      setLastRun(new Date());
      setState("done");
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState("error");
      setError(e instanceof Error ? e.message : "Gagal menghubungi Gemini");
    }
  }

  const timeStr = lastRun?.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="flex flex-col bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden h-[50vh] shrink-0">
      {/* Header */}
      <div className="bg-linear-to-r from-[#1a1a2e] to-[#16213e] px-3 py-2.5 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-violet-400" />
          <span className="text-white text-xs font-bold tracking-wider uppercase">AI Analisis</span>
          <span className="text-violet-400/70 text-[10px] font-mono">· Gemini</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {lastRun && (
            <span className="text-white/40 text-[10px] font-mono">{timeStr}</span>
          )}
          <button
            onClick={runAnalysis}
            disabled={state === "loading"}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[10px] font-medium transition-colors"
          >
            {state === "loading" ? (
              <RefreshCw size={10} className="animate-spin" />
            ) : (
              <Sparkles size={10} />
            )}
            {state === "loading" ? "Menganalisis..." : state === "done" ? "Refresh" : "Analisis Sekarang"}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-2.5">
        {state === "idle" && (
          <div className="flex flex-col items-center justify-center h-16 gap-2">
            <Bot size={20} className="text-[#E2E8F0]" />
            <p className="text-[11px] text-[#94a3b8] text-center">
              Klik <span className="font-semibold text-violet-600">Analisis Sekarang</span> untuk insight AI
            </p>
          </div>
        )}

        {state === "loading" && text === "" && (
          <div className="flex items-center gap-2 h-16 justify-center">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-[11px] text-[#94a3b8]">Gemini sedang menganalisis...</span>
          </div>
        )}

        {(state === "done" || (state === "loading" && text !== "")) && (
          <div>
            {renderText(text)}
            {/* Cursor kedip saat streaming */}
            {state === "loading" && (
              <span className="inline-block w-0.5 h-3 bg-violet-500 ml-0.5 animate-pulse align-middle" />
            )}
          </div>
        )}

        {state === "error" && (
          <div className="flex flex-col gap-1 py-2">
            <p className="text-xs text-red-600 font-medium">Gagal menghubungi Gemini</p>
            <p className="text-[10px] text-[#94a3b8]">{error}</p>
            <button
              onClick={runAnalysis}
              className="text-[10px] text-violet-600 hover:underline text-left mt-1"
            >
              Coba lagi →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
