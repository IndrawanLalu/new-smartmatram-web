"use client";

import { TriangleAlert, X } from "lucide-react";
import type { HasilSimulasi } from "../_hooks/useSimulasiBuka";
import { JUDUL_BAGIAN } from "../_ui";

/** Ringkasan simulasi buka alat hubung, di panel kanan peta. */
export default function RingkasSimulasi({ h, onTutup }: { h: HasilSimulasi; onTutup: () => void }) {
  const kosong = h.jumlah_tiang === 0;
  return (
    <div className="rounded-lg border border-orange-400/70 p-3 space-y-3">
      <div className="flex items-start gap-2">
        <p className="flex-1 text-xs text-[#e2e8f0]">
          Kalau <b>{h.alat.kode}</b> ({h.alat.penanda}) dibuka:
        </p>
        <button onClick={onTutup} className="text-gray-400 hover:text-white" aria-label="Tutup simulasi">
          <X size={14} />
        </button>
      </div>

      {kosong ? (
        <p className="text-xs text-gray-400">Tidak ada tiang di hilir alat ini — pohon jaringannya belum tercatat sampai sini.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { n: h.jumlah_tiang.toLocaleString("id-ID"), l: "tiang" },
              { n: h.panjang_km.toFixed(2).replace(".", ","), l: "km" },
              { n: h.gardu.length.toString(), l: "gardu" },
            ].map((x) => (
              <div key={x.l} className="rounded-md bg-orange-500/10 py-1.5">
                <p className="text-base font-bold text-orange-300 tabular-nums">{x.n}</p>
                <p className="text-[10px] text-gray-400">{x.l}</p>
              </div>
            ))}
          </div>
          {h.gardu.length > 0 && (
            <p className="text-xs text-[#e2e8f0]">
              Total <b>{h.total_kva.toLocaleString("id-ID")} kVA</b> terpasang
              {h.total_beban_kva > 0 ? <> · beban terakhir <b>{h.total_beban_kva.toLocaleString("id-ID")} kVA</b></> : null}
            </p>
          )}

          {h.gardu.length > 0 && (
            <div>
              <p className={JUDUL_BAGIAN}>Gardu padam</p>
              <ul className="mt-1 space-y-0.5 max-h-40 overflow-y-auto">
                {h.gardu.map((g) => (
                  <li key={g.kode} className="text-xs text-[#e2e8f0] flex justify-between gap-2">
                    <span className="truncate">{g.kode} {g.nama ? <span className="text-gray-500">· {g.nama}</span> : null}</span>
                    <span className="tabular-nums text-gray-400 shrink-0">
                      {g.daya ?? "—"} kVA{g.persen_beban !== null ? ` · ${Math.round(g.persen_beban)}%` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {h.alat_hilir.length > 0 && (
            <div>
              <p className={JUDUL_BAGIAN}>Alat hubung ikut mati</p>
              <p className="text-xs text-[#e2e8f0] mt-1">{h.alat_hilir.map((x) => `${x.kode} (${x.penanda})`).join(" · ")}</p>
            </div>
          )}

          {h.gardu_tanpa_pasangan.length > 0 && (
            <p className="text-[11px] text-amber-300 flex gap-1.5">
              <TriangleAlert size={13} className="shrink-0 mt-0.5" />
              Tiang berpenanda gardu tanpa gardu dalam 100 m: {h.gardu_tanpa_pasangan.join(", ")} — periksa titik gardu atau penandanya.
            </p>
          )}
        </>
      )}
      <p className="text-[10px] text-gray-500">
        Mengikuti pohon tiang penyulang pemilik batang. Gardu dihitung lewat tiang berpenanda gardu di hilir.
      </p>
    </div>
  );
}
