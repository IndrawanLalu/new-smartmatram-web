"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquareText, RefreshCw, Send, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface PreviewResponse {
  ok?: boolean;
  text?: string;
  riskTgl?: string | null;
  stale?: boolean;
  error?: string;
}

// Render baris WA: *tebal* → bold, _miring_ → italic.
function renderLine(line: string) {
  const parts = line.split(/(\*[^*]+\*|_[^_]+_)/g);
  return parts.map((p, i) => {
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i} className="font-semibold text-[#e2e8f0]">{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i} className="text-[#94a3b8]">{p.slice(1, -1)}</em>;
    return <span key={i}>{p}</span>;
  });
}

export default function WaBriefPreview({ canSend }: { canSend: boolean }) {
  const [text, setText] = useState("");
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/morning-brief/preview", { cache: "no-store" });
      const d = (await res.json()) as PreviewResponse;
      if (!res.ok || !d.text) throw new Error(d.error ?? "Gagal memuat preview");
      setText(d.text);
      setStale(!!d.stale);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat preview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSend() {
    if (!confirm("Kirim brief ini ke grup WhatsApp sekarang?")) return;
    setSending(true);
    setSent(false);
    setError(null);
    try {
      const res = await fetch("/api/morning-brief/preview", { method: "POST" });
      const d = (await res.json()) as PreviewResponse;
      if (!res.ok) throw new Error(d.error ?? "Gagal mengirim");
      setSent(true);
      setTimeout(() => setSent(false), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengirim");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] overflow-hidden print:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#1e3552]">
        <div className="flex items-center gap-2">
          <MessageSquareText size={16} className="text-[#00897B]" />
          <span className="text-sm font-semibold text-[#e2e8f0]">Preview Brief WhatsApp</span>
          {stale && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-900/20 px-2 py-0.5 rounded-full">
              <AlertTriangle size={11} /> prediksi belum di-update
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#94a3b8] hover:text-[#e2e8f0] rounded-lg hover:bg-[#0d1b2a] transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Muat ulang
          </button>
          {canSend && (
            <button onClick={handleSend} disabled={sending || loading || !text}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-linear-to-r from-[#004D40] to-[#00897B] rounded-lg disabled:opacity-50">
              {sending ? <Loader2 size={13} className="animate-spin" /> : sent ? <CheckCircle2 size={13} /> : <Send size={13} />}
              {sent ? "Terkirim" : "Kirim Sekarang"}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 bg-[#0a1628]">
        {loading ? (
          <div className="flex items-center gap-2 text-[#94a3b8] text-sm py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Menyusun brief…
          </div>
        ) : error ? (
          <p className="text-red-400 text-sm py-4">{error}</p>
        ) : (
          <div className="max-w-md mx-auto bg-[#162334] border border-[#1e3552] rounded-xl rounded-tl-sm px-4 py-3 shadow-sm">
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-[#cbd5e1] m-0">
              {text.split("\n").map((line, i) => (
                <div key={i}>{line ? renderLine(line) : " "}</div>
              ))}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
