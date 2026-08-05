"use client";

import {
  Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";
import { CHART_OTHER, CHART_SERIES, STATUS_COLOR, SURFACE, TOOLTIP_LIGHT } from "@/lib/chartColors";

export interface SlaPoint {
  /** Tanggal dalam bulan, "1".."31" */
  label: string;
  /** Median durasi hari itu; null bila tidak ada WO. */
  nilai: number | null;
  /** Median hari yang sama bulan sebelumnya — garis pembanding. */
  nilaiLalu: number | null;
  jumlahWo: number;
}

interface SlaChartProps {
  judul: string;
  data: SlaPoint[];
  /** Ambang SLA, digambar sebagai garis mendatar. */
  target: number;
  warna: string;
  hatchId: string;
}

/**
 * Median durasi per hari dalam satu bulan.
 *
 * Mengikuti model grafik yang dipakai di dashboard: batang berarsir, ujung
 * membulat, garis putus-putus abu untuk pembanding periode sebelumnya. Bedanya
 * di sini ada satu garis lagi — ambang SLA — dan batang yang MELEWATI ambang
 * itu diwarnai merah, supaya pelanggaran terbaca tanpa harus mengukur tinggi
 * batang terhadap garis.
 */
export default function SlaChart({ judul, data, target, warna, hatchId }: SlaChartProps) {
  const adaData = data.some((d) => d.nilai !== null);
  const adaPembanding = data.some((d) => d.nilaiLalu !== null);
  const lewat = data.filter((d) => d.nilai !== null && d.nilai > target).length;

  return (
    <div className={`flex flex-col h-full ${CARD}`}>
      <div className={PANEL_HEAD}>
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <span className="text-white font-semibold text-xs">{judul}</span>
          <span className="text-white/70 text-[10px]">
            Median per hari · ambang {target} menit
            {adaData && ` · ${lewat} hari melewati ambang`}
          </span>
        </div>
      </div>

      <div className="flex-1 p-3 min-h-[240px]">
        {!adaData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-ink-soft">Tidak ada WO pada bulan ini</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 14, right: 8, left: -18, bottom: 0 }} barCategoryGap="20%">
              <defs>
                <pattern id={hatchId} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
                  <rect width={6} height={6} fill={warna} fillOpacity={0.14} />
                  <line x1={0} y1={0} x2={0} y2={6} stroke={warna} strokeWidth={2} />
                </pattern>
                <pattern id={`${hatchId}-lewat`} patternUnits="userSpaceOnUse" width={5} height={5} patternTransform="rotate(45)">
                  <rect width={5} height={5} fill={STATUS_COLOR.kritis} fillOpacity={0.16} />
                  <line x1={0} y1={0} x2={0} y2={5} stroke={STATUS_COLOR.kritis} strokeWidth={2} />
                </pattern>
              </defs>

              <CartesianGrid stroke={SURFACE.line} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: SURFACE.inkSoft }}
                tickLine={false}
                axisLine={{ stroke: SURFACE.line }}
                interval={data.length > 24 ? 2 : 1}
              />
              <YAxis
                tick={{ fontSize: 11, fill: SURFACE.inkSoft }}
                tickLine={false}
                axisLine={false}
                width={44}
                allowDecimals={false}
                unit=""
              />
              <Tooltip
                cursor={{ fill: SURFACE.page }}
                contentStyle={TOOLTIP_LIGHT}
                formatter={(v, n) => [v === null ? "—" : `${v} menit`, n]}
              />
              {adaPembanding && (
                <Legend
                  verticalAlign="top" align="right" height={22} iconSize={12}
                  wrapperStyle={{ fontSize: 11, color: SURFACE.inkSoft }}
                />
              )}

              <ReferenceLine
                y={target}
                stroke={STATUS_COLOR.kritis}
                strokeDasharray="6 3"
                strokeWidth={1.5}
                label={{ value: "SLA", position: "insideTopRight", fontSize: 10, fill: STATUS_COLOR.kritis }}
              />

              <Bar dataKey="nilai" name="Bulan ini" radius={[5, 5, 0, 0]} strokeWidth={1.25}>
                {data.map((d, i) => {
                  const langgar = d.nilai !== null && d.nilai > target;
                  return (
                    <Cell
                      key={i}
                      fill={`url(#${langgar ? `${hatchId}-lewat` : hatchId})`}
                      stroke={langgar ? STATUS_COLOR.kritis : warna}
                    />
                  );
                })}
              </Bar>

              {adaPembanding && (
                <Line
                  type="monotone"
                  dataKey="nilaiLalu"
                  name="Bulan lalu"
                  stroke={CHART_OTHER}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={false}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export const WARNA_RESPONSE = CHART_SERIES[0];
export const WARNA_RECOVERY = CHART_SERIES[1];
