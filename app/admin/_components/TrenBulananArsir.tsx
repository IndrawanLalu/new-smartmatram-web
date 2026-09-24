"use client";

import type { LucideIcon } from "lucide-react";
import {
  Bar, CartesianGrid, Cell, ComposedChart, LabelList, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";
import ArsirPattern from "@/app/admin/_components/ArsirPattern";
import { CHART_OTHER, CHART_SERIES, SURFACE, TOOLTIP_LIGHT } from "@/lib/chartColors";

/**
 * Tren per bulan Januari–Desember — dipakai tab Dashboard tiap modul Kinerja
 * Pelayanan Teknik. Resepnya persis `dashboard/_components/TrenGangguan.tsx`
 * (model yang dipilih user): batang berarsir + garis abu putus-putus tahun lalu.
 *
 * Bulan yang belum datang TETAP digambar (keputusan user, Agustus 2026): garis
 * tahun lalu di atas bulan-bulan itu justru bagian yang berguna. Karena itu
 * rata-rata dan selisih hanya dihitung dari bulan yang sudah lewat.
 */

export interface TitikBulan {
  key: string;
  label: string;
  kini: number;
  lalu: number;
  /** Bulan sudah lewat atau sedang berjalan — ikut rata-rata. */
  lewat: boolean;
  /** Bulan yang sedang berjalan — diarsir lebih rapat. */
  berjalan: boolean;
}

interface Props {
  data: TitikBulan[];
  tahun: number;
  judul: string;
  /** Satuan untuk tooltip & rata-rata, mis. "pekerjaan", "km". */
  satuan: string;
  ikon: LucideIcon;
  loading: boolean;
  /** id unik se-halaman — id pola SVG bersifat global. */
  idArsir: string;
  warna?: string;
}

const AXIS = { fontSize: 11, fill: SURFACE.inkSoft };

export default function TrenBulananArsir({
  data, tahun, judul, satuan, ikon: Ikon, loading, idArsir, warna = CHART_SERIES[0],
}: Props) {
  const kosong = !loading && data.every((p) => !p.kini && !p.lalu);
  const adaPembanding = data.some((p) => p.lalu > 0);
  const lewat = data.filter((p) => p.lewat);
  const total = lewat.reduce((a, p) => a + p.kini, 0);
  const totalLalu = lewat.reduce((a, p) => a + p.lalu, 0);
  const rata = lewat.length ? total / lewat.length : 0;
  const selisih = totalLalu > 0 ? ((total - totalLalu) / totalLalu) * 100 : null;
  const bulat = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

  return (
    <div className={`flex flex-col h-full ${CARD}`}>
      <div className={PANEL_HEAD}>
        <Ikon size={14} className="text-white/80" />
        <div className="flex flex-col leading-tight">
          <span className="text-white font-semibold text-xs">{judul}</span>
          <span className="text-white/70 text-[10px]">
            {tahun}, per bulan
            {!loading && !kosong && ` · rata-rata ${bulat(rata)} ${satuan}/bulan`}
            {!loading && selisih !== null &&
              ` · ${selisih >= 0 ? "+" : "−"}${Math.abs(selisih).toFixed(0)}% dari ${tahun - 1}`}
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
            <span className="text-[12px] text-ink-soft">Belum ada data pada {tahun}</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 18, right: 8, left: -18, bottom: 0 }} barCategoryGap="22%">
              <defs>
                <ArsirPattern id={idArsir} warna={warna} />
                <ArsirPattern id={`${idArsir}Kini`} warna={warna} opacity={0.28} jarak={4} />
              </defs>
              <CartesianGrid stroke={SURFACE.line} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: SURFACE.line }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: SURFACE.page }}
                contentStyle={TOOLTIP_LIGHT}
                formatter={(value, name) => [`${bulat(Number(value ?? 0))} ${satuan}`, name]}
              />
              {adaPembanding && (
                <Legend verticalAlign="top" align="right" height={24} iconSize={12} wrapperStyle={{ fontSize: 11, color: SURFACE.inkSoft }} />
              )}
              <Bar dataKey="kini" name={String(tahun)} radius={[6, 6, 0, 0]} stroke={warna} strokeWidth={1.25}>
                {data.map((p) => (
                  <Cell key={p.key} fill={`url(#${p.berjalan ? `${idArsir}Kini` : idArsir})`} />
                ))}
                <LabelList
                  dataKey="kini"
                  position="top"
                  offset={6}
                  fontSize={10}
                  fill={SURFACE.inkSoft}
                  formatter={(v) => (Number(v) > 0 ? bulat(Number(v)) : "")}
                />
              </Bar>
              {adaPembanding && (
                <Line
                  type="monotone"
                  dataKey="lalu"
                  name={`${tahun - 1}`}
                  stroke={CHART_OTHER}
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  dot={{ r: 2.5, fill: CHART_OTHER, strokeWidth: 0 }}
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
