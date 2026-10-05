"use client";

import { TriangleAlert, Zap } from "lucide-react";
import { EYEBROW } from "@/app/admin/_ui";
import { hitungBeban, type GarduInfo, type GrafSld } from "@/lib/sld";
import type { Penanda } from "@/app/peta/_hooks/usePenandaJtm";
import type { RingkasPenyulang } from "../_hooks/usePetaSld";
import { angka } from "./DaftarPenyulang";

/**
 * Ringkasan SLD satu penyulang yang sedang menyala + peringatan data. Angka
 * di sini dari jaringan yang SUDAH dititik; angka Master Gardu di sebelahnya
 * supaya selisihnya kelihatan.
 */

interface Props {
  graf: GrafSld;
  ringkas: RingkasPenyulang | undefined;
  warna: string;
  gardu: Map<string, GarduInfo>;
  penanda: Map<string, Penanda>;
  onLepasPangkal: () => void;
}

export default function RingkasSldPanel({ graf, ringkas, warna, gardu, penanda, onLepasPangkal }: Props) {
  const simpul = [...graf.simpul.values()];
  const kodeGardu = [...new Set(simpul.map((s) => s.gardu).filter((k): k is string => !!k))];
  const tanpaKode = simpul.filter((s) => s.jenis === "gardu" && !s.gardu).length;
  const b = hitungBeban(kodeGardu, gardu);
  const keypoint = new Map<string, number>();
  for (const s of simpul) if (s.jenis === "keypoint" && s.penanda) keypoint.set(s.penanda, (keypoint.get(s.penanda) ?? 0) + 1);
  const belumDiJaringan = ringkas ? ringkas.gardu - kodeGardu.length : 0;

  const peringatan = [
    graf.akar.length > 1 && `${graf.akar.length} pangkal — ada bagian jaringan yang belum tersambung ke pangkal utama.`,
    graf.garduGanda.length > 0 && `Kode gardu ganda di dua tiang: ${graf.garduGanda.join(", ")}.`,
    tanpaKode > 0 && `${tanpaKode} tiang gardu belum diberi kode gardu.`,
    belumDiJaringan > 0 && `${belumDiJaringan} gardu Master penyulang ini belum ada di jaringan (belum dititik atau kode belum diisi).`,
  ].filter((x): x is string => !!x);

  return (
    <div className="rounded-xl border border-line p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: warna }} />
        <p className="font-semibold text-ink flex-1 truncate">{graf.penyulang}</p>
        <button onClick={onLepasPangkal} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-red-200 text-red-700 hover:bg-red-50">
          <Zap size={12} /> Lepas pangkal
        </button>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
        <span className="text-ink-muted">KMS jaringan</span><span className="text-ink font-medium">{angka(graf.km, 2)} kms</span>
        <span className="text-ink-muted">Tiang</span><span className="text-ink">{angka(graf.jumlahTiang)}</span>
        <span className="text-ink-muted">Gardu di jaringan</span>
        <span className="text-ink">{kodeGardu.length + tanpaKode}{ringkas ? ` dari ${ringkas.gardu} di Master` : ""}</span>
        <span className="text-ink-muted">kVA · beban</span>
        <span className="text-ink">{angka(b.kva)} · {angka(b.beban)} kVA ({b.diukur} diukur)</span>
      </div>
      {keypoint.size > 0 && (
        <div>
          <p className={EYEBROW}>Keypoint</p>
          <p className="text-xs text-ink-soft mt-0.5">
            {[...keypoint].map(([k, n]) => `${n} ${penanda.get(k)?.label ?? k}`).join(" · ")}
          </p>
        </div>
      )}
      {peringatan.length > 0 && (
        <ul className="space-y-1">
          {peringatan.map((p) => (
            <li key={p} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5 flex gap-1.5">
              <TriangleAlert size={12} className="shrink-0 mt-0.5" /> {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
