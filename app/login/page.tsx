"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Mail, Lock, ArrowRight, Eye, EyeOff, Check } from "lucide-react";
import { login } from "./actions";
import { supabaseBrowser } from "@/lib/supabase-browser";
import GridBackdrop from "./_components/GridBackdrop";

const ACCESS_ERRORS: Record<string, string> = {
  inactive: "Akun Anda telah dinonaktifkan. Hubungi admin.",
  no_web_access: "Akun Anda hanya untuk aplikasi mobile, tidak bisa login ke web.",
};

const FIELD =
  "w-full rounded-xl border border-white/12 bg-white/5 py-3 pl-10 text-sm text-white placeholder:text-white/35 transition-colors focus:border-[#5eead4]/60 focus:bg-white/8 focus:outline-none focus:ring-2 focus:ring-[#5eead4]/20 disabled:opacity-50 disabled:cursor-not-allowed";

function salam(): string {
  const j = new Date().getHours();
  if (j < 11) return "Selamat pagi";
  if (j < 15) return "Selamat siang";
  if (j < 19) return "Selamat sore";
  return "Selamat malam";
}

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [greeting, setGreeting] = useState("Selamat datang");
  const submittingRef = useRef(false);

  /**
   * Keduanya hanya bisa ditentukan di klien: jam pengguna (bukan jam server VPS)
   * dan query string. State-nya dijadwalkan setelah frame pertama agar tidak
   * memicu render berantai — memanggil setState langsung di badan effect membuat
   * React merender ulang sebelum sempat melukis.
   */
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setGreeting(salam());

      const errKey = new URLSearchParams(window.location.search).get("error");
      if (errKey && ACCESS_ERRORS[errKey]) {
        setError(ACCESS_ERRORS[errKey]);
        void supabaseBrowser.auth.signOut();
      }
    });
    return () => cancelAnimationFrame(id);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submittingRef.current) return; // guard sinkron — tidak bisa di-bypass
    submittingRef.current = true;
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      submittingRef.current = false;
      return;
    }
    // Sukses: tampilkan centang sejenak, redirect menyusul dari server action.
    setDone(true);
  }

  return (
    <main className="lg-canvas relative flex min-h-screen items-center justify-center overflow-hidden p-5">
      <GridBackdrop />

      <div className="relative z-10 w-full max-w-sm">
        {/* Kartu kaca */}
        <div className="lg-rise rounded-3xl border border-white/12 bg-white/6 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          {/* Logo */}
          <div
            className="lg-rise mb-6 flex justify-center"
            style={{ animationDelay: "80ms" }}
          >
            {/* 64px, bukan 56px seperti logo lama: isi PNG lencana hanya mengisi
                ~63% lebar kanvasnya, jadi pada angka yang sama ia terbaca lebih
                kecil di dalam kotak kaca. */}
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3.5">
              <Image
                src="/smarbg.png"
                alt="SMART Mataram"
                width={64}
                height={64}
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Sapaan */}
          <div className="lg-rise mb-7 text-center" style={{ animationDelay: "150ms" }}>
            <p className="text-sm text-[#5eead4]">{greeting}</p>
            <h1 className="font-display mt-1 text-2xl font-extrabold tracking-tight text-white">
              SMART Mataram
            </h1>
            <p className="mt-1.5 text-xs text-white/45">
              Sistem Monitoring Aset &amp; Rencana Tindak Lanjut
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Email */}
            <div className="lg-rise" style={{ animationDelay: "220ms" }}>
              <label htmlFor="email" className="sr-only">Email</label>
              <div className="group relative">
                <Mail
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-[#5eead4]"
                />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  disabled={loading || done}
                  placeholder="Email"
                  className={FIELD}
                />
              </div>
            </div>

            {/* Password */}
            <div className="lg-rise" style={{ animationDelay: "290ms" }}>
              <label htmlFor="password" className="sr-only">Password</label>
              <div className="group relative">
                <Lock
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 transition-colors group-focus-within:text-[#5eead4]"
                />
                <input
                  id="password"
                  name="password"
                  type={showPw ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  disabled={loading || done}
                  placeholder="Password"
                  className={`${FIELD} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error — digoyang sekali agar tertangkap mata */}
            {error && (
              <div
                key={error}
                role="alert"
                className="lg-shake flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-500/12 px-3 py-2.5 text-sm text-red-200"
              >
                <span className="mt-0.5 shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Submit — ukuran tombol tetap di semua keadaan, tanpa lompatan */}
            <div className="lg-rise pt-1" style={{ animationDelay: "360ms" }}>
              <button
                type="submit"
                disabled={loading || done}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-[#2a4a9c] to-[#1d3573] font-semibold text-white shadow-lg shadow-[#1d3573]/40 transition-all hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-80"
              >
                {done ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      className="lg-draw"
                      d="M5 13l4 4L19 7"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : loading ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <>
                    Masuk <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>

          <p
            className="lg-rise mt-6 text-center text-[11px] text-white/35"
            style={{ animationDelay: "430ms" }}
          >
            Lupa akses? Hubungi admin unit Anda.
          </p>
        </div>

        {/* Kredit */}
        <div
          className="lg-rise mt-5 flex items-center justify-center gap-1.5 text-[11px] text-white/30"
          style={{ animationDelay: "500ms" }}
        >
          <Check size={11} className="text-[#5eead4]/60" />
          PLN UP3 Mataram · dibuat dengan ❤ DiandraDev
        </div>
      </div>
    </main>
  );
}
