"use client";

import { useMemo, useState } from "react";
import { CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/app/admin/_ui";
import { META } from "../_hooks/useKinerjaYantek";
import { kelompokkan, teksWa, type ItemHarian } from "../_lib/realisasiHarian";
import KirimWaShell from "./KirimWaShell";

/**
 * Pratinjau teks WA realisasi harian — SATU pesan per ULP (keputusan user).
 */

interface Props {
  tgl: string;
  /** ULP terpilih di tab; "SEMUA" = pilih salah satu di sini. */
  ulp: string;
  item: ItemHarian[];
  daftarUlp: string[];
  onTutup: () => void;
}

export default function KirimWaHarianModal({ tgl, ulp, item, daftarUlp, onTutup }: Props) {
  const semua = ulp === "SEMUA";
  const [pilih, setPilih] = useState(semua ? (item[0]?.ulp ?? daftarUlp[0] ?? "") : ulp);

  const teks = useMemo(
    () => teksWa(pilih, tgl, kelompokkan(item.filter((x) => x.ulp === pilih), META)),
    [pilih, tgl, item],
  );
  const jumlahPer = (u: string) => item.filter((x) => x.ulp === u).length;

  return (
    <KirimWaShell
      title="Kirim realisasi harian ke WA"
      subtitle="Satu pesan per ULP · penerima dipilih di WhatsApp"
      teks={teks}
      pesanSalin={`Teks realisasi ${pilih} tersalin — tempel di grup WA.`}
      onTutup={onTutup}
    >
      {semua && (
        <div>
          <p className={`${EYEBROW} mb-1.5`}>ULP</p>
          <div className="flex flex-wrap gap-2">
            {daftarUlp.map((u) => (
              <button key={u} onClick={() => setPilih(u)} className={`${CHIP} ${pilih === u ? CHIP_ON : CHIP_OFF}`}>
                {u} <span className="opacity-70">{jumlahPer(u)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </KirimWaShell>
  );
}
