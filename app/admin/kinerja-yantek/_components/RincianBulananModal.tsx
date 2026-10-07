"use client";

import ModalShell from "@/app/admin/_components/ModalShell";
import { angkaId, tanggalPanjang, type MetaJenis } from "../_lib/realisasiHarian";
import { nilaiSetuju, nilaiUtama, rataId, type SelBulanan } from "../_lib/realisasiBulanan";

/** Rincian per tanggal satu jenis pekerjaan di satu ULP, sebulan. */

const TH = "px-3 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2 border-b border-line text-xs";

interface Props {
  meta: MetaJenis;
  ulp: string;
  periode: string;
  sel: SelBulanan;
  onTutup: () => void;
}

export default function RincianBulananModal({ meta, ulp, periode, sel, onTutup }: Props) {
  const d = meta.desimal;
  const tambahan = sel.luar > 0 || sel.ujung > 0;
  const subjudul =
    `${ulp} · ${periode} · ${angkaId(sel.total, d)} ${meta.satuan} dalam ${sel.hari} hari · Ø ${rataId(sel.rata, d)} ${meta.satuan}/hari`;

  return (
    <ModalShell title={meta.jenis} subtitle={subjudul} maxWidth="max-w-2xl" onClose={onTutup}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse">
          <thead className="bg-surface">
            <tr>
              <th className={TH}>Tanggal</th>
              <th className={`${TH} text-right`}>Realisasi</th>
              <th className={`${TH} text-right`}>Sudah disetujui</th>
              <th className={`${TH} text-right`}>Belum disetujui</th>
              {tambahan && <th className={TH}>Tambahan</th>}
            </tr>
          </thead>
          <tbody>
            {sel.harian.map((b) => {
              const n = nilaiUtama(b, d);
              const s = nilaiSetuju(b, d);
              return (
                <tr key={b.tgl}>
                  <td className={`${TD} text-ink whitespace-nowrap`}>{tanggalPanjang(b.tgl)}</td>
                  <td className={`${TD} text-right font-semibold text-ink`}>
                    {b.cacah ? angkaId(n, d) : "—"}
                    {d && b.cacah > 0 && <span className="font-normal text-ink-muted"> ({b.cacah})</span>}
                  </td>
                  <td className={`${TD} text-right text-emerald-700`}>{b.cacah ? angkaId(s, d) : "—"}</td>
                  <td className={`${TD} text-right ${n - s > 0 ? "text-amber-700 font-semibold" : ""}`}>
                    {b.cacah ? angkaId(n - s, d) : "—"}
                  </td>
                  {tambahan && (
                    <td className={`${TD} text-ink-soft`}>
                      {[b.luar ? `${b.luar} di luar WO` : null, b.ujung ? `${b.ujung} tegangan ujung` : null]
                        .filter(Boolean).join(" · ") || "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {tambahan && (
        <p className="mt-2 text-[11px] text-ink-muted">
          Di luar WO dan tegangan ujung tidak masuk angka realisasi maupun hitungan hari.
        </p>
      )}
    </ModalShell>
  );
}
