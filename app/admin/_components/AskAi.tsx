"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Send,
  Loader2,
  Sparkles,
  RotateCcw,
  PanelLeftOpen,
  PanelRightOpen,
  TriangleAlert,
} from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
  /** Giliran yang gagal — tampil di layar, tapi tidak pernah dikirim ke model. */
  error?: boolean;
}

interface Status {
  model: string;
  models?: string[];
  online: boolean;
  installed: boolean;
}

/** Layar kosong yang cuma bertulis "ada yang bisa dibantu?" memaksa orang
 *  menebak asisten ini bisa apa. Tiap contoh di bawah memetakan satu alat yang
 *  memang dimiliki asisten (data gardu, prediksi ML, rekap & standar). */
const CONTOH_TANYA = [
  "Gardu mana yang overload hari ini?",
  "Penyulang mana yang berisiko gangguan besok?",
  "Berapa gangguan penyulang bulan ini?",
  "Berapa jarak aman konduktor SUTM menurut standar?",
];

const IDLE_MS = 120_000; // longgar utk model lambat di ronde-1

export default function AskAi() {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [model, setModel] = useState("auto"); // "auto" = failover otomatis antar model
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Cek status model saat panel dibuka.
  useEffect(() => {
    if (!open) return;
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d: Status) => setStatus(d))
      .catch(() => setStatus({ model: "?", online: false, installed: false }));
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Buka → kursor langsung di kolom tulis; Escape menutup panel.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  async function send(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    // Watchdog: kalau tak ada data > IDLE_MS (stream macet), batalkan agar tombol tak loading selamanya.
    const ctrl = new AbortController();
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => { clearTimeout(idle); idle = setTimeout(() => ctrl.abort(), IDLE_MS); };
    try {
      arm();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: forApi(next), model: model === "auto" ? undefined : model }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: `Gagal (HTTP ${res.status})` }));
        setMessages((m) => upsertLast(m, e.error ?? "Gagal menghubungi asisten.", true));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        arm();
        acc += dec.decode(value, { stream: true });
        setMessages((m) => upsertLast(m, acc));
      }
      if (!acc.trim()) setMessages((m) => upsertLast(m, "Asisten tidak mengirim jawaban. Coba lagi.", true));
    } catch (err) {
      const msg = (err as Error).name === "AbortError"
        ? "Asisten tidak merespons (timeout). Coba lagi."
        : (err as Error).message;
      setMessages((m) => upsertLast(m, msg, true));
    } finally {
      clearTimeout(idle);
      setBusy(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-xl border border-navy-200 bg-white px-2.5 py-1.5 text-[13px] font-semibold text-navy-600 transition-colors hover:border-navy-300 hover:bg-navy-50"
      >
        <Sparkles size={15} className="shrink-0 text-accent" />
        <span>Tanya AI</span>
      </button>

      {open && (
        <>
          {/* Latar redup: menandai panel sedang memegang fokus, sekali klik menutup. */}
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[999] bg-navy-900/25 animate-fade-in"
          />

          {/* Laci kanan setinggi layar, bukan gelembung mengambang: jawaban
              asisten ini sering berupa daftar gardu/penyulang belasan baris —
              di kotak 380×540 lama isinya jadi terowongan sempit. */}
          <aside
            className={`fixed inset-y-0 right-0 z-[1000] flex max-w-full flex-col border-l border-line bg-white shadow-float animate-slide-left ${
              wide ? "w-[720px]" : "w-[420px]"
            }`}
          >
            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 bg-navy-600 px-4 py-3 text-white">
              <Sparkles size={18} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold leading-tight">Tanya AI</p>
                <p className="flex items-center gap-1 truncate text-[10px] text-white/75">
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                      status?.online ? "bg-emerald-300" : "bg-red-300"
                    }`}
                  />
                  {!status
                    ? "memeriksa…"
                    : !status.online
                      ? "asisten offline"
                      : `${shortModel(status.model)} · online`}
                </p>
              </div>

              {messages.length > 0 && (
                <button
                  onClick={() => { setMessages([]); setInput(""); }}
                  disabled={busy}
                  title="Mulai percakapan baru"
                  className="rounded-lg p-1.5 transition-colors hover:bg-white/15 disabled:opacity-40"
                >
                  <RotateCcw size={15} />
                </button>
              )}
              <button
                onClick={() => setWide((w) => !w)}
                title={wide ? "Perkecil panel" : "Perlebar panel"}
                className="hidden rounded-lg p-1.5 transition-colors hover:bg-white/15 sm:block"
              >
                {wide ? <PanelRightOpen size={15} /> : <PanelLeftOpen size={15} />}
              </button>
              <button
                onClick={() => setOpen(false)}
                title="Tutup"
                className="rounded-lg p-1.5 transition-colors hover:bg-white/15"
              >
                <X size={15} />
              </button>
            </div>

            {/* Pemilih model (muncul kalau ada >1 model) */}
            {status?.models && status.models.length > 1 && (
              <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-1.5">
                <span className="shrink-0 text-[10px] text-ink-muted">Model:</span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={busy}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-white px-1.5 py-1 text-[11px] text-ink focus:border-navy-500 focus:outline-none disabled:opacity-60"
                >
                  <option value="auto">Auto (otomatis pindah kalau gagal)</option>
                  {status.models.map((m) => (
                    <option key={m} value={m}>{shortModel(m)}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Percakapan */}
            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-surface p-3">
              {messages.length === 0 ? (
                <div className="px-1 py-6">
                  <div className="mb-1 grid h-10 w-10 place-items-center rounded-xl bg-navy-50">
                    <Sparkles size={18} className="text-navy-600" />
                  </div>
                  <p className="mt-2 font-display text-[15px] font-bold text-ink">
                    Ada yang mau ditanyakan?
                  </p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">
                    Asisten ini membaca data gardu, gangguan penyulang, prediksi risiko ML,
                    dan buku standar PLN.
                  </p>
                  <div className="mt-3 space-y-1.5">
                    {CONTOH_TANYA.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        className="block w-full rounded-xl border border-line bg-white px-3 py-2 text-left text-[12.5px] text-ink transition-colors hover:border-navy-300 hover:bg-navy-50 hover:text-navy-600"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[88%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[13px] leading-relaxed ${
                        m.error
                          ? "rounded-bl-sm border border-red-200 bg-red-50 text-red-700"
                          : m.role === "user"
                            ? "rounded-br-sm bg-navy-600 text-white"
                            : "rounded-bl-sm border border-line bg-white text-ink"
                      }`}
                    >
                      {m.error ? (
                        <>
                          <span className="flex items-start gap-1.5">
                            <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                            <span>{m.content}</span>
                          </span>
                          {messages[i - 1]?.role === "user" && (
                            <button
                              onClick={() => send(messages[i - 1].content)}
                              disabled={busy}
                              className="mt-1.5 rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
                            >
                              Coba lagi
                            </button>
                          )}
                        </>
                      ) : (
                        m.content || (
                          <span className="flex items-center gap-1.5 text-ink-muted">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-[12px]">menyusun jawaban…</span>
                          </span>
                        )
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-line bg-white p-2.5">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKey}
                  rows={1}
                  placeholder="Tulis pertanyaan…"
                  className="max-h-28 flex-1 resize-none rounded-xl border border-line px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-500/15"
                />
                <button
                  onClick={() => send()}
                  disabled={busy || !input.trim()}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-600 text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
              <p className="mt-1.5 px-1 text-[10px] text-ink-muted">
                Enter kirim · Shift+Enter baris baru
              </p>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

// Label pendek: buang prefix provider & suffix ":free" (mis. "meta-llama/llama-3.3-70b-instruct:free" → "llama-3.3-70b-instruct").
function shortModel(model: string): string {
  return model.split("/").pop()!.replace(/:free$/, "");
}

function upsertLast(msgs: Msg[], content: string, error = false): Msg[] {
  const copy = [...msgs];
  const last = copy[copy.length - 1];
  if (last && last.role === "assistant") copy[copy.length - 1] = { ...last, content, error };
  else copy.push({ role: "assistant", content, error });
  return copy;
}

/** Riwayat yang dikirim ke model: giliran yang gagal dibuang BESERTA pertanyaan
 *  pemicunya. Kalau pesan error ikut terkirim, model melihat satu pertanyaan
 *  yang belum terjawab dan menjawabnya di giliran berikutnya — itu sebabnya
 *  "halo" pernah dibalas daftar gardu dari pertanyaan sebelumnya. */
function forApi(msgs: Msg[]): { role: string; content: string }[] {
  const kept: Msg[] = [];
  for (const m of msgs) {
    if (m.error) {
      kept.pop(); // buang juga pesan user yang memicunya
      continue;
    }
    kept.push(m);
  }
  return kept.map(({ role, content }) => ({ role, content }));
}
