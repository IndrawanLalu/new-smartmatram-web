"use client";

import Link from "next/link";
import { BrainCircuit, ArrowUpRight } from "lucide-react";
import { CARD, PANEL_HEAD } from "@/app/admin/_ui";
import { STATUS_COLOR } from "@/lib/chartColors";

export interface RisikoTeratas {
  penyulang: string;
  skor: number;
  level: "kritis" | "waspada" | "aman";
  penyebab: string | null;
}

interface RisikoPanelProps {
  tgl: string | null;
  kritis: number;
  waspada: number;
  teratas: RisikoTeratas[];
  loading: boolean;
}

export default function RisikoPanel({ tgl, kritis, waspada, teratas, loading }: RisikoPanelProps) {
  return (
    <div className={`flex flex-col h-full ${CARD}`}>
      <div className={PANEL_HEAD}>
        <BrainCircuit size={14} className="text-white/80" />
        <div className="flex flex-col leading-tight flex-1 min-w-0">
          <span className="text-white font-semibold text-xs">Prediksi Risiko Penyulang</span>
          <span className="text-white/70 text-[10px] truncate">
            {tgl ? `Model SMART untuk ${tgl}` : "Pipeline ML belum menghasilkan prediksi"}
          </span>
        </div>
        <Link
          href="/admin/command-center"
          className="shrink-0 text-white/70 hover:text-white transition-colors"
          aria-label="Buka Command Center"
        >
          <ArrowUpRight size={14} />
        </Link>
      </div>

      <div className="flex-1 p-3 min-h-[260px] flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center flex-1">
            <div className="w-5 h-5 border-2 border-line border-t-navy-600 rounded-full animate-spin" />
          </div>
        ) : teratas.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-1 text-center">
            <span className="text-[12px] text-ink-soft">Belum ada hasil prediksi</span>
            <span className="text-[10px] text-ink-muted">Pipeline ML belum berjalan untuk unit ini</span>
          </div>
        ) : (
          <>
            <div className="flex gap-2 mb-3">
              <Ringkas label="Kritis" nilai={kritis} warna={STATUS_COLOR.kritis} />
              <Ringkas label="Waspada" nilai={waspada} warna={STATUS_COLOR.waspada} />
            </div>

            <ul className="space-y-1.5 flex-1">
              {teratas.map((r) => (
                <li key={r.penyulang} className="flex items-center gap-2">
                  <span
                    className="shrink-0 h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLOR[r.level] ?? STATUS_COLOR.kosong }}
                  />
                  <span className="flex-1 min-w-0 text-[12px] text-ink truncate">{r.penyulang}</span>
                  {r.penyebab && (
                    <span className="hidden sm:block text-[10px] text-ink-muted truncate max-w-[42%]">
                      {r.penyebab}
                    </span>
                  )}
                  <span className="text-[12px] font-mono font-bold text-ink shrink-0">
                    {Math.round(r.skor)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function Ringkas({ label, nilai, warna }: { label: string; nilai: number; warna: string }) {
  return (
    <div className="flex-1 rounded-xl border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="text-lg font-bold leading-tight" style={{ color: warna }}>
        {nilai}
      </p>
    </div>
  );
}
