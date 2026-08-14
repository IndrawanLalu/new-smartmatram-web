"use client";

import {
  Bar, BarChart, CartesianGrid, LabelList, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";
import ArsirPattern, { arsir } from "@/app/admin/_components/ArsirPattern";
import { CHART_OTHER, SURFACE, TOOLTIP_LIGHT } from "@/lib/chartColors";

export interface TitikBanding {
  label: string;
  /** Nilai sebelum koreksi — batang abu di kiri. */
  asli: number | null;
  /** Nilai sesudah koreksi — batang berwarna di kanan. */
  koreksi: number | null;
}

interface BandingChartProps {
  judul: string;
  subjudul: string;
  data: TitikBanding[];
  warna: string;
  /** Harus unik se-halaman — id pattern SVG bersifat global. */
  hatchId: string;
  satuan: string;
  /** Isi tambahan di sisi kanan bilah judul (mis. pemilih metrik). */
  kanan?: React.ReactNode;
}

/**
 * Perbandingan angka sebelum ↔ sesudah koreksi, dua batang berdampingan.
 *
 * Isian arsir dan tepi tegasnya mengikuti model grafik aplikasi. Yang berbeda
 * dari grafik lain: pembandingnya digambar sebagai BATANG, bukan garis putus.
 * Untuk perbandingan dua nilai pada titik waktu yang sama, dua batang bersebelah
 * bisa dibaca tingginya langsung; garis di atas batang menuntut mata mengukur
 * jarak vertikal terlebih dulu.
 *
 * Perannya tetap terbaca dari warna: data asli abu (acuan), hasil koreksi
 * berwarna (angka yang berlaku). Legenda wajib ada — warna saja tidak boleh
 * jadi satu-satunya pembeda.
 */
export default function BandingChart({
  judul, subjudul, data, warna, hatchId, satuan, kanan,
}: BandingChartProps) {
  const adaData = data.some((d) => d.koreksi !== null || d.asli !== null);
  // Dua batang per ember: angka di atas batang mulai bertabrakan jauh lebih
  // cepat daripada saat hanya satu seri.
  const banyak = data.length > 10;

  return (
    <div className={`flex flex-col h-full ${CARD}`}>
      <div className={PANEL_HEAD}>
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <span className="text-white font-semibold text-xs">{judul}</span>
          <span className="text-white/70 text-[10px]">{subjudul}</span>
        </div>
        {kanan}
      </div>

      <div className="flex-1 p-3 min-h-[248px]">
        {!adaData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-[12px] text-ink-soft">Tidak ada data pada rentang ini</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 18, right: 8, left: -18, bottom: 0 }}
              barCategoryGap="22%"
              barGap={2}
            >
              <defs>
                <ArsirPattern id={hatchId} warna={warna} />
                <ArsirPattern id={`${hatchId}-asli`} warna={CHART_OTHER} opacity={0.12} />
              </defs>

              <CartesianGrid stroke={SURFACE.line} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: SURFACE.inkSoft }}
                tickLine={false}
                axisLine={{ stroke: SURFACE.line }}
                interval={data.length > 24 ? 2 : data.length > 16 ? 1 : 0}
              />
              <YAxis
                tick={{ fontSize: 11, fill: SURFACE.inkSoft }}
                tickLine={false}
                axisLine={false}
                width={44}
                allowDecimals={false}
              />
              <Tooltip
                cursor={{ fill: SURFACE.page }}
                contentStyle={TOOLTIP_LIGHT}
                formatter={(v, n) => [
                  v === null || v === undefined ? "—" : `${Math.round(Number(v))} ${satuan}`,
                  n,
                ]}
              />
              <Legend
                verticalAlign="top" align="right" height={22} iconSize={12}
                wrapperStyle={{ fontSize: 11, color: SURFACE.inkSoft }}
              />

              <Bar
                dataKey="asli"
                name="Sebelum koreksi"
                fill={arsir(`${hatchId}-asli`)}
                stroke={CHART_OTHER}
                strokeWidth={1.25}
                radius={[5, 5, 0, 0]}
              >
                {!banyak && <AngkaBatang dataKey="asli" warna={SURFACE.inkMuted} />}
              </Bar>

              <Bar
                dataKey="koreksi"
                name="Sesudah koreksi"
                fill={arsir(hatchId)}
                stroke={warna}
                strokeWidth={1.25}
                radius={[5, 5, 0, 0]}
              >
                {!banyak && <AngkaBatang dataKey="koreksi" warna={SURFACE.inkSoft} />}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Angka di atas batang. Nilai kosong & nol dibiarkan kosong supaya tidak jadi
 *  deretan "0" di ember yang tidak ada laporannya. */
function AngkaBatang({ dataKey, warna }: { dataKey: string; warna: string }) {
  return (
    <LabelList
      dataKey={dataKey}
      position="top"
      fontSize={9}
      fill={warna}
      formatter={(v: unknown) =>
        v === null || v === undefined || Number(v) === 0 ? "" : String(Math.round(Number(v)))
      }
    />
  );
}
