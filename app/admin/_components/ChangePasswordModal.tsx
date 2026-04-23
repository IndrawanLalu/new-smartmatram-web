"use client";

import { useState } from "react";
import { X, Lock } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface Props {
  onClose: () => void;
}

export default function ChangePasswordModal({ onClose }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [done, setDone]         = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) { setError("Password minimal 6 karakter"); return; }
    if (password !== confirm) { setError("Konfirmasi password tidak cocok"); return; }

    setSaving(true);
    setError(null);

    const { error: err } = await supabaseBrowser.auth.updateUser({ password });
    setSaving(false);

    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-[#E2E8F0] flex items-center justify-between bg-[#E0F2F1] rounded-t-2xl">
          <h2 className="font-bold text-[#004D40]">Ganti Password</h2>
          <button onClick={onClose} className="text-[#5D6D7E] hover:text-[#1B2631]">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {done ? (
            <p className="text-center text-green-700 font-medium py-4">Password berhasil diubah!</p>
          ) : (
            <>
              <div>
                <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Password Baru</label>
                <div className="relative mt-1">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5D6D7E]" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Minimal 6 karakter"
                    className="w-full border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#5D6D7E] uppercase tracking-wide">Konfirmasi Password</label>
                <div className="relative mt-1">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5D6D7E]" />
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Ulangi password baru"
                    className="w-full border border-[#E2E8F0] rounded-lg pl-8 pr-3 py-2 text-sm text-[#1B2631] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-[#5D6D7E] border border-[#E2E8F0] rounded-lg hover:bg-[#F4F6F8]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm bg-linear-to-r from-[#004D40] to-[#00897B] text-white rounded-lg font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {saving ? "Menyimpan..." : "Simpan"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
