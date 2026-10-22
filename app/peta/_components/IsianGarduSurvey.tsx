"use client";

import { RotateCcw, RotateCw } from "lucide-react";
import { LABEL_JENIS_GARDU, type JenisGardu, type TitikSurvey } from "@/lib/surveyJaringan";
import { BIDANG, GARIS } from "../_ui";
import { Pilih, SEL } from "./SuntingTitikSurvey";

/** Isian gardu baru di satu tiang survey: portal/cantol, arah gambar, kVA, nama. */

interface Props {
  t: TitikSurvey;
  mati: boolean;
  u: (patch: Partial<TitikSurvey>) => void;
}

export default function IsianGarduSurvey({ t, mati, u }: Props) {
  const putar = (d: number) => u({ gardu_arah: (((t.gardu_arah + d) % 360) + 360) % 360 });
  return (
    <>
      <Pilih
        label="Jenis gardu" nilai={t.gardu_jenis} kosong="— pilih portal / cantol —" mati={mati}
        opsi={(Object.keys(LABEL_JENIS_GARDU) as JenisGardu[]).map((k) => ({ kode: k, label: LABEL_JENIS_GARDU[k] }))}
        onUbah={(v) => u({ gardu_jenis: v as JenisGardu | null })}
      />
      <div className="space-y-0.5">
        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Arah gambar gardu · {t.gardu_arah}°</span>
        <div className="flex items-center gap-1.5">
          <button disabled={mati} onClick={() => putar(-15)} className="p-1 rounded border border-white/15 hover:bg-white/5 disabled:opacity-40" title="Putar 15° berlawanan jarum jam">
            <RotateCcw size={13} />
          </button>
          <input
            type="range" min={0} max={359} step={5} value={t.gardu_arah} disabled={mati}
            onChange={(e) => u({ gardu_arah: Number(e.target.value) })}
            className="flex-1 accent-[#F97316]"
          />
          <button disabled={mati} onClick={() => putar(15)} className="p-1 rounded border border-white/15 hover:bg-white/5 disabled:opacity-40" title="Putar 15° searah jarum jam">
            <RotateCw size={13} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-[5rem_1fr] gap-1.5">
        <input
          type="number" min={0} placeholder="kVA" value={t.gardu_kva ?? ""} disabled={mati}
          onChange={(e) => u({ gardu_kva: e.target.value ? Number(e.target.value) : null })}
          className={SEL} style={{ background: BIDANG, borderColor: GARIS }}
        />
        <input
          placeholder="Nama / lokasi gardu" value={t.gardu_nama ?? ""} disabled={mati}
          onChange={(e) => u({ gardu_nama: e.target.value || null })}
          className={SEL} style={{ background: BIDANG, borderColor: GARIS }}
        />
      </div>
    </>
  );
}
