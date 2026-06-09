"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Cell, ResponsiveContainer,
} from "recharts";
import { OVERLOAD_PCT, HIGH_TEMP_C } from "../_hooks/usePengukuranGardu";

export interface BebanChartItem {
  id: string;
  name: string;
  persen: number;
  kva: number;
  kapasitas: number;
  alamat: string;
  arusR: number;
  arusS: number;
  arusT: number;
  suhu: number;
}

interface Props {
  data: BebanChartItem[];
  onBarClick?: (id: string) => void;
}

function barColor(pct: number): string {
  if (pct >= OVERLOAD_PCT) return "#ef4444";
  if (pct >= 60)           return "#f59e0b";
  return "#00897B";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as BebanChartItem;
  const pct = d.persen;
  const pctCls = pct >= OVERLOAD_PCT ? "text-red-400" : pct >= 60 ? "text-amber-400" : "text-teal-400";

  return (
    <div className="bg-[#0a1628] border border-[#1e3552] rounded-xl shadow-2xl p-3 text-xs min-w-42.5">
      <p className="font-bold text-[#e2e8f0] mb-2 text-sm">{d.name}</p>
      <div className="space-y-1 text-[#94a3b8]">
        <div className="flex justify-between gap-4">
          <span>Alamat</span>
          <span className="text-[#e2e8f0] font-medium truncate max-w-36">{d.alamat}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Beban</span>
          <span className={`font-bold ${pctCls}`}>{pct}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>KVA</span>
          <span className="text-[#e2e8f0]">{d.kva} / {d.kapasitas} kVA</span>
        </div>
        <div className="border-t border-[#1e3552] pt-1 mt-1">
          <div className="flex justify-between gap-4">
            <span>Arus R/S/T</span>
            <span className="text-[#e2e8f0] font-mono">{d.arusR}/{d.arusS}/{d.arusT} A</span>
          </div>
          {d.suhu > 0 && (
            <div className="flex justify-between gap-4">
              <span>Suhu Trafo</span>
              <span className={d.suhu > HIGH_TEMP_C ? "text-amber-400 font-bold" : "text-[#e2e8f0]"}>
                {d.suhu}°C
              </span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-[#475569] mt-1 pt-1 border-t border-[#1e3552]">Klik untuk detail</p>
      </div>
    </div>
  );
}

export default function BebanBarChart({ data, onBarClick }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-[#94a3b8] text-sm">
        Tidak ada data untuk ditampilkan
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 48, left: 0, bottom: 60 }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={(e: any) => {
          if (e?.activePayload?.[0] && onBarClick) {
            onBarClick((e.activePayload[0].payload as BebanChartItem).id);
          }
        }}
        style={{ cursor: onBarClick ? "pointer" : "default" }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1e3552" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: "#64748b" }}
          angle={-45}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          domain={[0, 120]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: "#64748b" }}
          width={38}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <ReferenceLine
          y={OVERLOAD_PCT}
          stroke="#ef4444"
          strokeDasharray="4 2"
          label={{ value: "80%", position: "right", fontSize: 10, fill: "#ef4444" }}
        />
        <ReferenceLine
          y={60}
          stroke="#f59e0b"
          strokeDasharray="4 2"
          label={{ value: "60%", position: "right", fontSize: 10, fill: "#f59e0b" }}
        />
        <Bar dataKey="persen" radius={[3, 3, 0, 0]} maxBarSize={36}>
          {data.map((entry, i) => (
            <Cell key={i} fill={barColor(entry.persen)} fillOpacity={0.9} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
