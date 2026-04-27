"use client";

import { useEffect, useState } from "react";
import { Send, Loader2, CheckCircle2 } from "lucide-react";
import type { MorningBriefSettings } from "@/app/api/morning-brief/settings/route";

export default function TelegramScheduleSettings() {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/morning-brief/settings")
      .then((r) => r.json())
      .then((d: MorningBriefSettings) => setEnabled(d.enabled))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(newEnabled: boolean) {
    setSaving(true);
    setSaved(false);
    setErr(null);
    setEnabled(newEnabled);
    try {
      const res = await fetch("/api/morning-brief/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: newEnabled, send_hour_wita: 8 }),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Gagal menyimpan");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
      setEnabled(!newEnabled); // revert
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 print:hidden">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Send size={15} className="text-[#00897B] shrink-0" />
          <div>
            <p className="font-semibold text-[#1B2631] text-sm">Kirim Otomatis ke WhatsApp</p>
            <p className="text-xs text-[#94a3b8] mt-0.5">
              Setiap hari pukul <span className="font-medium text-[#5D6D7E]">08:00 WITA</span>
              {" · "}Grup <span className="font-medium text-[#5D6D7E]">TEKNIK AMPENAN</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {saving && <Loader2 size={14} className="animate-spin text-[#94a3b8]" />}
          {saved && !saving && <CheckCircle2 size={14} className="text-green-500" />}
          {err && <p className="text-red-500 text-xs">{err}</p>}

          {loading ? (
            <div className="w-10 h-5 bg-[#E2E8F0] rounded-full animate-pulse" />
          ) : (
            <button
              role="switch"
              aria-checked={enabled}
              disabled={saving}
              onClick={() => handleSave(!enabled)}
              className={`relative w-10 h-5 rounded-full transition-colors disabled:opacity-60 ${enabled ? "bg-[#00897B]" : "bg-[#CBD5E1]"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
