"use client";

import { Loader2, Wrench, X } from "lucide-react";
import { LABEL_RENCANA } from "@/app/admin/pengukuran-gardu/_lib/rencanaJtr";
import type { RencanaPetaState } from "../_hooks/useRencanaPeta";
import { GARIS, PANEL } from "../_ui";
import { WARNA_PINDAH } from "./LapisanRencana";

/** Kartu rencana perbaikan JTR di kanan peta (dari Analisis JTR). */

export default function PanelRencana({ s }: { s: RencanaPetaState }) {
  if (!s.buka) return null;
  const { data, galat } = s;
  const r = data?.rencana;
  return (
    <section
      className="w-[330px] max-w-[calc(100vw-1.5rem)] rounded-xl border shadow-2xl p-3 space-y-2.5 text-[#e2e8f0] text-xs"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <header className="flex items-start gap-2">
        <Wrench size={15} className="text-[#C4B5FD] mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Rencana perbaikan</p>
          <p className="text-sm font-semibold">
            {s.buka.gardu.toUpperCase()} · jurusan {s.buka.jurusan}
          </p>
        </div>
        <button onClick={s.tutup} className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" title="Tutup">
          <X size={15} />
        </button>
      </header>

      {galat ? (
        <p className="text-[#FCA5A5]">{galat}</p>
      ) : !data ? (
        <p className="flex items-center gap-2 text-gray-400"><Loader2 size={13} className="animate-spin" /> Menghitung…</p>
      ) : !r ? (
        <p className="text-gray-300">Jurusan ini tidak perlu tindakan menurut batas yang berlaku.</p>
      ) : (
        <>
          <div>
            <p className="font-semibold text-[#C4B5FD]">{LABEL_RENCANA[r.jenis]}</p>
            <p className="text-gray-300">{r.ringkas}</p>
          </div>
          {r.rinci.length > 0 && (
            <ul className="list-disc pl-4 space-y-1 text-gray-300">
              {r.rinci.map((x) => <li key={x}>{x}</li>)}
            </ul>
          )}
          {data.pindah.length > 0 && (
            <p className="flex items-center gap-2 text-gray-400">
              <span className="inline-block w-6 h-1.5 rounded-full" style={{ background: WARNA_PINDAH }} />
              {r.jenis === "sisip" ? "beban yang pindah ke gardu sisip" : "beban yang pindah ke jurusan baru"}
            </p>
          )}
          {r.catatan.map((x) => <p key={x} className="text-[#FCD34D]">{x}</p>)}
          <p className="text-[10px] text-gray-500">Perkiraan dari tarikan SR — pastikan di lapangan.</p>
        </>
      )}
    </section>
  );
}
