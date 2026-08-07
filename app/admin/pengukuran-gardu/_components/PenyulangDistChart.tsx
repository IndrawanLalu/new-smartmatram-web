"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { STATUS_COLOR, SURFACE } from "@/lib/chartColors";
import ArsirPattern, { arsir } from "@/app/admin/_components/ArsirPattern";

const ARSIR = { overload: "arsirPnyOverload", warning: "arsirPnyWarning", normal: "arsirPnyNormal" } as const;

export interface PenyulangChartItem {
  name: string;
  overload: number;
  warning: number;
  normal: number;
  total: number;
}

interface Props {
  data: PenyulangChartItem[];
  /** Batas jumlah penyulang yang digambar. Datanya sudah terurut dari yang
   *  paling banyak overload, jadi memotongnya menyisakan yang paling penting.
   *
   *  Ada 32 penyulang di keempat ULP (23 di Ampenan saja). Di kartu selebar
   *  sepertiga baris, 32 nama pada sumbu X saling menimpa jadi bubur dan
   *  batangnya menyusut ke beberapa piksel — grafiknya berhenti bercerita. */
  maks?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = (payload as { value: number }[]).reduce((s, p) => s + p.value, 0);
  return (
    <div className="bg-surface border border-line rounded-xl shadow-2xl p-3 text-xs min-w-36">
      <p className="font-bold text-ink mb-2">{label}</p>
      <div className="space-y-1">
        {payload.map((p: { name: string; value: number; color: string }) => (
          <div key={p.name} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-sm inline-block" style={{ background: p.color }} />
              <span className="text-ink-soft capitalize">{p.name}</span>
            </span>
            <span className="font-semibold" style={{ color: p.color }}>{p.value} gardu</span>
          </div>
        ))}
        <div className="border-t border-line pt-1 mt-1 flex justify-between text-ink-soft">
          <span>Total</span>
          <span className="text-ink font-bold">{total}</span>
        </div>
      </div>
    </div>
  );
}

export default function PenyulangDistChart({ data, maks }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-ink-soft text-sm">
        Tidak ada data
      </div>
    );
  }

  const tampil = maks ? data.slice(0, maks) : data;

  return (
    // Batang menyamping: nama penyulang jadi label baris, bukan tulisan sumbu X
    // yang saling menimpa. Nama sepanjang "OUTLET EPICENTRUM" pun terbaca utuh,
    // dan menambah penyulang tinggal menambah baris — bukan memepetkan kolom.
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={tampil}
        layout="vertical"
        margin={{ top: 4, right: 12, left: 0, bottom: 0 }}
        barSize={13}
      >
        <defs>
          {/* Batang bertumpuk: garis tepi tiap segmen justru membantu —
              ia memisahkan tumpukan tanpa perlu jarak antar segmen. */}
          <ArsirPattern id={ARSIR.overload} warna={STATUS_COLOR.kritis} opacity={0.18} jarak={5} />
          <ArsirPattern id={ARSIR.warning}  warna={STATUS_COLOR.waspada} />
          <ArsirPattern id={ARSIR.normal}   warna={STATUS_COLOR.aman} />
        </defs>

        <CartesianGrid stroke={SURFACE.line} strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={{ fontSize: 10, fill: SURFACE.inkMuted }}
          axisLine={false}
          tickLine={false}
          height={18}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 10, fill: SURFACE.inkSoft }}
          width={94}
          interval={0}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(20,33,58,0.04)" }} />
        <Legend
          wrapperStyle={{ fontSize: 10, color: SURFACE.inkMuted, paddingTop: 2 }}
          iconType="square"
          iconSize={8}
        />
        <Bar
          dataKey="overload" name="Overload" stackId="a"
          fill={arsir(ARSIR.overload)} stroke={STATUS_COLOR.kritis} strokeWidth={1}
        />
        <Bar
          dataKey="warning" name="Warning" stackId="a"
          fill={arsir(ARSIR.warning)} stroke={STATUS_COLOR.waspada} strokeWidth={1}
        />
        <Bar
          dataKey="normal" name="Normal" stackId="a" radius={[0, 5, 5, 0]}
          fill={arsir(ARSIR.normal)} stroke={STATUS_COLOR.aman} strokeWidth={1}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
