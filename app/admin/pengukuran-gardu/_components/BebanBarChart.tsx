"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { OVERLOAD_PCT } from "../_hooks/usePengukuranGardu";

interface ChartItem {
  name: string;
  persen: number;
  kva: number;
  kapasitas: number;
}

interface Props {
  data: ChartItem[];
}

function getBarColor(pct: number): string {
  if (pct >= OVERLOAD_PCT) return "#ef4444"; // red
  if (pct >= 60) return "#f59e0b"; // amber
  return "#00897B"; // teal
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as ChartItem;
  return (
    <div className="bg-white border border-[#E2E8F0] rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-[#1B2631] mb-1">{label}</p>
      <p className="text-[#5D6D7E]">
        Beban: <span className="font-semibold text-[#1B2631]">{d.persen}%</span>
      </p>
      <p className="text-[#5D6D7E]">
        {d.kva} KVA / {d.kapasitas} KVA
      </p>
    </div>
  );
}

export default function BebanBarChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-[#5D6D7E] text-sm">
        Tidak ada data untuk ditampilkan
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 60 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#5D6D7E" }}
          angle={-45}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          domain={[0, 120]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 11, fill: "#5D6D7E" }}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine
          y={OVERLOAD_PCT}
          stroke="#ef4444"
          strokeDasharray="4 2"
          label={{ value: "Overload 80%", position: "right", fontSize: 10, fill: "#ef4444" }}
        />
        <ReferenceLine
          y={60}
          stroke="#f59e0b"
          strokeDasharray="4 2"
          label={{ value: "60%", position: "right", fontSize: 10, fill: "#f59e0b" }}
        />
        <Bar dataKey="persen" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {data.map((entry, i) => (
            <Cell key={i} fill={getBarColor(entry.persen)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
