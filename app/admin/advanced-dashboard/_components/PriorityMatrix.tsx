"use client";

import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { Target } from "lucide-react";
import type { MatrixPoint } from "../_hooks/useAdvancedDashboard";

interface Props {
  points: MatrixPoint[];
  medFreq: number;
  medDur: number;
  loading?: boolean;
}

const QUADRANT_CONFIG = {
  critical: { color: "#ef4444", label: "KRITIS", desc: "Frekuensi tinggi + durasi lama — prioritas utama" },
  frequent: { color: "#f59e0b", label: "SERING TAPI CEPAT", desc: "Frekuensi tinggi + durasi singkat — perbaiki sistem proteksi" },
  long:     { color: "#a855f7", label: "JARANG TAPI LAMA", desc: "Frekuensi rendah + durasi lama — evaluasi prosedur pemulihan" },
  safe:     { color: "#22c55e", label: "RELATIF AMAN",     desc: "Frekuensi rendah + durasi singkat — pantau saja" },
} as const;

interface CustomDotProps {
  cx?: number;
  cy?: number;
  payload?: MatrixPoint;
}

function CustomDot({ cx = 0, cy = 0, payload }: CustomDotProps) {
  if (!payload) return null;
  const color = QUADRANT_CONFIG[payload.quadrant].color;
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={color} fillOpacity={0.8} stroke={color} strokeWidth={1.5} />
    </g>
  );
}

interface TooltipPayload {
  payload: MatrixPoint;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const q = QUADRANT_CONFIG[d.quadrant];
  return (
    <div className="bg-white border border-line rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="text-ink font-bold">{d.penyulang}</p>
      <p className="text-ink-soft">ULP: {d.ulp}</p>
      <p className="text-ink-soft">Frekuensi: <span className="text-ink">{d.freq}x</span></p>
      <p className="text-ink-soft">Avg Durasi: <span className="text-ink">{d.avgDurMin} mnt</span></p>
      <p className="mt-1 font-semibold" style={{ color: q.color }}>{q.label}</p>
    </div>
  );
}

const SECTION_DESC = `Scatter plot dua dimensi: frekuensi gangguan (X) vs rata-rata durasi (Y). Garis median membagi penyulang ke 4 kuadran.
Fokuskan sumber daya pada kuadran KRITIS — penyulang dengan gangguan paling sering dan paling lama.`;

export default function PriorityMatrix({ points, medFreq, medDur, loading = false }: Props) {
  const counts = Object.fromEntries(
    (["critical", "frequent", "long", "safe"] as const).map((q) => [q, points.filter((p) => p.quadrant === q).length])
  );

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-red-50 rounded-lg">
            <Target className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-lg">Priority Matrix Penyulang</h3>
            <p className="text-ink-soft text-xs mt-0.5">Klasifikasi berdasarkan frekuensi × durasi gangguan</p>
          </div>
        </div>
        <p className="text-ink-soft text-xs leading-relaxed border-l-2 border-red-500/50 pl-3">{SECTION_DESC}</p>

        {!loading && points.length > 0 && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(["critical", "frequent", "long", "safe"] as const).map((q) => (
              <div key={q} className="rounded-lg px-3 py-2 border" style={{ borderColor: `${QUADRANT_CONFIG[q].color}40`, backgroundColor: `${QUADRANT_CONFIG[q].color}15` }}>
                <p className="font-bold text-lg" style={{ color: QUADRANT_CONFIG[q].color }}>{counts[q]}</p>
                <p className="text-ink-soft text-[10px] leading-tight">{QUADRANT_CONFIG[q].label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pb-5">
        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-line border-t-red-400 rounded-full animate-spin" />
          </div>
        ) : points.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-ink-soft">Tidak ada data</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,26,46,0.08)" />
                <XAxis dataKey="freq" name="Frekuensi" stroke="rgba(15,26,46,0.35)" style={{ fontSize: "10px" }} tick={{ fill: "rgba(15,26,46,0.65)" }} label={{ value: "Frekuensi Gangguan (kali)", fill: "rgba(15,26,46,0.65)", fontSize: 10, position: "insideBottom", offset: -10 }} />
                <YAxis dataKey="avgDurMin" name="Avg Durasi" stroke="rgba(15,26,46,0.35)" style={{ fontSize: "10px" }} tick={{ fill: "rgba(15,26,46,0.65)" }} label={{ value: "Avg Durasi (mnt)", fill: "rgba(15,26,46,0.65)", fontSize: 10, angle: -90, position: "insideLeft", offset: 15 }} />
                <Tooltip content={<CustomTooltip />} />
                <ReferenceLine x={medFreq} stroke="rgba(15,26,46,0.35)" strokeDasharray="4 4" />
                <ReferenceLine y={medDur} stroke="rgba(15,26,46,0.35)" strokeDasharray="4 4" />
                <Scatter data={points} shape={<CustomDot />}>
                  {points.map((p, i) => (
                    <Cell key={i} fill={QUADRANT_CONFIG[p.quadrant].color} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {(["critical", "frequent", "long", "safe"] as const).map((q) => (
                <div key={q} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: QUADRANT_CONFIG[q].color }} />
                  <div>
                    <span className="font-semibold" style={{ color: QUADRANT_CONFIG[q].color }}>{QUADRANT_CONFIG[q].label}</span>
                    <p className="text-ink-soft">{QUADRANT_CONFIG[q].desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
