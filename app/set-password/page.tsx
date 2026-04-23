"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Lock, CheckCircle, Zap } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [ready, setReady]       = useState(false);

  useEffect(() => {
    let settled = false;

    // Handle PKCE flow: URL berisi ?code=...
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      supabaseBrowser.auth.exchangeCodeForSession(code).then(({ data, error }) => {
        if (settled) return;
        settled = true;
        if (data.session) setReady(true);
        else setError(error?.message ?? "Link tidak valid atau sudah kadaluarsa.");
      });
    }

    // Handle implicit flow: URL berisi #access_token=...
    // onAuthStateChange akan fire setelah client proses hash
    const { data: { subscription } } = supabaseBrowser.auth.onAuthStateChange(
      (event, session) => {
        if (settled) return;
        if (session) {
          settled = true;
          setReady(true);
        } else if (event === "INITIAL_SESSION" && !code) {
          settled = true;
          setError("Link tidak valid atau sudah kadaluarsa. Minta admin kirim undangan ulang.");
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password minimal 8 karakter"); return; }
    if (password !== confirm) { setError("Konfirmasi password tidak cocok"); return; }

    setLoading(true);
    setError(null);

    const { error: err } = await supabaseBrowser.auth.updateUser({ password });
    setLoading(false);

    if (err) { setError(err.message); return; }

    setDone(true);
    setTimeout(() => router.push("/admin/command-center"), 2500);
  };

  return (
    <div className="min-h-screen bg-[#0d1b2a] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-linear-to-br from-[#004D40] to-[#00897B] rounded-2xl flex items-center justify-center mb-3 shadow-lg">
            <Zap size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-[#e2e8f0]">SMART Mataram</h1>
          <p className="text-xs text-[#94a3b8]">PLN UP3 Mataram</p>
        </div>

        <div className="bg-[#162334] rounded-2xl border border-[#1e3552] p-8">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle size={40} className="text-[#00897B]" />
              <p className="font-bold text-[#e2e8f0]">Password berhasil dibuat!</p>
              <p className="text-sm text-[#94a3b8]">Mengalihkan ke dashboard...</p>
            </div>
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-lg font-bold text-[#e2e8f0]">Buat Password</h2>
                <p className="text-sm text-[#94a3b8] mt-1">
                  Atur password untuk akun SMART Mataram Anda.
                </p>
              </div>

              {!ready && !error && (
                <div className="flex items-center justify-center gap-2 py-8 text-[#94a3b8] text-sm">
                  <div className="w-4 h-4 border-2 border-[#1e3552] border-t-[#00897B] rounded-full animate-spin" />
                  Memvalidasi link...
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2.5 rounded-xl mb-4">
                  {error}
                </div>
              )}

              {ready && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">
                      Password Baru
                    </label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimal 8 karakter"
                        required
                        className="w-full border border-[#1e3552] rounded-xl pl-9 pr-4 py-3 text-sm text-[#e2e8f0] bg-[#0d1b2a] placeholder:text-[#4a5568] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">
                      Konfirmasi Password
                    </label>
                    <div className="relative">
                      <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="Ulangi password"
                        required
                        className="w-full border border-[#1e3552] rounded-xl pl-9 pr-4 py-3 text-sm text-[#e2e8f0] bg-[#0d1b2a] placeholder:text-[#4a5568] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-linear-to-r from-[#004D40] to-[#00897B] text-white font-semibold py-3 rounded-xl hover:opacity-90 disabled:opacity-60 transition-all mt-2"
                  >
                    {loading ? "Menyimpan..." : "Simpan Password"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
