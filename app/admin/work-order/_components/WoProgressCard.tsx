"use client";

import { useState } from "react";
import { formatNumberId } from "../_constants";
import { CARD, DISPLAY, EYEBROW } from "@/app/admin/_ui";
import type { WoStats } from "../_lib/woStats";

interface WoProgressCardProps {
  stats: WoStats;
  /** Teks kecil di atas angka utama, mis. "Juli 2026 · 4 WO". */
  caption: string;
}

/**
 * Angka utama dashboard: persentase realisasi + meter.
 * Bila WO memakai kolom ukuran, basis bisa ditukar antara jumlah baris dan volume.
 */
export default function WoProgressCard({ stats, caption }: WoProgressCardProps) {
  const [basis, setBasis] = useState<string>(stats.units[0] ?? "count");
  const unit = basis !== "count" && stats.units.includes(basis) ? basis : null;
  const vol = unit ? stats.volByUnit.get(unit) : undefined;

  const done = vol ? vol.selesai : stats.selesai;
  const total = vol ? vol.total : stats.total;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const fmt = vol ? formatNumberId : (n: number) => n.toLocaleString("id-ID");
  const suffix = unit ? ` ${unit}` : "";

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ink-soft">{caption}</p>
          <p className={`${EYEBROW} mt-2`}>
            Realisasi {unit ? `volume (${unit})` : "jumlah WO"}
          </p>
          <p className={`${DISPLAY} text-5xl font-extrabold leading-none mt-1 text-ink`}>
            {pct}
            <span className="text-2xl font-semibold text-ink-soft">%</span>
          </p>
        </div>

        {stats.units.length > 0 && (
          <div className="flex gap-0.5 bg-surface rounded-lg p-0.5 text-xs shrink-0">
            {["count", ...stats.units].map((key) => (
              <button
                key={key}
                onClick={() => setBasis(key)}
                className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                  basis === key ? "bg-white text-navy-600 shadow-sm" : "text-ink-soft hover:text-ink"
                }`}
              >
                {key === "count" ? "Jumlah" : key}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Meter — track satu langkah lebih terang dari isian, ramp yang sama */}
      <div className="mt-4 h-2.5 rounded-full bg-navy-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-navy-600 transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2.5 flex items-center justify-between text-[13px]">
        <span className="text-ink-soft">
          Selesai{" "}
          <b className="text-ink tabular-nums">{fmt(done)}{suffix}</b>
        </span>
        <span className="text-ink-soft">
          Sisa{" "}
          <b className="text-ink tabular-nums">{fmt(Math.max(0, total - done))}{suffix}</b>
        </span>
        <span className="text-ink-soft">
          Total{" "}
          <b className="text-ink tabular-nums">{fmt(total)}{suffix}</b>
        </span>
      </div>
    </div>
  );
}
