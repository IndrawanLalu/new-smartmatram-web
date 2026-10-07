"use client";

import type { ReactNode } from "react";
import { CARD } from "@/app/admin/_ui";
import type { MetaJenis } from "../_lib/realisasiHarian";

/**
 * Tabel perbandingan antar-ULP: baris = jenis pekerjaan (urutan Rekap Kinerja),
 * kolom = ULP (+ Total bila diminta). Isi sel ditentukan pemakainya — dipakai
 * tampilan Per hari dan Per bulan.
 */

const TH = "px-5 py-3 text-[13px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-5 py-3 border-b border-line align-top text-right";

interface Props {
  meta: MetaJenis[];
  ulps: string[];
  /** Kolom penjumlah di kanan (kunci ulp = null). */
  kolomTotal?: boolean;
  sel: (kunci: string, ulp: string | null) => ReactNode;
  /** Sel yang berisi (bisa diklik) — sel kosong tidak membuka apa pun. */
  berisi: (kunci: string, ulp: string | null) => boolean;
  sorot?: (kunci: string, ulp: string) => boolean;
  onKlik: (kunci: string, ulp: string | null) => void;
}

export default function MatriksUlp({ meta, ulps, kolomTotal, sel, berisi, sorot, onKlik }: Props) {
  const kolom: (string | null)[] = kolomTotal ? [...ulps, null] : ulps;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[15px]">
          <thead className="bg-surface">
            <tr>
              <th className={`${TH} text-left`}>Jenis pekerjaan</th>
              {kolom.map((u) => (
                <th key={u ?? "total"} className={`${TH} text-right ${u === null ? "bg-navy-50/60" : ""}`}>
                  {u ?? "Total"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {meta.map((m) => (
              <tr key={m.kunci}>
                <td className="px-5 py-3 border-b border-line align-top font-semibold text-ink whitespace-nowrap">
                  {m.jenis}
                  <span className="block text-xs font-normal text-ink-muted">{m.satuan}</span>
                </td>
                {kolom.map((u) => {
                  const ada = berisi(m.kunci, u);
                  const disorot = u !== null && sorot?.(m.kunci, u);
                  return (
                    <td
                      key={u ?? "total"}
                      onClick={ada ? () => onKlik(m.kunci, u) : undefined}
                      className={`${TD} ${u === null ? "bg-navy-50/40" : ""} ${disorot ? "bg-emerald-50" : ""} ${
                        ada ? "cursor-pointer hover:bg-navy-50 transition-colors" : "text-ink-muted"
                      }`}
                    >
                      {ada ? sel(m.kunci, u) : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
