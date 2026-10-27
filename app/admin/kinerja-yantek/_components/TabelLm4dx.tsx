"use client";

import { CARD } from "@/app/admin/_ui";
import { angkaLm, barisDesimal, HARI, namaSumber, type BarisLm } from "../_lib/lm4dx";

/** Pratinjau blok LM 4DX: baris pekerjaan × tanggal 1–31, kolom tanggal terpilih disorot. */

interface Props {
  baris: BarisLm[];
  matriks: Map<string, number[]>;
  namaKategori: Map<string, string>;
  jumlahHari: number;
  hariTerpilih: number;
  /** Tanggal hari ini bila bulan yang tampil = bulan berjalan. */
  hariIni: number | null;
}

const TANGGAL = Array.from({ length: HARI }, (_, i) => i + 1);
const TH = "px-1.5 py-2 text-[11px] font-semibold text-ink-soft border-b border-line";
const TD = "px-1.5 py-1.5 border-b border-line text-right tabular-nums";

export default function TabelLm4dx({ baris, matriks, namaKategori, jumlahHari, hariTerpilih, hariIni }: Props) {
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
            return (
              <tr key={b.id}>
                <td className="px-2 py-1.5 border-b border-line sticky left-0 bg-white z-10">
                  <div className="font-medium text-ink"><span className="text-ink-muted mr-1.5">{i + 1}.</span>{b.uraian}</div>
                  <div className={`text-[10px] ${b.sumber.length ? "text-ink-soft" : "text-ink-muted italic"}`}>
                    {b.sumber.length ? b.sumber.map((s) => namaSumber(s, namaKategori)).join(" + ") : "tidak dari SMART — tersalin kosong"}
                  </div>
                </td>
                {TANGGAL.map((h) => (
                  <td key={h} className={`${TD} ${warnaKolom(h)}`}>{angkaLm(isi[h - 1] ?? 0, d)}</td>
                ))}
                <td className={`${TD} font-semibold text-ink`}>{angkaLm(total, d)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
