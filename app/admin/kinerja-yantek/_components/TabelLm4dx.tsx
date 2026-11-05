"use client";

import { Fragment } from "react";
import { CARD } from "@/app/admin/_ui";
import { angkaLm, barisDesimal, HARI, NAMA_KELOMPOK, namaSumber, type BarisLm } from "../_lib/lm4dx";

/**
 * Blok LM 4DX / Penurunan Susut: baris pekerjaan × tanggal 1–31, kolom tanggal
 * terpilih disorot, sel berisi angka diberi warna. Judul kelompok (JTM / Gardu
 * / JTR) disisipkan tiap kelompok berganti — urutan baris tetap.
 */

interface Props {
  baris: BarisLm[];
  matriks: Map<string, number[]>;
  namaKategori: Map<string, string>;
  namaTindakan?: Map<string, string>;
  jumlahHari: number;
  /** Kolom yang disorot (tanggal yang akan disalin). */
  hariTerpilih?: number;
  /** Tanggal hari ini bila bulan yang tampil = bulan berjalan. */
  hariIni: number | null;
  /** Keterangan baris tanpa sumber. */
  teksTanpaSumber?: string;
  /** Klik uraian (hari null = sebulan) atau sel tanggal → daftar rincian. */
  onPilih?: (b: BarisLm, hari: number | null) => void;
}

const TANGGAL = Array.from({ length: HARI }, (_, i) => i + 1);
const TH = "px-1.5 py-2 text-[11px] font-semibold text-ink-soft border-b border-line";
const TD = "px-1.5 py-1.5 border-b border-line text-right tabular-nums";
const ADA_NILAI = "bg-brand-100 text-brand-800 font-semibold";

export default function TabelLm4dx({
  baris, matriks, namaKategori, namaTindakan, jumlahHari, hariTerpilih, hariIni,
  teksTanpaSumber = "tidak dari SMART — tersalin kosong", onPilih,
}: Props) {
  const bisaKlik = onPilih ? "cursor-pointer hover:bg-brand-50" : "";
  const warnaKolom = (h: number) =>
    h === hariTerpilih ? "bg-brand-50" : h > jumlahHari ? "bg-surface text-ink-muted" : "";

  return (
    <div className={`${CARD} overflow-x-auto`}>
      <table className="border-collapse text-xs min-w-full">
        <thead className="kepala-kit">
          <tr>
            <th className={`${TH} text-left sticky left-0 bg-white z-10 min-w-[280px]`}>Uraian pekerjaan</th>
            {TANGGAL.map((h) => (
              <th key={h} className={`${TH} text-center min-w-[42px] ${warnaKolom(h)} ${h === hariIni ? "text-brand-700" : ""}`}>{h}</th>
            ))}
            <th className={`${TH} text-right min-w-[60px]`}>Total</th>
          </tr>
        </thead>
        <tbody>
          {baris.map((b, i) => {
            const isi = matriks.get(b.id) ?? [];
            const d = barisDesimal(b);
            const total = isi.reduce((a, n) => a + n, 0);
            const judul = b.kelompok && b.kelompok !== baris[i - 1]?.kelompok ? NAMA_KELOMPOK[b.kelompok] : null;
            return (
              <Fragment key={b.id}>
              {judul && (
                <tr>
                  <td colSpan={HARI + 2} className="px-2 py-1.5 border-b border-line bg-surface text-[11px] font-bold uppercase tracking-wide text-ink">
                    <span className="sticky left-2">{judul}</span>
                  </td>
                </tr>
              )}
              <tr>
                <td
                  className={`px-2 py-1.5 border-b border-line sticky left-0 bg-white z-10 ${total > 0 ? bisaKlik : ""}`}
                  onClick={total > 0 ? () => onPilih?.(b, null) : undefined}
                >
                  <div className="font-medium text-ink"><span className="text-ink-muted mr-1.5">{i + 1}.</span>{b.uraian}</div>
                  <div className={`text-[10px] ${b.sumber.length ? "text-ink-soft" : "text-ink-muted italic"}`}>
                    {b.sumber.length ? b.sumber.map((s) => namaSumber(s, namaKategori, namaTindakan)).join(" + ") : teksTanpaSumber}
                  </div>
                </td>
                {TANGGAL.map((h) => {
                  const ada = (isi[h - 1] ?? 0) > 0;
                  return (
                    <td
                      key={h}
                      className={`${TD} ${ada ? `${ADA_NILAI} ${onPilih ? "cursor-pointer hover:bg-brand-200" : ""} ${h === hariTerpilih ? "ring-1 ring-inset ring-brand-500" : ""}` : warnaKolom(h)}`}
                      onClick={ada ? () => onPilih?.(b, h) : undefined}
                    >
                      {angkaLm(isi[h - 1] ?? 0, d)}
                    </td>
                  );
                })}
                <td className={`${TD} font-semibold text-ink ${total > 0 ? "bg-brand-50" : ""}`}>{angkaLm(total, d)}</td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
