"use client";

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { GitMerge } from "lucide-react";
import type { ParetoItem } from "../_hooks/useAdvancedDashboard";

interface Props {
  items: ParetoItem[];
  loading?: boolean;
}

const SECTION_DESC = `Prinsip Pareto (80/20): sebagian kecil penyulang biasanya menyebabkan sebagian besar total gangguan.
Identifikasi penyulang-penyulang ini untuk memaksimalkan dampak program perbaikan dengan sumber daya terbatas.`;

export default function ParetoChart({ items, loading = false }: Props) {
  const cutoff80 = items.findIndex((i) => i.cumPct >= 80);
  const penyulangFor80 = cutoff80 >= 0 ? cutoff80 + 1 : items.length;
  const pctPenyulang = items.length > 0 ? ((penyulangFor80 / items.length) * 100).toFixed(0) : "0";

  return (
    <div className="bg-white rounded-xl border border-line shadow-sm">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-amber-50 rounded-lg">
            <GitMerge className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-lg">Analisis Pareto Penyulang</h3>
            <p className="text-ink-soft text-xs mt-0.5">Identifikasi penyulang penyebab mayoritas gangguan</p>
          </div>
        </div>
        <p className="text-ink-soft text-xs leading-relaxed border-l-2 border-amber-500/50 pl-3">{SECTION_DESC}</p>

        {!loading && items.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-amber-600 font-bold text-lg">{penyulangFor80}</p>
              <p className="text-ink-soft text-xs">penyulang capai 80% gangguan</p>
            </div>
            <div className="bg-white border border-line rounded-lg px-3 py-2">
              <p className="text-ink font-bold text-lg">{pctPenyulang}%</p>
              <p className="text-ink-soft text-xs">dari total penyulang</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <p className="text-red-600 font-bold text-lg">{items[0]?.penyulang ?? "-"}</p>
              <p className="text-ink-soft text-xs">paling bermasalah ({items[0]?.count ?? 0}x)</p>
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pb-5">
        {loading ? (
          <div className="h-72 flex items-center justify-center">
            <div className="w-8 h-8 border-4 border-line border-t-amber-400 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-ink-soft">Tidak ada data</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={items} margin={{ top: 5, right: 40, left: 0, bottom: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,26,46,0.08)" />
              <XAxis
                dataKey="penyulang"
                stroke="rgba(15,26,46,0.35)"
                style={{ fontSize: "9px" }}
                angle={-45}
                textAnchor="end"
                interval={0}
                height={80}
                tick={{ fill: "rgba(15,26,46,0.65)" }}
              />
              <YAxis yAxisId="left" stroke="rgba(15,26,46,0.35)" style={{ fontSize: "10px" }} tick={{ fill: "rgba(15,26,46,0.65)" }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} stroke="rgba(15,26,46,0.35)" style={{ fontSize: "10px" }} tick={{ fill: "rgba(15,26,46,0.65)" }} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ background: "#ffffff", border: "1px solid #e4e8f0", borderRadius: "8px" }}
                labelStyle={{ color: "#0f1a2e", fontWeight: 600 }}
                formatter={(value: number | undefined, name: string | undefined) => (name ?? "") === "cumPct" ? [`${value ?? 0}%`, "Kumulatif"] : [`${value ?? 0}`, "Gangguan"]}
              />
              <Legend wrapperStyle={{ color: "rgba(15,26,46,0.65)", fontSize: "11px", paddingTop: "8px" }} />
              <ReferenceLine yAxisId="right" y={80} stroke="rgba(249,115,22,0.7)" strokeDasharray="4 4" label={{ value: "80%", fill: "rgba(249,115,22,0.9)", fontSize: 10, position: "right" }} />
              <Bar yAxisId="left" dataKey="count" name="Jumlah Gangguan" fill="rgba(239,68,68,0.7)" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="cumPct" name="Kumulatif %" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
