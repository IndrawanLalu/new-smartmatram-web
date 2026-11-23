"use client";

import { LABEL_LATAR_SURVEY, type LatarSurvey } from "@/lib/surveyJaringan";

/** Latar gambar survey PDF — peta ikut berganti, jadi yang dicetak = yang dilihat saat menggambar. */
export default function PilihLatarSurvey({ nilai, mati, onUbah }: { nilai: LatarSurvey; mati: boolean; onUbah: (l: LatarSurvey) => void }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-400 shrink-0">Latar gambar</span>
      {(Object.keys(LABEL_LATAR_SURVEY) as LatarSurvey[]).map((l) => (
        <button
          key={l} disabled={mati} onClick={() => onUbah(l)}
          className={`flex-1 rounded-lg border px-2 py-1 font-semibold disabled:opacity-40 ${
            nilai === l ? "bg-white/15 border-white/40 text-white" : "border-white/15 text-gray-300 hover:bg-white/5"
          }`}
        >
          {LABEL_LATAR_SURVEY[l]}
        </button>
      ))}
    </div>
  );
}
