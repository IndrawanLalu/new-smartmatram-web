"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EYEBROW } from "@/app/admin/_ui";
import { ITEM_TIANG, jumlahItem, LABEL_ITEM, namaKabel, panjangRuas, ujungRuas } from "@/lib/rekonduktorJtr";
import type { SurveyJaringan } from "@/lib/surveyJaringan";

/** Rincian ruas Rekonduktor JTR (hanya-baca; diubah di peta selama Draf): kabel lama → pengganti, isian per tiang. */

const TH = "px-1.5 py-1 font-semibold text-accent-deep";
const TD = "px-1.5 py-1 text-center tabular-nums";

const Koordinat = ({ k }: { k: { lat: number; lng: number } }) => (
  <a href={`https://www.google.com/maps?q=${k.lat},${k.lng}`} target="_blank" rel="noopener" className="font-mono text-navy-600 hover:underline">
    {k.lat.toFixed(6)}, {k.lng.toFixed(6)}
  </a>
);

export default function RingkasRekonduktor({ s }: { s: SurveyJaringan }) {
  const [buka, setBuka] = useState<string | null>(s.ruas[0]?.id ?? null);
  return (
    <section className="space-y-2">
      <p className={EYEBROW}>Ruas yang diganti</p>
      {s.ruas.map((r, i) => {
        const terbuka = buka === r.id;
        const awal = r.tiang[0];
        const akhir = r.tiang[r.tiang.length - 1];
        return (
          <div key={r.id} className="rounded-lg border border-line">
            <button onClick={() => setBuka(terbuka ? null : r.id)} className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-navy-50/50">
              {terbuka ? <ChevronDown size={15} className="mt-0.5 shrink-0" /> : <ChevronRight size={15} className="mt-0.5 shrink-0" />}
              <span className="flex-1 min-w-0 text-sm">
                <b>Ruas {i + 1}</b>{r.jurusan ? ` · Jurusan ${r.jurusan}` : ""} · {ujungRuas(r, s.gardu_kode)}
                <span className="block text-xs text-ink-soft">
                  {r.tiang.length} tiang · {Math.round(panjangRuas(r)).toLocaleString("id-ID")} m · SR {jumlahItem(r, "sr")} · {r.kabel_lama ?? "kabel lama ?"} →{" "}
                  <b className="text-ink">{namaKabel(r) || "pengganti belum dipilih"}</b>
                </span>
              </span>
            </button>
            {terbuka && (
              <div className="px-3 pb-3 space-y-2">
                <p className="text-xs text-ink-soft">
                  Awal {r.dari_gardu ? `gardu ${s.gardu_kode ?? ""}` : (awal?.kode ?? "?")}{!r.dari_gardu && awal && <>: <Koordinat k={awal} /></>} · Akhir {akhir?.kode ?? "?"}
                  {akhir && <>: <Koordinat k={akhir} /></>}
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-navy-50">
                        <th className={`${TH} text-left`}>Tiang</th>
                        <th className={`${TH} text-right`}>Gawang (m)</th>
                        {ITEM_TIANG.map((k) => <th key={k} className={TH} title={LABEL_ITEM[k].panjang}>{LABEL_ITEM[k].pendek}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {r.tiang.map((t) => (
                        <tr key={t.tiang_id} className="border-t border-line">
                          <td className="px-1.5 py-1">{t.kode ?? "?"}</td>
                          <td className={`${TD} text-right`}>{t.panjang_m ? Math.round(t.panjang_m) : "—"}</td>
                          {ITEM_TIANG.map((k) => <td key={k} className={`${TD} ${t[k] ? "text-ink" : "text-ink-muted"}`}>{t[k]}</td>)}
                        </tr>
                      ))}
                      <tr className="border-t border-line font-semibold">
                        <td className="px-1.5 py-1">Jumlah</td>
                        <td className={`${TD} text-right`}>{Math.round(panjangRuas(r))}</td>
                        {ITEM_TIANG.map((k) => <td key={k} className={TD}>{jumlahItem(r, k)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-ink-muted">
        {ITEM_TIANG.map((k) => `${LABEL_ITEM[k].pendek} = ${LABEL_ITEM[k].panjang}`).join(" · ")}.
      </p>
    </section>
  );
}
