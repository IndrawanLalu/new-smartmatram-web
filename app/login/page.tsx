"use client";

import { useState } from "react";
import Image from "next/image";
import { Mail, Lock, LogIn, Zap } from "lucide-react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError("");
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── Panel Kiri — Branding ─────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-linear-to-br from-[#003D33] via-[#004D40] to-[#00695C] flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute top-1/2 -right-12 w-48 h-48 rounded-full bg-[#00897B]/30" />

        {/* Content */}
        <div className="relative z-10 text-center">
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-3xl p-5 border border-white/20">
              <Image
                src="/logsmart.png"
                alt="SMART Mataram Logo"
                width={96}
                height={96}
                className="object-contain"
                priority
              />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">
            SMART Mataram
          </h1>
          <p className="text-teal-200 text-lg mb-2 font-medium">
            Sistem Monitoring Aset & Rencana Tindak Lanjut
          </p>
          <p className="text-teal-300/70 text-sm">PLN UP3 Mataram</p>

          {/* Feature chips */}
          <div className="flex flex-wrap justify-center gap-2 mt-10">
            {[
              "Pengukuran Gardu",
              "Monitoring Inspeksi",
              "Gangguan Penyulang",
              "AI Analisis",
            ].map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-full bg-white/10 text-teal-100 text-xs font-medium border border-white/10"
              >
                {f}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom badge */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-2">
            <Zap size={12} className="text-amber-300" />
            <span className="text-teal-200/70 text-[11px]">
              develpo with ❤️ DiandraDev
            </span>
          </div>
        </div>
      </div>

      {/* ── Panel Kanan — Form ────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 bg-[#0d1b2a]">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center mb-8">
            <div className="bg-[#162334] rounded-2xl shadow-sm border border-[#1e3552] p-4 mb-4">
              <Image
                src="/logsmart.png"
                alt="SMART Mataram Logo"
                width={64}
                height={64}
                className="object-contain"
                priority
              />
            </div>
            <h1 className="text-xl font-bold text-[#e2e8f0]">SMART Mataram</h1>
            <p className="text-sm text-[#94a3b8]">PLN ULP Ampenan · Mataram</p>
          </div>

          {/* Card */}
          <div className="bg-[#162334] rounded-2xl shadow-sm border border-[#1e3552] p-8">
            <div className="mb-7">
              <h2 className="text-xl font-bold text-[#e2e8f0]">
                Selamat Datang
              </h2>
              <p className="text-sm text-[#94a3b8] mt-1">
                Masuk ke akun Anda untuk melanjutkan
              </p>
            </div>

            <form action={handleSubmit} className="space-y-4">
              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"
                  />
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="admin@pln.co.id"
                    className="w-full border border-[#1e3552] rounded-xl pl-9 pr-4 py-3 text-sm text-[#e2e8f0] bg-[#0d1b2a] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 transition-colors"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]"
                  />
                  <input
                    name="password"
                    type="password"
                    required
                    placeholder="••••••••"
                    className="w-full border border-[#1e3552] rounded-xl pl-9 pr-4 py-3 text-sm text-[#e2e8f0] bg-[#0d1b2a] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#00897B] focus:ring-2 focus:ring-[#00897B]/20 transition-colors"
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2.5 rounded-xl">
                  <span className="shrink-0 mt-0.5">⚠</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-linear-to-r from-[#004D40] to-[#00897B] text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 mt-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Masuk...
                  </>
                ) : (
                  <>
                    <LogIn size={15} />
                    Masuk
                  </>
                )}
              </button>
            </form>
          </div>

          <p className="text-center text-[11px] text-[#9CA3AF] mt-6">
            HUBUNGI ADMIN
          </p>
        </div>
      </div>
    </div>
  );
}
