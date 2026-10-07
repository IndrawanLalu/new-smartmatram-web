"use client";

import ModalShell from "@/app/admin/_components/ModalShell";
import { angkaId, ringkasan, tanggalPanjang, type KelompokHarian } from "../_lib/realisasiHarian";

/** Rincian satu jenis pekerjaan pada satu tanggal — objek, petugas, jam, status. */

const TH = "px-3 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2 border-b border-line align-top text-xs";

const LABEL_BAGIAN: Record<string, string> = { luar: "Di luar WO", ujung: "Tegangan ujung" };

interface Props {
  k: KelompokHarian;
  /** ULP sel yang diklik di tabel per ULP; null = tanpa keterangan ULP. */
  ulp?: string | null;
  tgl: string;
  onTutup: () => void;
}

export default function RincianHarianModal({ k, ulp, tgl, onTutup }: Props) {
  const adaKm = k.item.some((x) => x.km !== null);
  const semuaUlp = new Set(k.item.map((x) => x.ulp)).size > 1;

  return (
    <ModalShell title={ulp ? `${k.meta.jenis} · ${ulp}` : k.meta.jenis} subtitle={`${tanggalPanjang(tgl)} · ${ringkasan(k).utama}`} maxWidth="max-w-4xl" onClose={onTutup}>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full border-collapse">
          <thead className="bg-surface">
            <tr>
              <th className={TH}>Jam</th>
              {semuaUlp && <th className={TH}>ULP</th>}
              <th className={TH}>Objek</th>
              <th className={TH}>Rincian</th>
              {adaKm && <th className={`${TH} text-right`}>KMS</th>}
              <th className={TH}>Petugas</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {k.item.map((x, i) => (
              <tr key={i}>
                <td className={`${TD} text-ink-soft whitespace-nowrap`}>{x.waktu ?? "—"}</td>
                {semuaUlp && <td className={`${TD} text-ink-soft`}>{x.ulp}</td>}
                <td className={`${TD} font-semibold text-ink`}>
                  {x.objek}
                  {x.bagian && <span className="block text-[10px] font-medium text-ink-muted">{LABEL_BAGIAN[x.bagian] ?? x.bagian}</span>}
                </td>
                <td className={`${TD} text-ink-soft max-w-72`}>{x.rincian ?? "—"}</td>
                {adaKm && <td className={`${TD} text-right whitespace-nowrap`}>{x.km === null ? "—" : angkaId(x.km, true)}</td>}
                <td className={`${TD} text-ink-soft`}>{x.petugas ?? "—"}</td>
                <td className={TD}>
                  <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${
                    x.disetujui ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}>
                    {x.disetujui ? "Sudah disetujui" : "Belum disetujui"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ModalShell>
  );
}
