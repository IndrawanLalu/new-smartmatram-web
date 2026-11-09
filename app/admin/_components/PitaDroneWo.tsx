"use client";

import { Plane } from "lucide-react";

/**
 * Pita rencana Tier 1 + drone (jtm-drone-segmen.sql, 9 Nov 2026): KMS drone
 * dibanding SLA Tier 1 bulan itu, supaya admin tidak menghitung manual saat
 * memilih segmen. Tanpa SLA → dibanding total WO Tier 1 (keputusan user P2).
 * `tambahKm` = segmen yang sedang dicentang (pratinjau sebelum disimpan).
 */

export interface BarisPitaDrone {
  ulp: string;
  sla: number | null;
  droneKm: number;
  biasaKm: number;
  /** Target drone % (Pengaturan JTM, bawaan 20). */
  target: number;
  /** + jadi drone / − kembali biasa, dari centang yang belum disimpan. */
  tambahKm: number;
}

interface Props {
  bulan: string;
  baris: BarisPitaDrone[];
}

const km = (v: number) => v.toFixed(2).replace(".", ",");
const persen = (v: number) => `${v.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

export default function PitaDroneWo({ bulan, baris }: Props) {
  if (baris.length === 0) return null;
  return (
    <div className="mt-3 space-y-1.5 rounded-xl border border-navy-200 bg-navy-50/40 px-4 py-2.5 text-xs">
      <p className="flex items-center gap-1.5 font-semibold text-ink">
        <Plane size={13} /> Rencana Tier 1 + drone · {bulan}
      </p>
      {baris.map((b) => {
        const drone = b.droneKm + b.tambahKm;
        const biasa = b.biasaKm - b.tambahKm;
        const dasar = b.sla ?? b.droneKm + b.biasaKm;
        const p = dasar > 0 ? (drone / dasar) * 100 : 0;
        const pBiasa = dasar > 0 ? (biasa / dasar) * 100 : 0;
        const kurang = p < b.target;
        return (
          <p key={b.ulp} className="text-ink-soft">
            <b className="text-ink">{b.ulp}</b>
            {" · "}
            {b.sla === null ? <>WO Tier 1 {km(dasar)} km (belum ada SLA)</> : <>SLA Tier 1 {km(b.sla)} km</>}
            {" · drone "}
            <b className={kurang ? "text-amber-700" : "text-emerald-700"}>
              {km(drone)} km ({persen(p)})
            </b>
            {` dari target ${persen(b.target)}`}
            {" · Tier 1 biasa "}{km(biasa)} km ({persen(pBiasa)})
            {b.tambahKm !== 0 && (
              <span className="ml-1 text-navy-700">
                — termasuk {b.tambahKm > 0 ? "+" : "−"}{km(Math.abs(b.tambahKm))} km yang dicentang
              </span>
            )}
          </p>
        );
      })}
    </div>
  );
}
