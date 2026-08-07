"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from "recharts";
import ArsirPattern, { arsir } from "@/app/admin/_components/ArsirPattern";
import { CHART_SERIES, STATUS_COLOR, SURFACE, TOOLTIP_LIGHT } from "@/lib/chartColors";

const ARSIR = "arsirApktHarian";

interface Titik {
  key: string;
  label: string;
  jumlah: number;
  rpt: number | null;
  rct: number | null;
}

/**
 * Jumlah gangguan harian (batang berarsir) dengan response & recovery time
 * sebagai garis pada sumbu kedua.
 *
 * Dua sumbu karena satuannya memang beda: jumlah kejadian belasan, durasi
 * ratusan menit. Dipaksa satu sumbu, batangnya akan rata di dasar grafik.
 */
export default function ApktHarianChart({
  data, targetResponse,
}: {
  data: Titik[];
  targetResponse: number | null;
}) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-ink-soft text-sm">
        Tidak ada data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 6, right: 4, left: -12, bottom: 0 }}>
        <defs>
          <ArsirPattern id={ARSIR} warna={CHART_SERIES[0]} />
        </defs>

        <CartesianGrid stroke={SURFACE.line} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: SURFACE.inkMuted }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="jml" allowDecimals={false}
          tick={{ fontSize: 10, fill: SURFACE.inkMuted }}
          axisLine={false} tickLine={false} width={30}
        />
        <YAxis
          yAxisId="menit" orientation="right"
          tick={{ fontSize: 10, fill: SURFACE.inkMuted }}
          axisLine={false} tickLine={false} width={34}
        />
        <Tooltip
          contentStyle={TOOLTIP_LIGHT}
          // Recharts memberi `value`/`name` bertipe boleh-undefined; jumlah
          // gangguan ditampilkan apa adanya, dua garis lainnya dalam menit.
          formatter={(v: number | undefined, n: string | undefined) =>
            n === "Gangguan"
              ? [v ?? 0, n]
              : [`${Math.round(v ?? 0)} menit`, n ?? ""]
          }
        />
        <Legend wrapperStyle={{ fontSize: 10, color: SURFACE.inkMuted }} iconType="plainline" iconSize={12} />

        {targetResponse !== null && (
          <ReferenceLine
            yAxisId="menit" y={targetResponse}
            stroke={STATUS_COLOR.kritis} strokeDasharray="4 4"
            label={{ value: "Target RPT", position: "right", fontSize: 9, fill: STATUS_COLOR.kritis }}
          />
        )}

        <Bar
          yAxisId="jml" dataKey="jumlah" name="Gangguan" radius={[4, 4, 0, 0]}
          fill={arsir(ARSIR)} stroke={CHART_SERIES[0]} strokeWidth={1.25}
        />
        <Line
          yAxisId="menit" type="monotone" dataKey="rpt" name="Response"
          stroke={STATUS_COLOR.waspada} strokeWidth={2} dot={false} connectNulls
        />
        <Line
          yAxisId="menit" type="monotone" dataKey="rct" name="Recovery"
          stroke={CHART_SERIES[1]} strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
