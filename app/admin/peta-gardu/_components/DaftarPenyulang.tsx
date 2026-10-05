"use client";

import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { FIELD } from "@/app/admin/_ui";
import type { RingkasPenyulang } from "../_hooks/usePetaSld";

/**
 * Daftar penyulang + kartunya. Yang sudah punya data tiang bisa dinyalakan di
 * peta; yang belum tetap tampil dengan angka Master Gardu dan segmennya,
 * supaya kelihatan berapa yang masih menunggu dititik.
 */

interface Props {
  ringkas: RingkasPenyulang[];
  memuatDaftar: boolean;
  dipilih: Set<string>;
  memuat: Set<string>;
  warna: Map<string, string>;
  onAlih: (penyulang: string) => void;
}

export const angka = (n: number, d = 0) => n.toLocaleString("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d });

export default function DaftarPenyulang({ ringkas, memuatDaftar, dipilih, memuat, warna, onAlih }: Props) {
  const [cari, setCari] = useState("");
  const tampil = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return ringkas
      .filter((r) => !q || r.penyulang.toUpperCase().includes(q))
      // Yang sudah dititik di atas: hanya mereka yang bisa digambar.
      .sort((a, b) => Number(b.tiang > 0) - Number(a.tiang > 0) || a.penyulang.localeCompare(b.penyulang));
  }, [ringkas, cari]);
  const bertiang = ringkas.filter((r) => r.tiang > 0).length;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-3 border-b border-line space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input value={cari} onChange={(e) => setCari(e.target.value)} placeholder="Cari penyulang" className={`${FIELD} pl-8 w-full`} />
        </div>
        <p className="text-[11px] text-ink-muted">
          {bertiang} dari {ringkas.length} penyulang sudah punya data tiang — hanya itu yang bisa digambar.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {memuatDaftar && (
          <p className="p-4 text-sm text-ink-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Memuat…</p>
        )}
        {tampil.map((r) => {
          const nyala = dipilih.has(r.penyulang);
          const bisa = r.tiang > 0;
          const km = r.kmTiang ?? r.kmSegmen;
          return (
            <button
              key={r.penyulang}
              onClick={() => bisa && onAlih(r.penyulang)}
              disabled={!bisa}
              title={bisa ? undefined : "Belum ada tiang JTM yang dititik — SLD belum bisa digambar"}
              className={`w-full text-left px-3 py-2.5 border-b border-line flex gap-2.5 ${
                nyala ? "bg-navy-50" : "hover:bg-surface"
              } ${bisa ? "" : "opacity-60 cursor-not-allowed"}`}
            >
              <span
                className="mt-1 w-3 h-3 rounded-sm border shrink-0"
                style={{ background: nyala ? warna.get(r.penyulang) : "transparent", borderColor: warna.get(r.penyulang) ?? "#94A3B8" }}
              />
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm text-ink truncate">{r.penyulang}</span>
                  {memuat.has(r.penyulang) && <Loader2 size={12} className="animate-spin text-ink-muted" />}
                  <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${
                    bisa ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {bisa ? "SLD dari tiang" : "belum dititik"}
                  </span>
                </span>
                <span className="block text-[11px] text-ink-soft mt-0.5 tabular-nums">
                  {km !== null ? `${angka(km, 2)} kms` : "kms —"} · {r.gardu} gardu · {angka(r.garduKva)} kVA
                </span>
                <span className="block text-[11px] text-ink-muted tabular-nums">
                  beban {angka(r.bebanKva)} kVA ({r.garduDiukur}/{r.gardu} diukur)
                  {r.garduOverload > 0 && <span className="text-red-600"> · {r.garduOverload} ≥80%</span>}
                  {r.gangguan > 0 && <span> · {r.gangguan} gangguan/12 bln</span>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
