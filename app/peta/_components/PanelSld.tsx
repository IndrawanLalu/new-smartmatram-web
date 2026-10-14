"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { hitungBeban, type GarduInfo, type GrafSld } from "@/lib/sld";
import type { RingkasPenyulang } from "../_hooks/useSld";
import type { Penanda } from "../_hooks/usePenandaJtm";
import { angka } from "../_lib/angka";
import { warnaDari } from "../_lib/warnaSld";
import { GARIS, JUDUL_BAGIAN, PANEL } from "../_ui";

/**
 * Panel kanan Mode SLD: satu kartu per penyulang yang menyala — angka dari
 * jaringan yang SUDAH dititik, angka Master Gardu di sebelahnya supaya
 * selisihnya kelihatan, dan peringatan data (pangkal lebih dari satu, kode
 * gardu ganda/kosong, gardu Master yang belum ada di jaringan).
 */

interface Props {
  graf: GrafSld[];
  /** Penyulang menyala yang SLD-nya masih ditarik. */
  memuat: string[];
  ringkas: Map<string, RingkasPenyulang>;
  warna: Map<string, string>;
  gardu: Map<string, GarduInfo>;
  penanda: Map<string, Penanda>;
}

export default function PanelSld({ graf, memuat, ringkas, warna, gardu, penanda }: Props) {
  if (graf.length === 0 && memuat.length === 0) return null;
  return (
    <aside
      className="absolute z-[1050] top-14 right-3 w-[330px] max-w-[calc(100%-1.5rem)] max-h-[calc(100%-6rem)] overflow-y-auto rounded-xl border shadow-2xl p-3 space-y-3 text-[#e2e8f0]"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      {memuat.map((p) => (
        <p key={p} className="text-xs text-gray-400 flex items-center gap-2">
          <Loader2 size={12} className="animate-spin" /> Menyusun SLD {p}…
        </p>
      ))}
      {graf.map((g) => (
        <KartuSld key={g.penyulang} graf={g} ringkas={ringkas.get(g.penyulang.toUpperCase())}
          warna={warnaDari(warna, g.penyulang)} gardu={gardu} penanda={penanda} />
      ))}
    </aside>
  );
}

function KartuSld({ graf, ringkas, warna, gardu, penanda }: {
  graf: GrafSld;
  ringkas: RingkasPenyulang | undefined;
  warna: string;
  gardu: Map<string, GarduInfo>;
  penanda: Map<string, Penanda>;
}) {
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
    <div className="rounded-lg border p-3 space-y-2.5" style={{ borderColor: GARIS }}>
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: warna }} />
        <p className="font-semibold text-sm flex-1 truncate">{graf.penyulang}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
        <span className="text-gray-400">KMS jaringan</span><span className="font-medium">{angka(graf.km, 2)} kms</span>
        <span className="text-gray-400">Tiang</span><span>{angka(graf.jumlahTiang)}</span>
        <span className="text-gray-400">Gardu di jaringan</span>
        <span>{kodeGardu.length + tanpaKode}{ringkas ? ` dari ${ringkas.gardu} di Master` : ""}</span>
        <span className="text-gray-400">kVA · beban</span>
        <span>{angka(b.kva)} · {angka(b.beban)} kVA ({b.diukur} diukur)</span>
        {ringkas && ringkas.gangguan > 0 && (
          <>
            <span className="text-gray-400">Gangguan</span><span>{ringkas.gangguan} dalam 12 bulan</span>
          </>
        )}
      </div>
      {keypoint.size > 0 && (
        <div>
          <p className={JUDUL_BAGIAN}>Keypoint</p>
          <p className="text-xs text-gray-300 mt-0.5">
            {[...keypoint].map(([k, n]) => `${n} ${penanda.get(k)?.label ?? k}`).join(" · ")}
          </p>
        </div>
      )}
      {peringatan.length > 0 && (
        <ul className="space-y-1">
          {peringatan.map((p) => (
            <li key={p} className="text-[11px] text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1.5 flex gap-1.5">
              <TriangleAlert size={12} className="shrink-0 mt-0.5" /> {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
