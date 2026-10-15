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
  A: "#10b981",
  B: "#f59e0b",
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
    <div className="bg-white border border-line rounded-lg p-3 shadow-xl text-xs min-w-[160px]">
      <p className="text-ink font-bold mb-1.5">{d.penyulang}</p>
      <p className="text-ink-soft">ULP: <span className="text-ink">{d.ulp}</span></p>
      <p className="text-ink-soft">
        Gangguan:{" "}
        <span className="text-red-600 font-semibold">{d.gangguanCount}</span>
      </p>
      <p className="text-ink-soft">
        Inspeksi:{" "}
        <span className="text-ink">{d.inspeksiTotal}</span>
        {d.inspeksiTotal > 0 && (
          <span className="text-ink-soft">
            {" "}({d.eksekusiSelesai} selesai)
          </span>
        )}
      </p>
      {d.inspeksiTotal > 0 && (
        <p className="text-ink-soft">
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
            <span className="text-ink-soft text-xs">
              Grup {g}: {GROUP_LABEL[g]}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-6 border-t border-dashed border-slate-300 inline-block" />
          <span className="text-ink-muted text-xs">Median gangguan ({medianGangguan})</span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e8f0" />
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
          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3", stroke: "#e4e8f0" }} />
          <Scatter data={groupA} shape={<CustomDot />} />
          <Scatter data={groupB} shape={<CustomDot />} />
          <Scatter data={groupC} shape={<CustomDot />} />
        </ScatterChart>
      </ResponsiveContainer>

      <p className="text-[10px] text-ink-muted text-center mt-1">
        Setiap titik mewakili satu penyulang · Garis putus-putus = median gangguan
      </p>
    </div>
  );
}
