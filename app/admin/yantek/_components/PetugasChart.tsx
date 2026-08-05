"use client";

import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CHART_SERIES, STATUS_COLOR, SURFACE, TOOLTIP_LIGHT } from "@/lib/chartColors";

export interface PetugasChartPoint {
  label: string;
  jumlah: number;
  rpt: number | null;
  rct: number | null;
}

interface PetugasChartProps {
  data: PetugasChartPoint[];
  slaResponse: number;
  slaRecovery: number;
  /** Rata-rata gangguan per hari — digambar sebagai garis acuan pada sumbu kiri. */
  rataGangguan: number;
}

const NAVY = "#2A4A9C";
const HATCH = "arsirPetugasHarian";

/**
 * Satu grafik untuk tiga besaran yang satuannya berbeda.
 *
 * Jumlah gangguan (buah) dan durasi (menit) tidak boleh berbagi satu sumbu —
 * skalanya terpaut jauh dan batang akan tenggelam. Karena itu sumbu kiri untuk
 * jumlah, sumbu kanan untuk menit, dan bentuknya dibedakan: batang untuk
 * jumlah, garis untuk durasi. Legenda wajib ada karena warna bukan satu-satunya
 * pembeda di sini.
 */
export default function PetugasChart({
  data, slaResponse, slaRecovery, rataGangguan,
}: PetugasChartProps) {
  const kosong = data.every((d) => d.jumlah === 0);

  if (kosong) {
    return (
      <div className="flex items-center justify-center h-full min-h-[220px]">
        <span className="text-[12px] text-ink-soft">Tidak ada gangguan pada bulan ini</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={data} margin={{ top: 16, right: 4, left: -20, bottom: 0 }} barCategoryGap="22%">
        <defs>
          <pattern id={HATCH} patternUnits="userSpaceOnUse" width={6} height={6} patternTransform="rotate(45)">
            <rect width={6} height={6} fill={NAVY} fillOpacity={0.14} />
            <line x1={0} y1={0} x2={0} y2={6} stroke={NAVY} strokeWidth={2} />
          </pattern>
        </defs>

        <CartesianGrid stroke={SURFACE.line} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: SURFACE.inkSoft }}
          tickLine={false}
          axisLine={{ stroke: SURFACE.line }}
          interval={data.length > 24 ? 2 : 1}
        />
        <YAxis
          yAxisId="jml"
          tick={{ fontSize: 10, fill: SURFACE.inkSoft }}
          tickLine={false}
          axisLine={false}
          width={38}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="mnt"
          orientation="right"
          tick={{ fontSize: 10, fill: SURFACE.inkSoft }}
          tickLine={false}
          axisLine={false}
          width={40}
          allowDecimals={false}
        />
        <Tooltip
          cursor={{ fill: SURFACE.page }}
          contentStyle={TOOLTIP_LIGHT}
          formatter={(v, n) => [v === null ? "—" : n === "Gangguan" ? `${v} WO` : `${v} menit`, n]}
          labelFormatter={(l) => `Tanggal ${l}`}
        />
        <Legend
          verticalAlign="top" align="right" height={24} iconSize={12}
          wrapperStyle={{ fontSize: 11, color: SURFACE.inkSoft }}
        />

        {/* Rata-rata gangguan harian — acuan pada sumbu jumlah. */}
        <ReferenceLine
          yAxisId="jml"
          y={rataGangguan}
          stroke={SURFACE.inkMuted}
          strokeDasharray="4 4"
          label={{
            value: `rata-rata ${rataGangguan.toFixed(1)}`,
            position: "insideTopLeft",
            fontSize: 9,
            fill: SURFACE.inkMuted,
          }}
        />

        {/* Ambang SLA pada sumbu menit. */}
        <ReferenceLine yAxisId="mnt" y={slaResponse} stroke={CHART_SERIES[0]} strokeDasharray="5 3" strokeWidth={1} />
        <ReferenceLine yAxisId="mnt" y={slaRecovery} stroke={CHART_SERIES[1]} strokeDasharray="5 3" strokeWidth={1} />

        <Bar
          yAxisId="jml"
          dataKey="jumlah"
          name="Gangguan"
          fill={`url(#${HATCH})`}
          stroke={NAVY}
          strokeWidth={1.25}
          radius={[5, 5, 0, 0]}
        />
        <Line
          yAxisId="mnt"
          type="monotone"
          dataKey="rpt"
          name="RPT (mnt)"
          stroke={CHART_SERIES[0]}
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
        />
        <Line
          yAxisId="mnt"
          type="monotone"
          dataKey="rct"
          name="RCT (mnt)"
          stroke={CHART_SERIES[1]}
          strokeWidth={2}
          dot={{ r: 2 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export { STATUS_COLOR };
