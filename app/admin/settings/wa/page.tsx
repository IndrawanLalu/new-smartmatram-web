"use client";

import { useEffect, useState, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CheckCircle, XCircle, Pencil, Check, X } from "lucide-react";

interface WaSetting {
  id: string;
  label: string;
  category: string;
  ulp: string | null;
  group_id: string;
  enabled: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  jaringan:          "⚡ Notifikasi Jaringan Urgent",
  perabasan:         "🌳 Notifikasi Pohon Sangat Tinggi",
  morning_brief:     "☀️ Morning Brief",
  reminder_jaringan: "🚨⚡ Reminder Jaringan Urgent",
  reminder_pohon:    "🚨🌳 Reminder Pohon Sangat Tinggi",
};

const CATEGORY_ORDER = ["jaringan", "perabasan", "morning_brief", "reminder_jaringan", "reminder_pohon"];

export default function WaSettingsPage() {
  const user = useCurrentUser();
  const canEdit = user?.role === "UP3" || user?.role === "admin";

  const [rows, setRows]       = useState<WaSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId]   = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchSettings = useCallback(async () => {
    const { data } = await supabaseBrowser
      .from("wa_settings")
      .select("id, label, category, ulp, group_id, enabled")
      .order("category")
      .order("ulp");
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  async function handleToggle(row: WaSetting) {
    if (!canEdit) return;
    const { data, error } = await supabaseBrowser
      .from("wa_settings")
      .update({ enabled: !row.enabled, updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("id, label, category, ulp, group_id, enabled")
      .single();
    if (error) { showToast("❌ Gagal update"); return; }
    setRows(prev => prev.map(r => r.id === row.id ? data : r));
  }

  function startEdit(row: WaSetting) {
    setEditId(row.id);
    setEditVal(row.group_id);
  }

  function cancelEdit() { setEditId(null); setEditVal(""); }

  async function saveEdit(row: WaSetting) {
    setSaving(true);
    const { data, error } = await supabaseBrowser
      .from("wa_settings")
      .update({ group_id: editVal.trim(), updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .select("id, label, category, ulp, group_id, enabled")
      .single();
    setSaving(false);
    if (error) { showToast("❌ Gagal simpan"); return; }
    setRows(prev => prev.map(r => r.id === row.id ? data : r));
    setEditId(null);
    showToast("✅ Tersimpan");
  }

  const grouped = CATEGORY_ORDER.map(cat => ({
    cat,
    items: rows.filter(r => r.category === cat),
  })).filter(g => g.items.length > 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-xl p-6">
        <h1 className="text-2xl font-bold">Pengaturan WhatsApp Group</h1>
        <p className="text-white/80 text-sm mt-1">
          Konfigurasi group WA tujuan untuk setiap notifikasi
        </p>
      </div>

      {!canEdit && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-amber-800 text-sm">
          Anda hanya bisa melihat konfigurasi. Hanya <strong>Admin</strong> dan <strong>UP3</strong> yang dapat mengubah.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-[#E2E8F0] border-t-[#00897B] rounded-full animate-spin" />
        </div>
      ) : (
        grouped.map(({ cat, items }) => (
          <div key={cat} className="bg-white rounded-xl shadow-sm border border-[#E2E8F0]">
            <div className="px-5 py-3 border-b border-[#E2E8F0]">
              <h2 className="font-semibold text-[#004D40]">{CATEGORY_LABELS[cat] ?? cat}</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#E0F2F1] text-[#00695C] font-semibold text-xs">
                  <th className="px-4 py-2 text-left w-48">Nama</th>
                  <th className="px-4 py-2 text-left">Group ID</th>
                  <th className="px-4 py-2 text-center w-24">Status</th>
                  {canEdit && <th className="px-4 py-2 w-24" />}
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr key={row.id} className="border-t border-[#E2E8F0] hover:bg-gray-50">
                    <td className="px-4 py-3 text-[#1B2631] font-medium">{row.label}</td>
                    <td className="px-4 py-3">
                      {editId === row.id ? (
                        <input
                          autoFocus
                          value={editVal}
                          onChange={e => setEditVal(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") saveEdit(row);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          placeholder="contoh: 120363420657048053@g.us"
                          className="w-full border border-[#00897B] rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#00897B]/20"
                        />
                      ) : (
                        <span className={`font-mono text-xs ${row.group_id ? "text-[#1B2631]" : "text-gray-400 italic"}`}>
                          {row.group_id || "— belum diisi —"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {canEdit ? (
                        <button
                          onClick={() => handleToggle(row)}
                          className="flex items-center gap-1 mx-auto text-xs"
                        >
                          {row.enabled ? (
                            <><CheckCircle size={16} className="text-green-600" /><span className="text-green-700">Aktif</span></>
                          ) : (
                            <><XCircle size={16} className="text-gray-400" /><span className="text-gray-500">Nonaktif</span></>
                          )}
                        </button>
                      ) : (
                        <span className={`text-xs ${row.enabled ? "text-green-700" : "text-gray-400"}`}>
                          {row.enabled ? "Aktif" : "Nonaktif"}
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        {editId === row.id ? (
                          <div className="flex gap-1 justify-end">
                            <button
                              onClick={() => saveEdit(row)}
                              disabled={saving}
                              className="p-1 rounded hover:bg-green-50 text-green-600"
                              title="Simpan"
                            >
                              <Check size={15} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 rounded hover:bg-red-50 text-red-500"
                              title="Batal"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(row)}
                            className="p-1 rounded hover:bg-[#E0F2F1] text-[#00897B]"
                            title="Edit Group ID"
                          >
                            <Pencil size={15} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#004D40] text-white text-sm px-5 py-2.5 rounded-full shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
