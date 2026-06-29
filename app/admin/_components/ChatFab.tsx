"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Bot, Sparkles } from "lucide-react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function ChatFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ model: string; online: boolean; installed: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Cek status model saat panel dibuka.
  useEffect(() => {
    if (!open) return;
    fetch("/api/chat")
      .then((r) => r.json())
      .then((d) => setStatus(d))
      .catch(() => setStatus({ model: "?", online: false, installed: false }));
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const e = await res.json().catch(() => ({ error: `Gagal (HTTP ${res.status})` }));
        setMessages((m) => upsertLast(m, `⚠️ ${e.error ?? "Gagal menghubungi asisten."}`));
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMessages((m) => upsertLast(m, acc));
      }
      if (!acc.trim()) setMessages((m) => upsertLast(m, "(tidak ada jawaban)"));
    } catch (err) {
      setMessages((m) => upsertLast(m, `⚠️ ${(err as Error).message}`));
    } finally {
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
      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-[1000] w-[380px] max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-8rem)] bg-white rounded-2xl shadow-2xl border border-[#E2E8F0] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white px-4 py-3 flex items-center gap-2 shrink-0">
            <Bot className="w-5 h-5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold leading-tight">Asisten Smart Mataram</p>
              <p className="text-[10px] text-white/80 flex items-center gap-1 truncate">
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${status?.online ? "bg-emerald-300" : "bg-red-300"}`} />
                {!status
                  ? "memeriksa…"
                  : !status.online
                    ? "Ollama offline"
                    : status.installed
                      ? `${status.model} · online`
                      : `${status.model} · belum diunduh`}
              </p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/20 rounded transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#F4F6F8]">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2 text-[#94a3b8] px-4">
                <Sparkles className="w-8 h-8 opacity-40" />
                <p className="text-sm font-medium text-[#64748b]">Halo! Ada yang bisa dibantu?</p>
                <p className="text-[11px]">Tanya seputar monitoring jaringan PLN. (Akses data live sedang disiapkan.)</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    m.role === "user"
                      ? "bg-[#00897B] text-white rounded-br-sm"
                      : "bg-white text-[#1B2631] border border-[#E2E8F0] rounded-bl-sm"
                  }`}
                >
                  {m.content || (busy ? <Loader2 className="w-4 h-4 animate-spin text-[#94a3b8]" /> : "…")}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-2.5 border-t border-[#E2E8F0] bg-white shrink-0 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder="Tulis pesan…"
              className="flex-1 resize-none max-h-28 border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl bg-linear-to-r from-[#004D40] to-[#00897B] text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="Asisten Smart Mataram"
        className="fixed bottom-6 right-6 z-[1000] w-14 h-14 rounded-full bg-linear-to-br from-[#004D40] to-[#00897B] text-white shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        {open ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
      </button>
    </>
  );
}

function upsertLast(msgs: Msg[], content: string): Msg[] {
  const copy = [...msgs];
  const last = copy[copy.length - 1];
  if (last && last.role === "assistant") copy[copy.length - 1] = { ...last, content };
  else copy.push({ role: "assistant", content });
  return copy;
}
