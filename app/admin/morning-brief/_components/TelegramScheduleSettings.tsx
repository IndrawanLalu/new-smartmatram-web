"use client";

import { useEffect, useState } from "react";
import { Send, Clock, Loader2, CheckCircle2 } from "lucide-react";
import type { MorningBriefSettings } from "@/app/api/morning-brief/settings/route";

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${String(i).padStart(2, "0")}:00 WITA`,
}));

export default function TelegramScheduleSettings() {
  const [settings, setSettings] = useState<MorningBriefSettings>({ send_hour_wita: 8, enabled: true });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/morning-brief/settings")
      .then((r) => r.json())
      .then((d: MorningBriefSettings) => setSettings(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      const res = await fetch("/api/morning-brief/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? "Gagal menyimpan");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5 print:hidden">
      <div className="flex items-center gap-2 mb-4">
        <Send size={16} className="text-[#00897B]" />
        <h3 className="font-semibold text-[#1B2631] text-sm">Jadwal Kirim Telegram Otomatis</h3>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-[#94a3b8] text-sm py-2">
          <Loader2 size={14} className="animate-spin" />
          Memuat pengaturan...
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Toggle aktif */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <button
              role="switch"
              aria-checked={settings.enabled}
              onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
              className={`relative w-10 h-5 rounded-full transition-colors ${settings.enabled ? "bg-[#00897B]" : "bg-[#CBD5E1]"}`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${settings.enabled ? "translate-x-5" : "translate-x-0"}`}
              />
            </button>
            <span className="text-sm text-[#1B2631]">
              {settings.enabled ? "Aktif" : "Nonaktif"}
            </span>
          </label>

          {/* Jam kirim */}
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-[#5D6D7E] shrink-0" />
            <span className="text-sm text-[#5D6D7E]">Jam kirim:</span>
            <select
              value={settings.send_hour_wita}
              onChange={(e) => setSettings((s) => ({ ...s, send_hour_wita: Number(e.target.value) }))}
              disabled={!settings.enabled}
              className="border border-[#E2E8F0] rounded-lg px-3 py-1.5 text-sm text-[#1B2631] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {HOURS.map((h) => (
                <option key={h.value} value={h.value}>{h.label}</option>
              ))}
            </select>
          </div>

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-linear-to-r from-[#004D40] to-[#00897B] text-white text-sm font-medium px-4 py-1.5 rounded-lg disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? (
              <><Loader2 size={13} className="animate-spin" /> Menyimpan...</>
            ) : saved ? (
              <><CheckCircle2 size={13} /> Tersimpan</>
            ) : (
              "Simpan"
            )}
          </button>

          {err && <p className="text-red-500 text-xs">{err}</p>}
        </div>
      )}

      {settings.enabled && !loading && (
        <p className="text-xs text-[#94a3b8] mt-3">
          Morning brief akan dikirim ke Telegram setiap hari pukul{" "}
          <span className="font-semibold text-[#5D6D7E]">
            {String(settings.send_hour_wita).padStart(2, "0")}:00 WITA
          </span>
        </p>
      )}
    </div>
  );
}
