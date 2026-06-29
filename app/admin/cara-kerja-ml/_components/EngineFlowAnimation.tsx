"use client";

import { useEffect, useState } from "react";
import {
  Cog, BrainCircuit, History, CloudRain, ClipboardCheck, TreePine, Zap, Radio, Gauge,
} from "lucide-react";

interface Counts {
  gangguan: number | null;
  cuaca: number | null;
  inspeksiJaringan: number | null;
  inspeksiPohon: number | null;
  padam: number | null;
  penyulang: number | null;
}

interface Props {
  counts: Counts;
  besok: string;
  kritis: number;
  waspada: number;
  aman: number;
  total: number;
  top?: { penyulang: string; risk_score: number; risk_level: string } | null;
}

const CAPTIONS = [
  "Mengumpulkan data terbaru…",
  "Menggabung gangguan + cuaca + inspeksi…",
  "Menimbang 8 faktor risiko per penyulang…",
  "Menebak penyebab gangguan tak diketahui…",
  "Menghasilkan skor risiko untuk besok…",
];

// 8 faktor yang ditimbang Model A (dari score_risk.py)
const FAKTOR = [
  "Angin kencang", "Curah hujan", "Petir", "Riwayat trip 90 hari",
  "Pola rawan saat hujan", "Temuan pohon terbuka", "Temuan kritis terbuka", "Umur temuan tertua",
];

const LEVEL_COLOR: Record<string, string> = { kritis: "#ef4444", waspada: "#f59e0b", aman: "#10b981" };

const CSS = `
@keyframes mlflow { 0%{left:0%;opacity:0} 12%{opacity:1} 88%{opacity:1} 100%{left:100%;opacity:0} }
@keyframes mlglow { 0%,100%{ box-shadow:0 0 0 0 rgba(0,137,123,.45) } 50%{ box-shadow:0 0 26px 7px rgba(0,137,123,.45) } }
@keyframes mlpulse { 0%,100%{ transform:scale(1);opacity:.55 } 50%{ transform:scale(1.5);opacity:1 } }
@keyframes mlfill  { 0%{ width:8% } 50%{ width:90% } 100%{ width:8% } }
`;

function Track() {
  return (
    <div className="relative h-1.5 bg-[#cdeae6] rounded-full flex-1 min-w-[28px] self-center">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-[#00897B] shadow"
          style={{ left: 0, animation: `mlflow 2.4s linear ${i * 0.48}s infinite` }} />
      ))}
    </div>
  );
}

function fmt(n: number | null): string {
  return n != null ? n.toLocaleString("id-ID") : "—";
}

