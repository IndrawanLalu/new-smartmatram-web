"use client";

import { CARD } from "@/app/admin/_ui";
import { angkaId, ringkasan, type KelompokHarian } from "../_lib/realisasiHarian";

/** Realisasi satu tanggal untuk SATU ULP — per jenis, dengan status persetujuan. */

const TH = "px-4 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-4 py-2.5 border-b border-line align-top";

interface Props {
  kelompok: KelompokHarian[];
  onKlik: (k: KelompokHarian) => void;
}

export default function TabelHarian({ kelompok, onKlik }: Props) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface">
            <tr>
              <th className={TH}>Jenis pekerjaan</th>
              <th className={`${TH} text-right`}>Realisasi</th>
              <th className={`${TH} text-right`}>Sudah disetujui</th>
              <th className={`${TH} text-right`}>Belum disetujui</th>
              <th className={TH}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {kelompok.map((k) => {
              const kosong = k.item.length === 0;
              const d = k.meta.desimal;
              return (
                <tr
                  key={k.meta.kunci}
                  onClick={kosong ? undefined : () => onKlik(k)}
                  className={kosong ? "text-ink-muted" : "cursor-pointer hover:bg-navy-50/60 transition-colors"}
                >
                  <td className={`${TD} font-medium ${kosong ? "" : "text-ink"}`}>{k.meta.jenis}</td>
                  <td className={`${TD} text-right whitespace-nowrap`}>
                    {kosong ? "—" : <><b>{angkaId(k.total, d)}</b> <span className="text-xs text-ink-soft">{k.meta.satuan}</span></>}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap ${k.setuju ? "text-emerald-700 font-semibold" : ""}`}>
                    {kosong ? "—" : angkaId(k.setuju, d)}
                  </td>
                  <td className={`${TD} text-right whitespace-nowrap ${k.belum ? "text-amber-700 font-semibold" : ""}`}>
                    {kosong ? "—" : angkaId(k.belum, d)}
                  </td>
                  <td className={`${TD} text-xs text-ink-soft`}>
                    {kosong ? "Nihil" : [
                      d && k.cacah ? `${k.cacah} ${k.meta.kunci === "jtr" ? "gardu" : "segmen"}` : null,
                      ...ringkasan(k).tambahan,
                    ].filter(Boolean).join(" · ") || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
