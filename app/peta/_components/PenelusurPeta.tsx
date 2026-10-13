"use client";

import { ClipboardCheck, Columns2 } from "lucide-react";
import type { useAntreanPeta } from "../_hooks/useAntreanPeta";
import PenelusurAntrean from "./PenelusurAntrean";

/** Penelusur yang sedang menyala: antrean JTR, antrean JTM, gardu portal. */
export default function PenelusurPeta({ antrean }: { antrean: ReturnType<typeof useAntreanPeta> }) {
  const { jtr, jtm, portal } = antrean;
  return (
    <>
      {jtr.aktif && (
        <PenelusurAntrean
          ikon={<ClipboardCheck size={14} className="text-[#FACC15]" />}
          jumlah={jtr.antrean.length}
          nomor={jtr.langkah.nomor}
          label={<b className="ml-2">{jtr.langkah.kini?.gardu_kode}</b>}
          kosong="Tidak ada inspeksi JTR menunggu persetujuan"
          onGeser={jtr.langkah.geser}
          onTutup={jtr.tutup}
          labelTutup="Tutup antrean"
        />
      )}

      {jtm.aktif && (
        <PenelusurAntrean
          ikon={<ClipboardCheck size={14} className="text-[#60A5FA]" />}
          jumlah={jtm.antrean.length}
          nomor={jtm.langkah.nomor}
          label={<b className="ml-2">{jtm.langkah.kini?.segmen_nama ?? "segmen"}</b>}
          kosong="Tidak ada inspeksi JTM menunggu persetujuan"
          onGeser={jtm.langkah.geser}
          onTutup={jtm.tutup}
          labelTutup="Tutup antrean JTM"
        />
      )}

      {portal.aktif && (
        <PenelusurAntrean
          bawah
          ikon={<Columns2 size={14} className="text-[#c084fc]" />}
          jumlah={portal.daftar.length}
          nomor={portal.langkah.nomor}
          label={
            <>
              <b className="ml-2">{portal.langkah.kini?.kode}</b>
              <span className="ml-1 text-gray-400">{portal.langkah.kini?.nomorGardu ?? ""}</span>
            </>
          }
          kosong="Semua gardu portal sudah dua tiang"
          onGeser={portal.langkah.geser}
          onTutup={portal.tutup}
          labelTutup="Tutup daftar portal"
        />
      )}
    </>
  );
}
