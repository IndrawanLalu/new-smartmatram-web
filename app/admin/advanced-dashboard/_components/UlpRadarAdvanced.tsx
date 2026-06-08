"use client";

import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Legend, Tooltip, ResponsiveContainer,
} from "recharts";
import { Target } from "lucide-react";
import type { UlpRadarPoint } from "../_hooks/useAdvancedDashboard";

interface Props {
  data: UlpRadarPoint[];
  loading?: boolean;
}

const SUBJECTS: { subject: string; key: keyof UlpRadarPoint; desc: string }[] = [
  { subject: "Bebas Gangguan",   key: "bebanGangguan",   desc: "Lebih sedikit gangguan = skor lebih tinggi" },
  { subject: "Pemulihan Cepat",  key: "pemulihanCepat",  desc: "% gangguan selesai ≤ 5 menit" },
  { subject: "Durasi Singkat",   key: "durasiPendek",    desc: "Rata-rata durasi gangguan lebih pendek" },
  { subject: "Penyebab Dikenal", key: "penyebabDikenal", desc: "% kejadian dengan kategori teridentifikasi" },
  { subject: "Bebas Ulang",      key: "bebasUlang",      desc: "Lebih sedikit penyulang repeat offender" },
];

const ULP_COLORS: Record<string, string> = {
  AMPENAN:      "#00897B",
  CAKRANEGARA:  "#3b82f6",
  GERUNG:       "#f59e0b",
  TANJUNG:      "#a855f7",
};

export default function UlpRadarAdvanced({ data, loading = false }: Props) {
  if (loading) {
    return <div className="bg-[#162334] rounded-xl border border-[#1e3552] h-80 animate-pulse" />;
  }

  if (data.length < 2) {
    return (
      <div className="bg-[#162334] rounded-xl border border-[#1e3552] p-8 flex flex-col items-center justify-center gap-2 text-center">
        <Target className="w-8 h-8 text-[#94a3b8]" />
        <p className="text-[#94a3b8] text-sm">
          Pilih <span className="text-[#e2e8f0] font-medium">"Semua ULP"</span> untuk melihat
          perbandingan radar antar ULP
        </p>
      </div>
    );
  }

  const chartData = SUBJECTS.map((s) => {
    const row: Record<string, string | number> = { subject: s.subject };
    data.forEach((d) => { row[d.ulp] = d[s.key] as number; });
    return row;
  });

  return (
    <div className="bg-[#162334] rounded-xl border border-[#1e3552] shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-[#0a2a26] rounded-lg">
            <Target className="w-5 h-5 text-[#00897B]" />
          </div>
          <div>
            <h3 className="text-[#e2e8f0] font-bold text-lg">Radar Performa ULP</h3>
            <p className="text-[#94a3b8] text-xs mt-0.5">
              Perbandingan 5 dimensi kesehatan jaringan antar ULP — area lebih luas = kondisi lebih baik
            </p>
          </div>
        </div>
        <p className="text-[#94a3b8] text-xs leading-relaxed border-l-2 border-[#00897B]/50 pl-3">
          Skor 0–100 dinormalisasi relatif terhadap ULP lain dalam periode yang sama.
          Skor 100 = terbaik di dimensi tersebut di antara ULP yang ada.
        </p>
      </div>

      <div className="px-5 pb-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
          {/* Radar chart */}
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={chartData} margin={{ top: 15, right: 35, bottom: 15, left: 35 }}>
              <PolarGrid stroke="rgba(255,255,255,0.08)" />
              <PolarAngleAxis
                dataKey="subject"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
              />
              <PolarRadiusAxis
                domain={[0, 100]}
                tick={{ fill: "#64748b", fontSize: 8 }}
                tickCount={4}
                axisLine={false}
              />
              {data.map((d) => (
                <Radar
                  key={d.ulp}
                  name={d.ulp}
                  dataKey={d.ulp}
                  stroke={ULP_COLORS[d.ulp] ?? "#94a3b8"}
                  fill={ULP_COLORS[d.ulp] ?? "#94a3b8"}
                  fillOpacity={0.13}
                  strokeWidth={2}
                  dot={{ fill: ULP_COLORS[d.ulp] ?? "#94a3b8", r: 3 }}
                />
              ))}
              <Legend
                wrapperStyle={{ color: "rgba(255,255,255,0.7)", fontSize: "11px", paddingTop: "8px" }}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(13,27,42,0.97)",
                  border: "1px solid #1e3552",
                  borderRadius: "8px",
                  fontSize: "11px",
                }}
                labelStyle={{ color: "#e2e8f0", fontWeight: 600 }}
                formatter={(val: number | undefined) => [`${val ?? 0}`, ""]}
              />
            </RadarChart>
          </ResponsiveContainer>

          {/* Axis descriptions + score table */}
          <div className="flex flex-col gap-1.5">
            {SUBJECTS.map((s) => (
              <div
                key={s.key}
                className="flex items-center gap-2 p-2 rounded-lg bg-[#0d1b2a] border border-[#1e3552]"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[#e2e8f0] text-xs font-semibold">{s.subject}</p>
                  <p className="text-[#94a3b8] text-[10px] mt-0.5">{s.desc}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  {data.map((d) => (
                    <div key={d.ulp} className="flex flex-col items-center gap-0.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: ULP_COLORS[d.ulp] }}
                      />
                      <span
                        className="text-[9px] font-semibold"
                        style={{ color: ULP_COLORS[d.ulp] }}
                      >
                        {d[s.key]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* ULP color legend */}
            <div className="flex flex-wrap gap-3 pt-1 pl-1">
              {data.map((d) => (
                <div key={d.ulp} className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded" style={{ backgroundColor: ULP_COLORS[d.ulp] }} />
                  <span className="text-[10px] text-[#94a3b8]">{d.ulp}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
