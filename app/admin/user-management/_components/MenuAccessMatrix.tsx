"use client";

import { useEffect, useMemo, useState } from "react";
import { Save, Loader2, CheckCircle2, Check, LayoutGrid, ClipboardCheck } from "lucide-react";
import { MOBILE_MENUS } from "@/lib/roles";
import { useRoles } from "@/app/admin/_hooks/useRoles";

export default function MenuAccessMatrix() {
  const { roles, loading, saveMenusBulk } = useRoles();
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Sinkron draft saat data role termuat/berubah (mis. setelah simpan)
  useEffect(() => {
    const d: Record<string, string[]> = {};
    for (const r of roles) d[r.code] = r.menus ?? [];
    setDraft(d);
  }, [roles]);

  // Menu hanya relevan untuk role yang punya app mobile
  const mobileRoles = useMemo(() => roles.filter((r) => r.platform !== "web"), [roles]);

  const has = (code: string, id: string) => (draft[code] ?? []).includes(id);
  const toggle = (code: string, id: string) => {
    setMsg(null);
    setDraft((prev) => {
      const cur = prev[code] ?? [];
      return { ...prev, [code]: cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id] };
    });
  };

  const dirty = useMemo(
    () =>
      roles.filter((r) => {
        const a = [...(r.menus ?? [])].sort().join(",");
        const b = [...(draft[r.code] ?? [])].sort().join(",");
        return a !== b;
      }),
    [roles, draft],
  );

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    const err = await saveMenusBulk(dirty.map((r) => ({ code: r.code, menus: draft[r.code] ?? [] })));
    setSaving(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: "Perubahan tersimpan" });
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E0F2F1] flex items-center justify-center shrink-0">
            <LayoutGrid size={18} className="text-[#00897B]" />
          </div>
          <div>
            <p className="font-semibold text-[#1B2631] text-sm">Akses Menu Mobile</p>
            <p className="text-xs text-[#5D6D7E]">Centang menu yang boleh dilihat tiap role di aplikasi HP.</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {dirty.length > 0 && (
            <span className="hidden sm:inline text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
              {dirty.length} belum disimpan
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || dirty.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simpan
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-5 py-2.5 text-sm flex items-center gap-2 ${msg.ok ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
          {msg.ok && <CheckCircle2 size={14} />}
          {msg.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-28 gap-2 text-[#5D6D7E]">
          <div className="w-5 h-5 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" /> Memuat...
        </div>
      ) : mobileRoles.length === 0 ? (
        <div className="py-10 text-center text-sm text-[#5D6D7E]">Tidak ada role mobile.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-separate border-spacing-0">
            <thead>
              <tr className="text-[#00695C]">
                <th className="sticky left-0 z-20 bg-[#E0F2F1] px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wide border-b border-[#CBE4E1] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                  Role
                </th>
                {MOBILE_MENUS.map((m) => (
                  <th
                    key={m.id}
                    className="bg-[#E0F2F1] px-3 py-2.5 text-center text-[11px] font-semibold border-b border-[#CBE4E1] whitespace-nowrap min-w-[92px]"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {mobileRoles.map((r) => (
                <tr key={r.code} className="group">
                  <td className="sticky left-0 z-10 bg-white group-hover:bg-[#F8FAFB] px-5 py-2.5 border-b border-[#EEF2F6] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] transition-colors">
                    <span className="font-medium text-[#1B2631]">{r.label}</span>
                    <span className="block text-[10px] text-[#94A3B8] font-mono">{r.code}</span>
                    {r.is_eksekutor && (
                      <span className="inline-flex items-center gap-0.5 mt-1 text-[9px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                        <ClipboardCheck size={9} /> +Work Order
                      </span>
                    )}
                  </td>
                  {MOBILE_MENUS.map((m) => {
                    const on = has(r.code, m.id);
                    return (
                      <td key={m.id} className="px-3 py-2.5 text-center border-b border-[#EEF2F6] group-hover:bg-[#F8FAFB] transition-colors">
                        <button
                          onClick={() => toggle(r.code, m.id)}
                          aria-pressed={on}
                          title={`${r.label} — ${m.label}`}
                          className={`w-6 h-6 rounded-md border flex items-center justify-center mx-auto transition-colors ${
                            on
                              ? "bg-[#00897B] border-[#00897B] text-white shadow-sm"
                              : "bg-white border-[#CBD5E1] hover:border-[#00897B] hover:bg-[#E0F2F1]/40"
                          }`}
                        >
                          {on && <Check size={14} strokeWidth={3} />}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="px-5 py-2.5 border-t border-[#E2E8F0] bg-[#FAFBFC] text-[11px] text-[#94A3B8] flex items-center gap-1.5">
        <ClipboardCheck size={12} className="text-amber-600" />
        Menu <b className="text-[#5D6D7E]">Work Order</b> muncul otomatis untuk role bertanda <b className="text-amber-700">+Work Order</b> (Regu WO) — tak perlu diatur di sini.
      </div>
    </div>
  );
}