export default function EngineFlowAnimation({ counts, besok, kritis, waspada, aman, total, top }: Props) {
  const [cap, setCap] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCap((c) => (c + 1) % CAPTIONS.length), 1700);
    return () => clearInterval(t);
  }, []);

  const SOURCES = [
    { icon: History, label: "Riwayat gangguan", value: counts.gangguan, unit: "kejadian", color: "#f43f5e" },
    { icon: CloudRain, label: "Cuaca harian", value: counts.cuaca, unit: "hari", color: "#0ea5e9" },
    { icon: ClipboardCheck, label: "Inspeksi jaringan", value: counts.inspeksiJaringan, unit: "temuan", color: "#10b981" },
    { icon: TreePine, label: "Inspeksi pohon", value: counts.inspeksiPohon, unit: "temuan", color: "#65a30d" },
    { icon: Zap, label: "Padam APKT", value: counts.padam, unit: "laporan", color: "#f59e0b" },
    { icon: Radio, label: "Penyulang dipantau", value: counts.penyulang, unit: "penyulang", color: "#8b5cf6" },
  ];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
      <style>{CSS}</style>
      <h2 className="text-sm font-bold text-[#1B2631] mb-4 flex items-center gap-2">
        <BrainCircuit className="w-4 h-4 text-[#00897B]" /> Simulasi Cara Kerja Engine (animasi)
      </h2>

      <div className="flex items-stretch gap-2 overflow-x-auto pb-2">
        {/* 1. Sumber data lengkap */}
        <div className="shrink-0 flex flex-col gap-1.5 justify-center">
          <p className="text-[10px] font-bold text-[#94a3b8] uppercase tracking-wide">Data Masuk</p>
          {SOURCES.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2 rounded-lg border border-[#E2E8F0] bg-[#F4F6F8] px-2.5 py-1.5 w-52">
                <span className="relative flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" style={{ color: s.color }} />
                  <span className="absolute -right-1.5 w-2 h-2 rounded-full" style={{ backgroundColor: s.color, animation: "mlpulse 1.6s ease-in-out infinite" }} />
                </span>
                <span className="flex-1 text-[11px] text-[#1B2631] truncate">{s.label}</span>
                <span className="text-xs font-bold text-[#1B2631] tabular-nums">{fmt(s.value)}</span>
                <span className="text-[9px] text-[#94a3b8] w-12 shrink-0">{s.unit}</span>
              </div>
            );
          })}
        </div>

        <Track />

        {/* 2. Mesin + faktor lengkap */}
        <div className="shrink-0 w-56 flex flex-col gap-2">
          <div className="rounded-2xl bg-linear-to-br from-[#004D40] to-[#00897B] text-white p-3 flex flex-col items-center text-center"
            style={{ animation: "mlglow 2.6s ease-in-out infinite" }}>
            <div className="relative w-11 h-11 flex items-center justify-center">
              <Cog className="w-11 h-11 text-white/30 animate-spin" style={{ animationDuration: "5s" }} />
              <BrainCircuit className="w-5 h-5 absolute" />
            </div>
            <p className="text-xs font-bold mt-1 tracking-wide">ENGINE ML</p>
            <p className="text-[10px] text-white/85 mt-0.5 h-7 leading-tight flex items-center justify-center">{CAPTIONS[cap]}</p>
            <div className="grid grid-cols-2 gap-1 w-full mt-1">
              <div className="bg-white/15 rounded px-1 py-1"><p className="text-[9px] font-bold">Model A</p><p className="text-[8px] text-white/80 leading-tight">Hitung risiko</p></div>
              <div className="bg-white/15 rounded px-1 py-1"><p className="text-[9px] font-bold">Model B</p><p className="text-[8px] text-white/80 leading-tight">Tebak penyebab</p></div>
            </div>
          </div>
          {/* 8 faktor yang ditimbang */}
          <div className="rounded-lg border border-[#E2E8F0] bg-[#F4F6F8] p-2">
            <p className="text-[9px] font-bold text-[#94a3b8] uppercase mb-1">8 faktor ditimbang</p>
            <div className="flex flex-wrap gap-1">
              {FAKTOR.map((f) => (
                <span key={f} className="text-[9px] bg-white border border-[#E2E8F0] text-[#00695C] rounded px-1.5 py-0.5">{f}</span>
              ))}
            </div>
          </div>
        </div>

        <Track />

        {/* 3. Hasil lengkap */}
        <div className="shrink-0 w-52 rounded-2xl border-2 border-[#00897B]/30 bg-[#E0F2F1] p-3 flex flex-col items-center text-center self-center">
          <Gauge className="w-9 h-9 text-[#00897B]" style={{ animation: "mlpulse 2.2s ease-in-out infinite" }} />
          <p className="text-xs font-bold text-[#004D40] mt-1">Prediksi Risiko H+1</p>
          <p className="text-[10px] text-[#00695C]">{besok}</p>
          <div className="w-full h-2 bg-white rounded-full overflow-hidden mt-2">
            <div className="h-full rounded-full bg-linear-to-r from-emerald-500 via-amber-500 to-red-500" style={{ animation: "mlfill 3.6s ease-in-out infinite" }} />
          </div>
          <div className="grid grid-cols-3 gap-1 w-full mt-2">
            <div className="bg-white rounded py-1"><p className="text-sm font-bold text-red-500 leading-none">{kritis}</p><p className="text-[8px] text-[#64748b]">Kritis</p></div>
            <div className="bg-white rounded py-1"><p className="text-sm font-bold text-amber-500 leading-none">{waspada}</p><p className="text-[8px] text-[#64748b]">Waspada</p></div>
            <div className="bg-white rounded py-1"><p className="text-sm font-bold text-emerald-600 leading-none">{aman}</p><p className="text-[8px] text-[#64748b]">Aman</p></div>
          </div>
          <p className="text-[9px] text-[#00695C] mt-1">{total} penyulang dinilai</p>
          {top && (
            <div className="mt-2 w-full bg-white rounded-lg px-2 py-1 text-left">
              <p className="text-[9px] text-[#94a3b8]">Tertinggi besok</p>
              <p className="text-[11px] font-bold text-[#1B2631] truncate">
                {top.penyulang} · <span style={{ color: LEVEL_COLOR[top.risk_level] }}>{top.risk_score.toFixed(0)}</span>
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-[#94a3b8] mt-3 text-center">
        Tiap malam mesin menarik semua data di atas, menimbang 8 faktor risiko untuk tiap penyulang, lalu menghasilkan skor 0–100 untuk keesokan hari.
      </p>
    </div>
  );
}
