"use client";

import { useEffect, useState } from "react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Pindah pemilik batang tiang JTM ke penyulang yang kabelnya paling atas
 * (`scripts/jtm-posisi-kabel.sql`). Pratinjau dulu — server menjalankan
 * langkah yang sama lalu membatalkannya, jadi yang tampil di sini persis
 * yang akan terjadi.
 */

interface Jalur {
  penyulang: string;
  kode: string;
  pemilik: boolean;
  induk: string | null;
}

interface Props {
  tiangId: string;
  /** Nama batang sekarang (penyulang pemilik). */
  batang: string;
  penyulang: string;
  onTutup: () => void;
  onTetapkan: (alasan: string) => Promise<boolean>;
}

export default function TetapkanPemilikTiang({ tiangId, batang, penyulang, onTutup, onTetapkan }: Props) {
  const toast = useToast();
  const [jalur, setJalur] = useState<Jalur[] | null>(null);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .rpc("pratinjau_pemilik_tiang_jtm", { p_tiang: tiangId, p_penyulang: penyulang })
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error) {
          toast.error(
            error.message.includes("Could not find the function")
              ? "Fungsi Tetapkan pemilik tiang belum ada — jalankan scripts/jtm-posisi-kabel.sql di Supabase."
              : error.message,
          );
          onTutup();
          return;
        }
        const d = data as { hasil: { jalur: Jalur[] } };
        setJalur(d.hasil.jalur);
      });
    return () => { hidup = false; };
    // Sekali saat dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!jalur) return null;

  const susunan = jalur
    .map((j) => `${j.kode} (${j.penyulang}, ${j.pemilik ? "di atas" : "di bawah"}, induk ${j.induk ?? "pangkal"})`)
    .join(" · ");
  const lama = jalur.filter((j) => !j.pemilik).map((j) => j.penyulang).join(", ");

  return (
    <BatalkanModal
      judul={`Jadikan ${penyulang} pemilik tiang ${batang}?`}
      keterangan={`Untuk tiang yang kabel ${penyulang}-nya paling atas. Sesudahnya: ${susunan}. Nama dan induk tiang di setiap penyulang tidak berubah.`}
      peringatan={`Isian badan tiang (jenis, konstruksi, peralatan) sesudah ini dinilai dari inspeksi ${penyulang}; ${lama} menilai kabelnya saja. Peralatan yang sudah tercatat di tiang ini tetap milik penyulangnya.`}
      labelTombol="Tetapkan pemilik tiang"
      placeholder={`Alasan — mis. kabel ${penyulang} paling atas, dicek di lapangan`}
      onTutup={onTutup}
      onBatalkan={onTetapkan}
    />
  );
}
