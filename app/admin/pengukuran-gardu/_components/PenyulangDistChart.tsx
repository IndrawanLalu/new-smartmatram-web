"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

export interface PenyulangChartItem {
  name: string;
  overload: number;
  warning: number;
  normal: number;
  total: number;
}

interface Props {
  data: PenyulangChartItem[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = (payload as { value: number }[]).reduce((s, p) => s + p.value, 0);
  return (
    <div className="bg-[#0a1628] border border-[#1e3552] rounded-xl shadow-2xl p-3 text-xs min-w-36">
      <p className="font-bold text-[#e2e8f0] mb-2">{label}</p>
      <div className="space-y-1">
        {payload.map((p: { name: string; value: number; color: string }) => (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} />
              <span className="text-[#94a3b8] capitalize">{p.name}</span>
            </span>
            <span className="font-semibold" style={{ color: p.color }}>{p.value} gardu</span>
          </div>
        ))}
        <div className="border-t border-[#1e3552] pt-1 mt-1 flex justify-between text-[#94a3b8]">
          <span>Total</span>
          <span className="text-[#e2e8f0] font-bold">{total}</span>
        </div>
      </div>
    </div>
  );
}

export default function PenyulangDistChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-[#94a3b8] text-sm">
        Tidak ada data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} barSize={18}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3552" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#64748b" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "#64748b" }}
          width={24}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <Legend
          wrapperStyle={{ fontSize: 10, color: "#64748b", paddingTop: 4 }}
          iconType="square"
          iconSize={8}
        />
        <Bar dataKey="overload" name="Overload" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill="#ef4444" fillOpacity={0.85} />)}
        </Bar>
        <Bar dataKey="warning" name="Warning" stackId="a" fill="#f59e0b">
          {data.map((_, i) => <Cell key={i} fill="#f59e0b" fillOpacity={0.85} />)}
        </Bar>
        <Bar dataKey="normal" name="Normal" stackId="a" fill="#00897B" radius={[3, 3, 0, 0]}>
          {data.map((_, i) => <Cell key={i} fill="#00897B" fillOpacity={0.85} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
