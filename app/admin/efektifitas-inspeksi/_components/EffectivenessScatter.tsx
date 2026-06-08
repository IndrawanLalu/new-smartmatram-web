"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { PenyulangEffectiveness } from "../_hooks/useInspeksiEffectiveness";

interface Props {
  data: PenyulangEffectiveness[];
  medianGangguan: number;
}

const GROUP_COLOR: Record<string, string> = {
  A: "#34d399",
  B: "#fbbf24",
  C: "#64748b",
};

const GROUP_LABEL: Record<string, string> = {
  A: "Efektif (≥80%)",
  B: "Parsial (<80%)",
  C: "Belum Diinspeksi",
};

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: PenyulangEffectiveness;
}

function CustomDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={5}
      fill={GROUP_COLOR[payload.group]}
      fillOpacity={0.85}
      stroke={GROUP_COLOR[payload.group]}
      strokeWidth={1}
    />
  );
}

interface TooltipPayloadEntry {
  payload?: PenyulangEffectiveness;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.[0]?.payload) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-[#0d1b2a] border border-[#1e3552] rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <p className="text-[#e2e8f0] font-bold mb-1.5">{d.penyulang}</p>
      <p className="text-[#94a3b8]">ULP: <span className="text-[#e2e8f0]">{d.ulp}</span></p>
      <p className="text-[#94a3b8]">
        Gangguan:{" "}
        <span className="text-red-400 font-semibold">{d.gangguanCount}</span>
      </p>
      <p className="text-[#94a3b8]">
        Inspeksi:{" "}
        <span className="text-[#e2e8f0]">{d.inspeksiTotal}</span>
        {d.inspeksiTotal > 0 && (
          <span className="text-[#94a3b8]">
            {" "}({d.eksekusiSelesai} selesai)
          </span>
        )}
      </p>
      {d.inspeksiTotal > 0 && (
        <p className="text-[#94a3b8]">
          Eksekusi:{" "}
          <span style={{ color: GROUP_COLOR[d.group] }} className="font-semibold">
            {d.eksekusiRate.toFixed(0)}%
          </span>
        </p>
      )}
      <div
        className="mt-1.5 inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold"
        style={{ background: `${GROUP_COLOR[d.group]}20`, color: GROUP_COLOR[d.group] }}
      >
        Grup {d.group}: {GROUP_LABEL[d.group]}
      </div>
    </div>
  );
}

export default function EffectivenessScatter({ data, medianGangguan }: Props) {
  const groupA = data.filter((d) => d.group === "A");
  const groupB = data.filter((d) => d.group === "B");
  const groupC = data.filter((d) => d.group === "C");

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-4">
        {(["A", "B", "C"] as const).map((g) => (
          <div key={g} className="flex items-center gap-1.5">
            <span
              className="w-3 h-3 rounded-full inline-block"
              style={{ background: GROUP_COLOR[g] }}
            />
            <span className="text-[#94a3b8] text-xs">
              Grup {g}: {GROUP_LABEL[g]}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-6 border-t border-dashed border-[#64748b] inline-block" />
          <span className="text-[#64748b] text-xs">Median gangguan ({medianGangguan})</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e3552" />
          <XAxis
            type="number"
            dataKey="eksekusiRate"
            name="% Eksekusi Selesai"
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fill: "#64748b", fontSize: 11 }}
            label={{
              value: "% Eksekusi Selesai",
              position: "insideBottom",
              offset: -20,
              fill: "#64748b",
              fontSize: 11,
            }}
          />
          <YAxis
            type="number"
            dataKey="gangguanCount"
            name="Jumlah Gangguan"
            tick={{ fill: "#64748b", fontSize: 11 }}
            label={{
              value: "Jumlah Gangguan",
              angle: -90,
              position: "insideLeft",
              offset: 10,
              fill: "#64748b",
              fontSize: 11,
            }}
          />
          <ReferenceLine
            y={medianGangguan}
            stroke="#64748b"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#1e3552" }} />
          <Scatter data={groupA} shape={<CustomDot />} />
          <Scatter data={groupB} shape={<CustomDot />} />
          <Scatter data={groupC} shape={<CustomDot />} />
        </ScatterChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-[#64748b] text-center mt-1">
        Setiap titik mewakili satu penyulang · Garis putus-putus = median gangguan
      </p>
    </div>
  );
}
