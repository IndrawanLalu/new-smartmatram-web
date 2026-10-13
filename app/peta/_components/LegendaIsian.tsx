"use client";

import type { useIsianPeta } from "../_hooks/useIsianPeta";
import { GARIS, PANEL } from "../_ui";

/** Legenda warna isian JTM yang ditulis di tiang (kiri bawah, di atas bilah keadaan). */
export default function LegendaIsian({ nama, legenda }: { nama: string; legenda: ReturnType<typeof useIsianPeta>["legenda"] }) {
  if (legenda.length === 0) return null;
  return (
    <div
      className="absolute z-[1000] left-3 bottom-8 rounded-lg border px-3 py-2 text-[11px] text-[#e2e8f0] space-y-1 shadow-lg"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <p className="font-semibold">{nama} · tiang di layar</p>
      {legenda.map((l) => (
        <p key={l.kode} className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: l.warna }} />
          <span className="flex-1">{l.label}</span>
          <span className="tabular-nums text-gray-400">{l.jumlah}</span>
        </p>
      ))}
    </div>
  );
}
