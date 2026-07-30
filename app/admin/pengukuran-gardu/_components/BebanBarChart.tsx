"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Cell, ResponsiveContainer,
} from "recharts";
import { OVERLOAD_PCT, HIGH_TEMP_C } from "../_hooks/usePengukuranGardu";
import { STATUS_COLOR, SURFACE, TOOLTIP_LIGHT } from "@/lib/chartColors";

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
  if (pct >= OVERLOAD_PCT) return STATUS_COLOR.kritis;
  if (pct >= 60)           return STATUS_COLOR.waspada;
  return STATUS_COLOR.aman;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as BebanChartItem;
  const pct = d.persen;
  const pctCls = pct >= OVERLOAD_PCT ? "text-red-600" : pct >= 60 ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="bg-surface border border-line rounded-xl shadow-2xl p-3 text-xs min-w-42.5">
      <p className="font-bold text-ink mb-2 text-sm">{d.name}</p>
      <div className="space-y-1 text-ink-soft">
        <div className="flex justify-between gap-4">
          <span>Alamat</span>
          <span className="text-ink font-medium truncate max-w-36">{d.alamat}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Beban</span>
          <span className={`font-bold ${pctCls}`}>{pct}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>KVA</span>
          <span className="text-ink">{d.kva} / {d.kapasitas} kVA</span>
        </div>
        <div className="border-t border-line pt-1 mt-1">
          <div className="flex justify-between gap-4">
            <span>Arus R/S/T</span>
            <span className="text-ink font-mono">{d.arusR}/{d.arusS}/{d.arusT} A</span>
          </div>
          {d.suhu > 0 && (
            <div className="flex justify-between gap-4">
              <span>Suhu Trafo</span>
              <span className={d.suhu > HIGH_TEMP_C ? "text-amber-600 font-bold" : "text-ink"}>
                {d.suhu}°C
              </span>
            </div>
          )}
        </div>
        <p className="text-[10px] text-ink-muted mt-1 pt-1 border-t border-line">Klik untuk detail</p>
      </div>
    </div>
  );
}

export default function BebanBarChart({ data, onBarClick }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-ink-soft text-sm">
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
        <CartesianGrid stroke={SURFACE.line} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 9, fill: SURFACE.inkMuted }}
          angle={-45}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          domain={[0, 120]}
          tickFormatter={(v) => `${v}%`}
          tick={{ fontSize: 10, fill: SURFACE.inkMuted }}
          width={38}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
        <ReferenceLine
          y={OVERLOAD_PCT}
          stroke={STATUS_COLOR.kritis}
          strokeDasharray="4 2"
          label={{ value: "80%", position: "right", fontSize: 10, fill: STATUS_COLOR.kritis }}
        />
        <ReferenceLine
          y={60}
          stroke={STATUS_COLOR.waspada}
          strokeDasharray="4 2"
          label={{ value: "60%", position: "right", fontSize: 10, fill: STATUS_COLOR.waspada }}
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
