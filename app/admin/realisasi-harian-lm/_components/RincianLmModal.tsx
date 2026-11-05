"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { fotoKecil } from "@/lib/fotoKecil";
import { META } from "@/app/admin/kinerja-yantek/_lib/kinerjaMeta";
import { angkaLm, barisDesimal, kunciTindakan, rincianBaris, type BarisLm, type ItemLm } from "@/app/admin/kinerja-yantek/_lib/lm4dx";
import { useLokasiRincian } from "../_hooks/useLokasiRincian";

/**
 * Daftar pekerjaan di balik satu angka Realisasi Harian LM (R4): klik uraian
 * = sebulan, klik sel = satu tanggal. Hanya baca.
 */

interface Props {
  baris: BarisLm;
  hari: number | null;
  bulan: string;
  item: ItemLm[];
  /** kode tindakan → "Modul · nama". */
  namaTindakan: Map<string, string>;
  onTutup: () => void;
}

const PER_HALAMAN = 20;
const JENIS = new Map(META.map((m) => [m.kunci, m.jenis]));
const TH = "px-2 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-2 py-1.5 border-b border-line align-top";

export default function RincianLmModal({ baris, hari, bulan, item, namaTindakan, onTutup }: Props) {
  const rows = useMemo(
    () => rincianBaris(baris, item, hari).sort((a, b) => a.x.tgl.localeCompare(b.x.tgl) || a.x.ulp.localeCompare(b.x.ulp)),
    [baris, item, hari],
  );
  const itemTerpakai = useMemo(() => rows.map((r) => r.x), [rows]);
  const { lokasi, galat } = useLokasiRincian(itemTerpakai);
  const [halaman, setHalaman] = useState(1);
  const totalHal = Math.max(1, Math.ceil(rows.length / PER_HALAMAN));
  const hal = Math.min(halaman, totalHal);
  const desimal = barisDesimal(baris);
  const sumber = new Set(baris.sumber);
  const periode = hari === null ? bulan : `${bulan}-${String(hari).padStart(2, "0")}`;

  return (
    <ModalShell title={baris.uraian} subtitle={`${rows.length} pekerjaan · ${periode} · hanya yang disetujui`} maxWidth="max-w-6xl" onClose={onTutup}>
      {galat && <p className="text-xs text-amber-700">{galat}</p>}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead className="kepala-kit">
            <tr>
              {["Tanggal", "ULP", "Pekerjaan", "Gardu / segmen", "Rincian", "Petugas", "Nilai", "Lokasi", "Foto"].map((h) => (
                <th key={h} className={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN).map(({ x, nilai, drone }, i) => {
              const tdk = Object.entries(x.tindakan).filter(([k]) => sumber.has(kunciTindakan(k)));
              const lok = lokasi(x);
              const foto = tdk[0]?.[1].foto ?? lok?.foto ?? null;
              return (
                <tr key={`${x.sumberTabel}-${x.sumberId}-${i}`}>
                  <td className={`${TD} whitespace-nowrap tabular-nums`}>{x.tgl}</td>
                  <td className={TD}>{x.ulp}</td>
                  <td className={TD}>
                    <div className="font-medium text-ink">{JENIS.get(x.kunci) ?? x.kunci}</div>
                    {tdk.map(([k, t]) => (
                      <div key={k} className="text-[11px] text-brand-700">{namaTindakan.get(k) ?? k} × {t.jumlah}</div>
                    ))}
                    {drone && <div className="text-[11px] text-brand-700">Tier 1 + drone · {x.penyulang}</div>}
                    {lok?.jumlahItem ? <div className="text-[11px] text-ink-soft">{lok.jumlahItem} item</div> : null}
                  </td>
                  <td className={TD}>
                    <div className="text-ink">{x.objek ?? "—"}</div>
                    {lok?.alamat && <div className="text-[11px] text-ink-soft">{lok.alamat}</div>}
                  </td>
                  <td className={`${TD} text-ink-soft`}>{x.rincian ?? "—"}</td>
                  <td className={`${TD} text-ink-soft`}>{x.petugas ?? "—"}</td>
                  <td className={`${TD} text-right tabular-nums font-semibold`}>{nilai > 0 ? angkaLm(nilai, desimal) : "—"}</td>
                  <td className={TD}>
                    {lok?.lat && lok.lng ? (
                      <a href={`https://www.google.com/maps?q=${lok.lat},${lok.lng}`} target="_blank" rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-700 hover:underline">
                        <MapPin size={12} /> Peta
                      </a>
                    ) : "—"}
                  </td>
                  <td className={TD}>
                    {foto ? (
                      <a href={foto} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- gambar mini lewat fotoKecil */}
                        <img src={fotoKecil(foto, 96)} alt="" loading="lazy" className="w-12 h-12 object-cover rounded-md border border-line" />
                      </a>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > PER_HALAMAN && (
        <div className="flex items-center justify-end gap-1 text-xs text-ink-soft">
          <button onClick={() => setHalaman(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <span>{hal} / {totalHal}</span>
          <button onClick={() => setHalaman(hal + 1)} disabled={hal >= totalHal} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </ModalShell>
  );
}
