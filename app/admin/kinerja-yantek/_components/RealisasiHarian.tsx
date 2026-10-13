"use client";

import { useState } from "react";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";
import RealisasiPerHari from "./RealisasiPerHari";
import RealisasiPerBulan from "./RealisasiPerBulan";
import CopyProNtb from "./CopyProNtb";

/**
 * Tab "Realisasi Harian": Per hari (satu tanggal + kirim WA) dan Per bulan
 * (perbandingan antar-ULP: total, hari berealisasi, rata-rata per hari), dan
 * Copy to PRO NTB (baris laporan harian UIW untuk ditempel ke spreadsheet).
 */

const MODE = [
  { key: "hari", label: "Per hari" },
  { key: "bulan", label: "Per bulan" },
  { key: "pro", label: "Copy to PRO NTB" },
] as const;

interface Props {
  ulpAwal: string;
  daftarUlp: string[];
  daftarTahun: number[];
  /** Nama pengubah kolom PRO NTB per jenis (UP3/admin); null = tidak boleh. */
  pengatur: string | null;
}

export default function RealisasiHarian({ ulpAwal, daftarUlp, daftarTahun, pengatur }: Props) {
  const [mode, setMode] = useState<(typeof MODE)[number]["key"]>("hari");
  const ulps = daftarUlp.filter((u) => u !== "SEMUA");

  return (
    <>
      <div className="flex gap-1.5">
        {MODE.map(({ key, label }) => (
          <button key={key} onClick={() => setMode(key)} className={`${CHIP} ${mode === key ? CHIP_ON : CHIP_OFF}`}>
            {label}
          </button>
        ))}
      </div>
      {mode === "hari" ? (
        <RealisasiPerHari ulpAwal={ulpAwal} daftarUlp={daftarUlp} />
      ) : mode === "pro" ? (
        <CopyProNtb ulpAwal={ulpAwal} daftarUlp={daftarUlp} pengatur={pengatur} />
      ) : (
        // UP3 ("SEMUA" ada di daftar) melihat keempat ULP; admin hanya ULP-nya.
        <RealisasiPerBulan ulp={daftarUlp.includes("SEMUA") ? "SEMUA" : ulps[0] ?? ""} ulps={ulps} daftarTahun={daftarTahun} />
      )}
    </>
  );
}
