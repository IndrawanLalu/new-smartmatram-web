"use client";

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import ArsirPattern, { arsir } from "@/app/admin/_components/ArsirPattern";
import { CHART_SERIES, STATUS_COLOR } from "@/lib/chartColors";

/**
 * Ember distribusi beban trafo.
 *
 * Batasnya mengikuti titik KEPUTUSAN, bukan pembagian angka yang rapi:
 *
 * - 20% dan 80% bukan pilihan bebas — keduanya `UNDERLOAD_PCT` dan
 *   `OVERLOAD_PCT` yang sudah dipakai kartu KPI di atas grafik ini. Memecah
 *   golongan bawah di 10% membuat pembaca harus menjumlahkan dua potong untuk
 *   mencocokkan dengan kartu "Trafo Underload" — grafiknya justru melawan
 *   angka di sebelahnya.
 * - Rentang 20–50% sengaja dipecah jadi 20–40 dan 40–60. Dari 980 gardu
 *   terukur, 20–50% sendirian memuat 44% armada: potongan terbesar sekaligus
 *   yang paling tidak memberi tahu apa-apa.
 *
 * Batas bawah inklusif, batas atas eksklusif — jadi tepat 20% masuk "Longgar"
 * dan tepat 80% masuk "Overload", sama persis dengan `overloadData`
 * (`>= OVERLOAD_PCT`) dan `underloadData` (`< UNDERLOAD_PCT`) di hooknya.
 */
const EMBER = [
  { id: "underload", min: 0,  max: 20,       label: "Underload", rentang: "< 20%",   warna: CHART_SERIES[0] },
  { id: "longgar",   min: 20, max: 40,       label: "Longgar",   rentang: "20–40%",  warna: CHART_SERIES[1] },
  { id: "ideal",     min: 40, max: 60,       label: "Ideal",     rentang: "40–60%",  warna: STATUS_COLOR.aman },
  { id: "waspada",   min: 60, max: 80,       label: "Waspada",   rentang: "60–80%",  warna: STATUS_COLOR.waspada },
  { id: "overload",  min: 80, max: Infinity, label: "Overload",  rentang: "≥ 80%",   warna: STATUS_COLOR.kritis },
] as const;

const persen = (n: number, dari: number) =>
  dari === 0 ? "0" : (100 * n / dari).toFixed(1).replace(".", ",");

interface Potong {
  id: string;
  label: string;
  rentang: string;
  warna: string;
  value: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TooltipDonut({ active, payload, total }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as Potong;
  return (
    <div className="bg-white border border-line rounded-xl shadow-2xl px-3 py-2 text-xs">
      <p className="font-bold text-ink">{p.label}</p>
      <p className="text-ink-soft">{p.rentang} beban trafo</p>
      <p className="mt-1 font-semibold" style={{ color: p.warna }}>
        {p.value} gardu · {persen(p.value, total)}%
      </p>
    </div>
  );
}

interface Props {
  /** Persentase beban tiap gardu (satu nilai per gardu, pengukuran terbaru). */
  beban: number[];
}

export default function DistribusiBebanDonut({ beban }: Props) {
  const potongan = useMemo<Potong[]>(
    () => EMBER.map((e) => ({
      id: e.id,
      label: e.label,
      rentang: e.rentang,
      warna: e.warna,
      // Angka yang TAMPIL, bukan mentahnya — 79,73% tertulis "80%" di seluruh
      // layar, jadi ia harus jatuh ke ember Overload seperti yang dibaca orang.
      value: beban.filter((v) => Math.round(v) >= e.min && Math.round(v) < e.max).length,
    })),
    [beban],
  );

  const total = beban.length;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-ink-soft text-sm">
        Tidak ada data
      </div>
    );
  }

  // Ember kosong dibuang dari lingkaran supaya tidak menyisakan celah garis
  // tepi tanpa isi, tapi tetap tampil di keterangan — "nol gardu overload"
  // adalah kabar yang justru ingin dibaca.
  const terisi = potongan.filter((p) => p.value > 0);

  return (
    // Donat di atas keterangan, bukan di sebelahnya: kartunya kini sepertiga
    // lebar baris, dan susunan berdampingan memaksa keterangannya terpotong.
    //
    // Tinggi kartu 288px; keterangan sengaja dipadatkan ke ~85px supaya sisanya
    // jatuh ke lingkarannya. Keterangan boleh kecil — ia dibaca satu per satu,
    // sedangkan lingkarannya dibaca sekilas dan justru butuh ukuran.
    <div className="flex flex-col items-center gap-2 h-full">
      <div className="relative w-40 h-40 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {EMBER.map((e) => (
                <ArsirPattern key={e.id} id={`arsirBeban-${e.id}`} warna={e.warna} opacity={0.2} jarak={5} />
              ))}
            </defs>
            <Pie
              data={terisi}
              dataKey="value"
              nameKey="label"
              innerRadius="54%"
              outerRadius="98%"
              paddingAngle={1.5}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
            >
              {terisi.map((p) => (
                <Cell
                  key={p.id}
                  fill={arsir(`arsirBeban-${p.id}`)}
                  stroke={p.warna}
                  strokeWidth={1.5}
                />
              ))}
            </Pie>
            <Tooltip content={<TooltipDonut total={total} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Lubang donat dipakai untuk penyebutnya — supaya tiap persentase di
            keterangan punya acuan tanpa perlu dicari ke tempat lain. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold text-ink leading-none">{total}</span>
          <span className="text-[10px] font-medium text-ink-soft mt-0.5">gardu</span>
        </div>
      </div>

      {/* Keterangan membawa angka pastinya. Potongan Overload di sini cuma
          sekitar 1% armada — terlalu tipis untuk dibaca dari lingkarannya,
          padahal justru itu golongan yang paling perlu dilihat orang. */}
      <ul className="w-full">
        {potongan.map((p) => (
          <li key={p.id} className="flex items-center gap-1.5 text-[11px] leading-4 py-px">
            <span
              className="w-2 h-2 rounded-xs shrink-0"
              style={{ background: p.warna, opacity: p.value > 0 ? 1 : 0.3 }}
            />
            <span className={`font-semibold w-14 shrink-0 ${p.value > 0 ? "text-ink" : "text-ink-muted"}`}>
              {p.label}
            </span>
            <span className="text-ink-soft flex-1 min-w-0 truncate tabular-nums">{p.rentang}</span>
            <span className="font-bold text-ink text-right tabular-nums">{p.value}</span>
            <span className="text-ink-soft text-right w-10 shrink-0 tabular-nums">{persen(p.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
