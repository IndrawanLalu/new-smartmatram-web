"use client";

import { useState } from "react";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";
import RealisasiPerHari from "./RealisasiPerHari";
import RealisasiPerBulan from "./RealisasiPerBulan";

/**
 * Tab "Realisasi Harian": Per hari (satu tanggal + kirim WA) dan Per bulan
 * (perbandingan antar-ULP: total, hari berealisasi, rata-rata per hari).
 */

const MODE = [
  { key: "hari", label: "Per hari" },
  { key: "bulan", label: "Per bulan" },
] as const;

interface Props {
  ulpAwal: string;
  daftarUlp: string[];
  daftarTahun: number[];
}

export default function RealisasiHarian({ ulpAwal, daftarUlp, daftarTahun }: Props) {
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
      ) : (
        // UP3 ("SEMUA" ada di daftar) melihat keempat ULP; admin hanya ULP-nya.
        <RealisasiPerBulan ulp={daftarUlp.includes("SEMUA") ? "SEMUA" : ulps[0] ?? ""} ulps={ulps} daftarTahun={daftarTahun} />
      )}
    </>
  );
}
