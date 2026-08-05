"use client";

import { Zap } from "lucide-react";
import {
  Bar, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";
import { CHART_OTHER, CHART_SERIES, SURFACE, TOOLTIP_LIGHT } from "@/lib/chartColors";
import type { ChartPoint, PeriodKey } from "../_hooks/useDashboardOverview";

const WARNA = CHART_SERIES[0];
/** Tahun lalu = garis acuan, bukan identitas tersendiri — karena itu abu, sesuai
 *  peran CHART_OTHER di palet. Dibedakan lagi lewat BENTUK (garis vs batang),
 *  jadi warna bukan satu-satunya pembeda. */
const WARNA_LALU = CHART_OTHER;
const HATCH_ID = "arsirGangguan";
const HATCH_KINI_ID = "arsirGangguanKini";

const AXIS = { fontSize: 11, fill: SURFACE.inkSoft };

/** Judul rentang + satuan ember per periode. Nama satuan ikut dipakai di
 *  rata-rata supaya angkanya tidak ambigu ("per hari" vs "per bulan"). */
const RENTANG: Record<PeriodKey, { judul: string; satuan: string }> = {
  bulan: { judul: "Bulan ini, per hari", satuan: "hari" },
  "3bulan": { judul: "3 bulan terakhir, per minggu", satuan: "minggu" },
  tahun: { judul: "Tahun ini, per bulan", satuan: "bulan" },
};

interface TrenGangguanProps {
  data: ChartPoint[];
  period: PeriodKey;
  loading: boolean;
}

/**
 * Gangguan penyulang per bulan, 12 bulan terakhir.
 *
 * Batangnya diarsir, bukan blok warna padat: isian bergaris menurunkan bobot
 * visual grafik sehingga tidak menenggelamkan kartu-kartu di sekitarnya, tapi
 * bentuk batangnya tetap terbaca. Supaya tetap kontras di permukaan terang,
 * arsirnya berdiri di atas dasar bertinta tipis dari warna yang sama — hanya
 * garis saja akan terbaca terlalu pucat.
 */
export default function TrenGangguan({ data, period, loading }: TrenGangguanProps) {
  const kosong = !loading && data.every((p) => !p.gangguan);
  const tahunIni = new Date().getFullYear();
  const { judul, satuan } = RENTANG[period];

  /** Tanpa riwayat setahun lalu, garis pembandingnya rata nol — lebih baik
   *  tidak digambar sama sekali daripada memajang garis dasar palsu. */
  const adaPembanding = data.some((p) => p.gangguanLalu > 0);

  // Rata-rata dan selisih HANYA dari ember yang sudah lewat. Menyertakan ember
  // masa depan (yang pasti nol) akan menekan rata-rata dan membuat "turun dari
  // tahun lalu" terlihat lebih besar dari kenyataan.
  const lewat = data.filter((p) => p.lewat);
  const total = lewat.reduce((a, p) => a + p.gangguan, 0);
  const totalLalu = lewat.reduce((a, p) => a + p.gangguanLalu, 0);
  const rata = lewat.length ? total / lewat.length : 0;
  const selisihPct = totalLalu > 0 ? ((total - totalLalu) / totalLalu) * 100 : null;

  // Tampilan harian punya sampai 31 batang: label angka di atas tiap batang
  // berubah jadi bubur, dan label sumbu perlu dijarangkan.
  const padat = data.length > 16;
  const jarakTick = data.length > 24 ? 2 : data.length > 16 ? 1 : 0;

  return (
    <div className={`flex flex-col h-full ${CARD}`}>
      <div className={PANEL_HEAD}>
        <Zap size={14} className="text-white/80" />
        <div className="flex flex-col leading-tight">
          <span className="text-white font-semibold text-xs">Gangguan Penyulang</span>
          <span className="text-white/70 text-[10px]">
            {judul}
            {!loading && !kosong && ` · rata-rata ${rata.toFixed(1)} kejadian/${satuan}`}
            {!loading && selisihPct !== null &&
              ` · ${selisihPct >= 0 ? "+" : "−"}${Math.abs(selisihPct).toFixed(0)}% dari ${tahunIni - 1}`}
          </span>
        </div>
      </div>

      <div className="flex-1 p-3 min-h-[260px]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-line border-t-navy-600 rounded-full animate-spin" />
          </div>
        ) : kosong ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-ink-soft">Belum ada gangguan pada 12 bulan terakhir</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
              <defs>
                <Arsir id={HATCH_ID} opacity={0.14} />
                {/* Ember yang sedang berjalan diarsir lebih rapat — belum genap,
                    jadi ditandai berbeda supaya tidak dibaca setara ember penuh. */}
                <Arsir id={HATCH_KINI_ID} opacity={0.28} jarak={4} />
              </defs>

              <CartesianGrid stroke={SURFACE.line} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS}
                tickLine={false}
                axisLine={{ stroke: SURFACE.line }}
                interval={jarakTick}
              />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: SURFACE.page }}
                contentStyle={TOOLTIP_LIGHT}
                formatter={(value, name) => [`${value ?? 0} kejadian`, name]}
              />

              {adaPembanding && (
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={24}
                  iconSize={12}
                  wrapperStyle={{ fontSize: 11, color: SURFACE.inkSoft }}
                />
              )}

              <Bar
                dataKey="gangguan"
                name={String(tahunIni)}
                radius={[6, 6, 0, 0]}
                stroke={WARNA}
                strokeWidth={1.25}
              >
                {data.map((p) => (
                  <Cell key={p.key} fill={`url(#${p.berjalan ? HATCH_KINI_ID : HATCH_ID})`} />
                ))}
                {!padat && (
                  <LabelList
                    dataKey="gangguan"
                    position="top"
                    offset={6}
                    fontSize={10}
                    fill={SURFACE.inkSoft}
                    formatter={(v) => (Number(v) > 0 ? String(v) : "")}
                  />
                )}
              </Bar>

              {adaPembanding && (
                <Line
                  type="monotone"
                  dataKey="gangguanLalu"
                  name={`${tahunIni - 1} (periode sama)`}
                  stroke={WARNA_LALU}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 2.5, fill: WARNA_LALU, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Pola arsir diagonal 45°: dasar bertinta tipis + garis warna penuh. */
function Arsir({ id, opacity, jarak = 6 }: { id: string; opacity: number; jarak?: number }) {
  return (
    <pattern
      id={id}
      patternUnits="userSpaceOnUse"
      width={jarak}
      height={jarak}
      patternTransform="rotate(45)"
    >
      <rect width={jarak} height={jarak} fill={WARNA} fillOpacity={opacity} />
      <line x1={0} y1={0} x2={0} y2={jarak} stroke={WARNA} strokeWidth={2} />
    </pattern>
  );
}
