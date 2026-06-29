"use client";

import { Brain, Cpu, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, CartesianGrid } from "recharts";

export interface MlbStatus {
  method: string;
  f1: number | null;
  gate: number;
  known: number;
  unknown: number;
  n_features: number;
  n_xgb?: number;
  conf_min?: number;
}

export interface F1Point {
  label: string;
  f1: number;
}

interface Props {
  data: MlbStatus | null;
  trend?: F1Point[];
}

const FITUR = [
  "Waktu (jam)", "Akhir pekan", "Bulan / musim",
  "Cuaca (hujan/angin/petir)", "Arus IR/IS/IT/IN", "ULP",
];

export default function ModelBStatus({ data, trend }: Props) {
  const isXgb = data?.method === "xgboost";
  const isHybrid = data?.method === "hybrid";
  const usesMl = isXgb || isHybrid;
  const confPct = Math.round((data?.conf_min ?? 0.6) * 100);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E2E8F0] p-5">
      <h2 className="text-sm font-bold text-[#1B2631] mb-3 flex items-center gap-2">
        <Brain className="w-4 h-4 text-[#00897B]" /> Status Pembelajaran Model B — penebak penyebab &quot;T&quot;
      </h2>

      {!data ? (
        <p className="text-sm text-[#94a3b8]">Belum ada catatan. Jalankan pipeline ML dulu.</p>
      ) : (
        <div className="space-y-3">
          {/* Mode aktif */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#64748b]">Metode aktif sekarang:</span>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
              isXgb ? "bg-emerald-100 text-emerald-700" : isHybrid ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"
            }`}>
              <Cpu className="w-3.5 h-3.5" />
              {isXgb ? "XGBoost (Machine Learning)" : isHybrid ? "Hybrid (XGBoost + Baseline)" : "Baseline (frekuensi + aturan cuaca)"}
            </span>
          </div>

          {/* F1 / rapor */}
          {data.f1 != null ? (
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-[#64748b]">Nilai rapor model (F1 macro)</span>
                <span className="font-mono font-bold text-[#1B2631]">{data.f1.toFixed(2)} <span className="text-[#94a3b8] font-normal">/ lulus ≥ {data.gate}</span></span>
              </div>
              <div className="relative h-3 bg-[#F4F6F8] rounded-full overflow-hidden border border-[#E2E8F0]">
                <div className={`h-full rounded-full ${data.f1 >= data.gate ? "bg-emerald-500" : "bg-amber-500"}`} style={{ width: `${Math.min(100, data.f1 * 100)}%` }} />
                {/* garis ambang */}
                <div className="absolute top-0 bottom-0 w-0.5 bg-[#ef4444]" style={{ left: `${data.gate * 100}%` }} title={`Ambang ${data.gate}`} />
              </div>
              <p className={`text-[11px] mt-1 font-semibold ${data.f1 >= data.gate ? "text-emerald-600" : "text-amber-600"}`}>
                {data.f1 >= data.gate ? "Lulus ambang → memakai XGBoost." : `Belum lulus ambang (garis merah ${data.gate}) → otomatis pakai baseline.`}
              </p>
            </div>
          ) : (
            <p className="text-xs text-[#94a3b8]">Model belum dievaluasi (algoritma/ data tidak tersedia) → pakai baseline.</p>
          )}

          {/* Tren F1 antar run */}
          {trend && trend.length >= 2 && (
            <div>
              <p className="text-[11px] text-[#94a3b8] mb-1 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" /> Tren F1 antar run pipeline (naik = makin pintar)
              </p>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ top: 5, right: 8, bottom: 0, left: -14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eef2f6" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <YAxis domain={[0, 0.6]} tick={{ fontSize: 9, fill: "#94a3b8" }} />
                    <ReferenceLine y={data.gate} stroke="#ef4444" strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="f1" stroke="#00897B" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[10px] text-[#94a3b8]">Garis merah = ambang {data.gate}.</p>
            </div>
          )}

          {/* Data latih */}
          <p className="text-sm text-[#1B2631]">
            Belajar dari <b>{data.known.toLocaleString("id-ID")}</b> kejadian ber-KODE (penyebab pasti), untuk menebak <b>{data.unknown.toLocaleString("id-ID")}</b> kejadian berkode <b>&quot;T&quot;</b> (temporer).
            {isHybrid && data.n_xgb != null && (
              <> Dari situ, <b className="text-sky-700">{data.n_xgb}</b> ditebak XGBoost (yakin ≥{confPct}%), sisanya <b>{data.unknown - data.n_xgb}</b> via baseline.</>
            )}
          </p>

          {/* Fitur */}
          <div>
            <p className="text-[11px] text-[#94a3b8] mb-1">Pola/fitur yang ditimbang ({data.n_features}):</p>
            <div className="flex flex-wrap gap-1.5">
              {FITUR.map((f) => (
                <span key={f} className="text-[11px] bg-[#E0F2F1] text-[#00695C] rounded px-2 py-0.5">{f}</span>
              ))}
            </div>
          </div>

          {/* Penjelasan kondisi */}
          <div className={`rounded-lg p-3 text-xs ${usesMl ? (isHybrid ? "bg-sky-50 text-sky-800 border border-sky-200" : "bg-emerald-50 text-emerald-800 border border-emerald-200") : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
            {isXgb ? (
              <>✅ <b>Mesin SEDANG belajar pola lintas penyulang &amp; ULP.</b> Kombinasi jam kejadian + arus IR/IS/IT/IN + cuaca dipakai untuk menebak jenis penyebab — meski beda penyulang/ULP.</>
            ) : isHybrid ? (
              <>✅ <b>Mode Hybrid.</b> Untuk kejadian &quot;T&quot; yang modelnya <b>yakin (≥{confPct}%)</b>, tebakan memakai <b>pola arus + waktu + cuaca lintas penyulang</b> (machine learning). Yang model masih ragu → pakai <b>baseline aman</b> (cuaca + penyebab tersering penyulang/ULP). Jadi pola tetap dipelajari tanpa memaksakan tebakan ragu.</>
            ) : (
              <>⚠️ <b>Mesin BELUM belajar pola fitur</b> (nilai rapor di bawah ambang). Untuk menebak &quot;T&quot;, saat ini dipakai cara sederhana: <b>aturan cuaca buruk</b> + <b>penyebab tersering di penyulang itu (lalu ULP)</b>. Pola jam &amp; arus <u>belum</u> dipakai.</>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
