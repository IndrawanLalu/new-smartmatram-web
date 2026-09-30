"use client";

import { WARNA_KESEHATAN, type KesehatanGardu } from "../_hooks/useKesehatanPeta";
import { JUDUL_BAGIAN } from "../_ui";

/**
 * Rincian kesehatan satu gardu di panel kanan — per jurusan: arus R/S/T/N,
 * tegangan pangkal & ujung, jatuh tegangan, dan jarak titik ukur dari ujung
 * terjauh. Angka yang melewati ambang diberi warna.
 */
const merahBila = (b: boolean) => (b ? "text-red-400 font-semibold" : "text-[#e2e8f0]");
const v = (x: number | null | undefined) => (x === null || x === undefined ? "—" : String(Math.round(x)));

export default function RincianKesehatan({ k }: { k: KesehatanGardu }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: WARNA_KESEHATAN[k.status] }} />
        <p className={JUDUL_BAGIAN}>Kesehatan · ukur {k.tanggal_pengukuran}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { n: k.persen_beban === null ? "—" : `${Math.round(k.persen_beban)}%`, l: "beban", buruk: k.beban_lebih },
          { n: k.jatuh_maks_pct === null ? "—" : `${k.jatuh_maks_pct}%`, l: "jatuh maks", buruk: k.jatuh_lebih },
          { n: k.unbalance_pct === null ? "—" : `${k.unbalance_pct}%`, l: "unbalance", buruk: (k.unbalance_pct ?? 0) >= 20 },
        ].map((x) => (
          <div key={x.l} className="rounded-md bg-white/5 py-1.5">
            <p className={`text-sm tabular-nums ${merahBila(x.buruk)}`}>{x.n}</p>
            <p className="text-[10px] text-gray-500">{x.l}</p>
          </div>
        ))}
      </div>

      {k.calon_sisip && (
        <p className="text-xs text-orange-300">
          Calon gardu sisip — beban di atas 80 % dan jatuh tegangan di atas 10 %.
        </p>
      )}

      {k.jurusan.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] tabular-nums">
            <thead>
              <tr className="text-gray-500 text-left">
                <th className="pr-2 font-medium">Jur</th>
                <th className="pr-2 font-medium">Arus R/S/T (A)</th>
                <th className="pr-2 font-medium">Ujung (V)</th>
                <th className="font-medium">Jatuh</th>
              </tr>
            </thead>
            <tbody>
              {k.jurusan.map((j) => (
                <tr key={j.jurusan} className="border-t border-[#1e3552] align-top">
                  <td className="pr-2 py-1 text-[#e2e8f0] font-semibold">{j.jurusan}</td>
                  <td className={`pr-2 py-1 ${merahBila(j.arus_maks > 160)}`}>
                    {v(j.arus.R)}/{v(j.arus.S)}/{v(j.arus.T)}
                  </td>
                  <td className="pr-2 py-1">
                    <span className={merahBila(Math.min(j.ujung.R ?? 999, j.ujung.S ?? 999, j.ujung.T ?? 999) < 198)}>
                      {v(j.ujung.R)}/{v(j.ujung.S)}/{v(j.ujung.T)}
                    </span>
                    {j.sumber_ujung && (
                      <span className="block text-[10px] text-gray-500">
                        {j.sumber_ujung}
                        {j.jarak_dari_ujung_m !== null ? ` · ${j.jarak_dari_ujung_m} m dari ujung` : ""}
                      </span>
                    )}
                  </td>
                  <td className={`py-1 ${merahBila((j.jatuh_pct ?? 0) > 10)}`}>{j.jatuh_pct === null ? "—" : `${j.jatuh_pct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-gray-500 mt-1">
            Pangkal {v(k.jurusan[0]?.pangkal.R)}/{v(k.jurusan[0]?.pangkal.S)}/{v(k.jurusan[0]?.pangkal.T)} V (tegangan di gardu).
          </p>
        </div>
      )}
    </div>
  );
}
