"use client";

import { useState } from "react";
import { Target, TrendingUp, AlertTriangle } from "lucide-react";

interface LevelStat {
  n: number;
  rate: number;
  lift: number;
}
interface Horizon {
  h: number;
  base: number;
  levels: { aman: LevelStat; waspada: LevelStat; kritis: LevelStat };
  precision: number;
  recall: number;
  flagged: number;
  outages: number;
}
interface BtCase {
  tgl_gangguan: string;
  penyulang: string;
  ulp: string;
  terdeteksi: boolean;
  level: string | null;
  skor: number | null;
  lead: number | null;
}
interface Detection {
  lead_max: number;
  detected: number;
  missed: number;
  total: number;
  rate: number;
}
export interface BacktestData {
  eval_start: string;
  eval_end: string;
  feeders: number;
  samples: number;
  step_days: number;
  horizons: Horizon[];
  avg_score_pos: number;
  avg_score_neg: number;
  detection?: Detection;
  cases?: BtCase[];
  model_version: string;
  note: string;
}

const LEVEL_COLOR: Record<string, string> = { kritis: "#ef4444", waspada: "#f59e0b" };

function tglPendek(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
function leadText(lead: number | null): string {
  if (lead == null) return "";
  return lead === 0 ? "hari-H" : `${lead} hari sebelumnya`;
}

const LEVELS = [
  { key: "kritis", label: "Kritis", color: "#ef4444" },
  { key: "waspada", label: "Waspada", color: "#f59e0b" },
  { key: "aman", label: "Aman", color: "#10b981" },
] as const;

function bulanTahun(s: string): string {
  return new Date(s + "T00:00:00").toLocaleDateString("id-ID", { month: "short", year: "numeric" });
}

export default function BacktestReport({ data }: { data: BacktestData | null }) {
  const [h, setH] = useState(7);
  if (!data || data.horizons.length === 0) return null;

  const hz = data.horizons.find((x) => x.h === h) ?? data.horizons[data.horizons.length - 1];
  const kritis = hz.levels.kritis;
  const maxRate = Math.max(hz.levels.kritis.rate, hz.levels.waspada.rate, hz.levels.aman.rate, hz.base, 1);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#E0F2F1] rounded-lg shrink-0">
            <Target className="w-4 h-4 text-[#00897B]" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#1B2631]">Bukti Akurasi — Uji ke Data Nyata (Backtest)</h2>
            <p className="text-[11px] text-[#64748b]">
              Prediksi dibandingkan gangguan yang <b>beneran terjadi</b> · {data.samples.toLocaleString("id-ID")} sampel ·{" "}
              {bulanTahun(data.eval_start)}–{bulanTahun(data.eval_end)} · {data.feeders} penyulang
            </p>
          </div>
        </div>
        {/* Horizon toggle */}
        <div className="flex items-center gap-1 bg-[#F4F6F8] rounded-lg p-1">
          {[1, 3, 7].map((opt) => (
            <button
              key={opt}
              onClick={() => setH(opt)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                h === opt ? "bg-[#00897B] text-white shadow-sm" : "text-[#64748b] hover:bg-white"
              }`}
            >
              {opt} hari
            </button>
          ))}
        </div>
      </div>

      {/* Headline */}
      <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 mb-4 flex items-center gap-3 flex-wrap">
        <span className="text-3xl font-bold text-red-500">{kritis.rate}%</span>
        <p className="text-sm text-[#1B2631] flex-1 min-w-[220px]">
          penyulang yang ditandai <b className="text-red-500">KRITIS</b> beneran gangguan dalam <b>{h} hari</b> —{" "}
          <span className="inline-flex items-center gap-1 font-semibold text-red-600">
            <TrendingUp className="w-3.5 h-3.5" /> {kritis.lift}× lebih sering
          </span>{" "}
          dari rata-rata ({hz.base}%).
        </p>
      </div>

      {/* Tabel per level */}
      <div className="space-y-2.5">
        {LEVELS.map(({ key, label, color }) => {
          const d = hz.levels[key];
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="w-16 text-xs font-semibold shrink-0" style={{ color }}>
                {label}
              </span>
              <div className="flex-1 h-5 bg-[#F4F6F8] rounded-md overflow-hidden relative">
                <div
                  className="h-full rounded-md flex items-center justify-end pr-2"
                  style={{ width: `${Math.max((d.rate / maxRate) * 100, 6)}%`, backgroundColor: color }}
                >
                  <span className="text-[10px] font-bold text-white">{d.rate}%</span>
                </div>
              </div>
              <span className="w-24 text-right text-[11px] text-[#64748b] shrink-0">
                {d.n.toLocaleString("id-ID")} sampel
              </span>
              <span className="w-14 text-right text-[11px] font-mono font-semibold shrink-0" style={{ color }}>
                {d.lift}×
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-[#94a3b8] mt-1.5">
        % = seberapa sering diikuti gangguan nyata dalam {h} hari · lift = dibanding rata-rata ({hz.base}%)
      </p>

      {/* Ringkasan bawah */}
      <div className="grid sm:grid-cols-3 gap-3 mt-4 text-xs">
        <Stat
          label="Gangguan diprediksi lebih dulu"
          value={data.detection ? `${data.detection.rate}%` : `${hz.recall}%`}
          desc={data.detection ? `${data.detection.detected} dari ${data.detection.total} gangguan, ditandai ≤${data.detection.lead_max} hari sebelumnya` : "dari semua gangguan"}
        />
        <Stat label="Skor saat gangguan" value={`${data.avg_score_pos}`} desc={`vs ${data.avg_score_neg} saat aman — skor tinggi ↔ risiko tinggi`} />
        <Stat label="Model" value={data.model_version} desc="aturan transparan, belum dikalibrasi" />
      </div>

      {/* Contoh nyata: gangguan vs prediksi */}
      {data.detection && data.cases && data.cases.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
            <h3 className="text-xs font-bold text-[#1B2631]">Contoh nyata: gangguan vs prediksi model</h3>
            <span className="text-[11px] text-[#64748b]">
              {data.detection.detected} dari {data.detection.total} gangguan ditandai lebih dulu ·{" "}
              <b className="text-[#00897B]">{data.detection.rate}%</b> (≤{data.detection.lead_max} hari sebelumnya)
            </span>
          </div>
          <div className="border border-[#E2E8F0] rounded-lg overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-[#F4F6F8] text-[#64748b] sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold whitespace-nowrap">Tgl Gangguan</th>
                    <th className="text-left px-3 py-2 font-semibold">Penyulang</th>
                    <th className="text-left px-3 py-2 font-semibold">Prediksi model sebelumnya</th>
                    <th className="text-center px-3 py-2 font-semibold">Hasil</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cases.map((c, i) => (
                    <tr key={`${c.tgl_gangguan}-${c.penyulang}-${i}`} className={i % 2 ? "bg-[#F8FAFC]" : "bg-white"}>
                      <td className="px-3 py-1.5 text-[#1B2631] whitespace-nowrap">{tglPendek(c.tgl_gangguan)}</td>
                      <td className="px-3 py-1.5">
                        <span className="font-semibold text-[#1B2631]">{c.penyulang}</span>
                        <span className="text-[#94a3b8]"> · {c.ulp}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        {c.terdeteksi ? (
                          <span className="font-medium" style={{ color: LEVEL_COLOR[c.level ?? "waspada"] }}>
                            {c.level?.toUpperCase()} (skor {Math.round(c.skor ?? 0)}) · {leadText(c.lead)}
                          </span>
                        ) : (
                          <span className="text-[#94a3b8]">tidak menandai (skor aman)</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-center whitespace-nowrap">
                        {c.terdeteksi ? (
                          <span className="text-emerald-600 font-semibold">✅ tepat</span>
                        ) : (
                          <span className="text-[#94a3b8]">❌ terlewat</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-[10px] text-[#94a3b8] mt-1.5">
            “Ditandai lebih dulu” = model memberi status Kritis/Waspada dalam ≤{data.detection.lead_max} hari sebelum gangguan terjadi.
            Menampilkan {data.cases.length} kejadian terbaru.
          </p>
        </div>
      )}

      {/* Catatan jujur */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-800 leading-relaxed">
          <b>Cara baca jujur:</b> daftar <b>KRITIS layak dipercaya</b> untuk didahulukan, dan <b>“Aman” beneran lebih jarang</b>{" "}
          gangguan.{data.detection && <> Sekitar <b>{(100 - data.detection.rate).toFixed(0)}% gangguan</b> masih terlewat</>} — biasanya
          gangguan <b>mendadak</b> di penyulang yang selama ini adem. Jadi ini <b>alat prioritas, bukan jaminan menangkap semua</b>.
          Backtest sengaja tanpa data inspeksi (agar tak “mengintip masa depan”), jadi model produksi bisa sedikit lebih baik.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, desc }: { label: string; value: string; desc: string }) {
  return (
    <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-3 py-2">
      <p className="text-[10px] text-[#94a3b8] uppercase tracking-wide">{label}</p>
      <p className="text-lg font-bold text-[#00897B] leading-tight">{value}</p>
      <p className="text-[10px] text-[#64748b] leading-snug mt-0.5">{desc}</p>
    </div>
  );
}
