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
    if (/^\*[^*]+\*$/.test(p)) return <strong key={i} className="font-semibold text-ink">{p.slice(1, -1)}</strong>;
    if (/^_[^_]+_$/.test(p)) return <em key={i} className="text-ink-soft">{p.slice(1, -1)}</em>;
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
    <div className="bg-white rounded-xl border border-line overflow-hidden print:hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-line">
        <div className="flex items-center gap-2">
          <MessageSquareText size={16} className="text-brand-600" />
          <span className="text-sm font-semibold text-ink">Preview Brief WhatsApp</span>
          {stale && (
            <span className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
              <AlertTriangle size={11} /> prediksi belum di-update
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-ink-soft hover:text-ink rounded-lg hover:bg-white transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Muat ulang
          </button>
          {canSend && (
            <button onClick={handleSend} disabled={sending || loading || !text}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-linear-to-r from-brand-700 to-brand-600 rounded-lg disabled:opacity-50">
              {sending ? <Loader2 size={13} className="animate-spin" /> : sent ? <CheckCircle2 size={13} /> : <Send size={13} />}
              {sent ? "Terkirim" : "Kirim Sekarang"}
            </button>
          )}
        </div>
      </div>

      <div className="p-4 bg-surface">
        {loading ? (
          <div className="flex items-center gap-2 text-ink-soft text-sm py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Menyusun brief…
          </div>
        ) : error ? (
          <p className="text-red-600 text-sm py-4">{error}</p>
        ) : (
          <div className="max-w-md mx-auto bg-white border border-line rounded-xl rounded-tl-sm px-4 py-3 shadow-sm">
            <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-ink-soft m-0">
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
