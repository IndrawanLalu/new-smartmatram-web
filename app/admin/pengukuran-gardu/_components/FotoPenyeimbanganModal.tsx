"use client";

import { useState } from "react";
import { Camera, ExternalLink } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import type { FotoFasa, PenyeimbanganGardu } from "../_hooks/usePenyeimbangan";

const FASA = ["R", "S", "T", "N"] as const;

/** Warna label fasa mengikuti kebiasaan lapangan, bukan palet dekorasi:
 *  R merah, S kuning, T hitam, N biru. */
const FASA_CLS: Record<string, string> = {
  R: "bg-red-100 text-red-700",
  S: "bg-amber-100 text-amber-800",
  T: "bg-slate-200 text-slate-700",
  N: "bg-blue-100 text-blue-700",
};

interface Props {
  record: PenyeimbanganGardu;
  onClose: () => void;
}

/** Satu foto + label fasanya. Gagal muat ditangani supaya satu URL rusak tidak
 *  menyisakan kotak kosong tanpa penjelasan. */
function FotoFasaItem({ fasa, url }: { fasa: string; url?: string }) {
  const [error, setError] = useState(false);

  return (
    <div className="relative rounded-lg overflow-hidden border border-line bg-surface aspect-4/3">
      <span
        className={`absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded text-[10px] font-bold ${FASA_CLS[fasa]}`}
      >
        {fasa}
      </span>

      {!url ? (
        <div className="w-full h-full grid place-items-center text-[11px] text-ink-muted">
          tidak difoto
        </div>
      ) : error ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-full grid place-items-center gap-1 text-[11px] text-navy-600 hover:underline"
        >
          <ExternalLink size={14} />
          buka foto
        </a>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" title="Buka ukuran penuh">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={`Foto fasa ${fasa}`}
            className="w-full h-full object-cover"
            onError={() => setError(true)}
          />
        </a>
      )}
    </div>
  );
}

/** Petak 2×2 — inilah "satu foto berisi empat foto R S T N" yang diminta.
 *  Digabung saat ditampilkan, bukan dijahit di HP, supaya foto asli tetap utuh
 *  sebagai bukti dan aplikasi mobile tak perlu dependensi native. */
function FotoFasaGrid({ judul, foto }: { judul: string; foto: FotoFasa }) {
  const jumlah = FASA.filter((f) => foto[f]).length;

  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h4 className="text-sm font-semibold text-ink">{judul}</h4>
        <span className="text-[11px] text-ink-muted">{jumlah} dari 4 fasa</span>
      </div>
      <div className="grid grid-cols-2 gap-2 max-w-md">
        {FASA.map((f) => (
          <FotoFasaItem key={f} fasa={f} url={foto[f]} />
        ))}
      </div>
    </div>
  );
}

export default function FotoPenyeimbanganModal({ record, onClose }: Props) {
  const jurusan = Object.entries(record.foto_perjurusan ?? {}).filter(
    ([, foto]) => foto && Object.keys(foto).length > 0,
  );
  const adaTotal = !!record.foto_total && Object.keys(record.foto_total).length > 0;

  return (
    <ModalShell
      title={`Bukti Foto — Gardu ${record.no_gardu}`}
      subtitle={`${record.penyulang ?? "—"} · ${record.tgl_penyeimbangan} · ${record.petugas_penyeimbang ?? "—"}`}
      maxWidth="max-w-2xl"
      onClose={onClose}
    >
      {!adaTotal && jurusan.length === 0 ? (
        <div className="py-10 text-center">
          <Camera size={28} className="mx-auto text-ink-muted mb-2" />
          <p className="text-sm text-ink-soft">Rekap ini belum punya foto bukti.</p>
          <p className="text-xs text-ink-muted mt-1">
            Foto hanya terekam untuk pekerjaan yang dicatat lewat aplikasi mobile.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {adaTotal && <FotoFasaGrid judul="Total Gardu" foto={record.foto_total!} />}
          {jurusan.map(([kode, foto]) => (
            <FotoFasaGrid key={kode} judul={`Jurusan ${kode}`} foto={foto} />
          ))}
        </div>
      )}
    </ModalShell>
  );
}
