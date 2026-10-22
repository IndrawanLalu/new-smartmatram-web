"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { unduhBerkas } from "@/lib/gambarSurvey/latar";

/**
 * Pratinjau gambar survey PDF sebelum diunduh (permintaan user 22 Okt):
 * PDF dibuat sekali, ditampilkan di bingkai, lalu berkas yang SAMA diunduh.
 */

interface Props {
  judul: string;
  buat: () => Promise<Blob>;
  onTutup: () => void;
}

export default function PratinjauGambarSurvey({ judul, buat, onTutup }: Props) {
  const [pdf, setPdf] = useState<{ blob: Blob; url: string } | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    let hidup = true;
    buat()
      .then((blob) => {
        if (!hidup) return;
        url = URL.createObjectURL(blob);
        setPdf({ blob, url });
      })
      .catch((e: Error) => hidup && setGalat(e.message));
    return () => {
      hidup = false;
      if (url) URL.revokeObjectURL(url);
    };
    // Dibuat sekali saat dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <ModalShell
      title="Pratinjau gambar survey"
      subtitle={judul}
      maxWidth="max-w-6xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
          <button
            disabled={!pdf}
            onClick={() => pdf && unduhBerkas(pdf.blob, `Gambar survey ${judul}.pdf`)}
            className={BTN_PRIMARY}
          >
            <Download size={15} /> Unduh PDF
          </button>
        </div>
      }
    >
      <div className="p-4">
        {galat ? (
          <p className="text-sm text-red-600">{galat}</p>
        ) : pdf ? (
          <iframe src={pdf.url} title="Pratinjau gambar survey" className="w-full h-[72vh] rounded-lg border border-line" />
        ) : (
          <p className="h-[72vh] grid place-items-center text-sm text-ink-soft">
            <span className="flex items-center gap-2"><Loader2 size={16} className="animate-spin" /> Menyusun gambar survey…</span>
          </p>
        )}
      </div>
    </ModalShell>
  );
}
