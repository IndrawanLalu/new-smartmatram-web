"use client";

import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, EYEBROW } from "@/app/admin/_ui";
import type { JurusanJtr } from "../_hooks/useAnalisisJtr";
import { LABEL_RENCANA, type Rencana } from "../_lib/rencanaJtr";

/** Rincian rencana perbaikan satu jurusan: alasan, angka, pilihan lain. */

interface Props {
  r: JurusanJtr;
  rencana: Rencana;
  onTutup: () => void;
}

function Daftar({ judul, isi, nada = "text-ink" }: { judul: string; isi: string[]; nada?: string }) {
  if (!isi.length) return null;
  return (
    <section className="space-y-1.5">
      <p className={EYEBROW}>{judul}</p>
      <ul className={`list-disc pl-5 space-y-1 text-sm ${nada}`}>
        {isi.map((x) => <li key={x}>{x}</li>)}
      </ul>
    </section>
  );
}

export default function RincianRencanaJtr({ r, rencana, onTutup }: Props) {
  return (
    <ModalShell
      title={`${LABEL_RENCANA[rencana.jenis]} — ${r.gardu_kode} jurusan ${r.jurusan}`}
      subtitle={[r.penyulang, r.gardu_nama].filter(Boolean).join(" · ") || undefined}
      maxWidth="max-w-xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end">
          <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-base font-semibold text-ink">{rencana.ringkas}</p>
        <Daftar judul="Alasan" isi={rencana.alasan} />
        <Daftar judul="Rincian" isi={rencana.rinci} />
        <Daftar judul="Pilihan lain" isi={rencana.pilihanLain} nada="text-ink-soft" />
        <Daftar judul="Pastikan" isi={rencana.catatan} nada="text-amber-800" />
        <p className="text-xs text-ink-muted border-t border-line pt-3">
          Perkiraan: arus jurusan disebar ke tiap tiang menurut tarikan SR, jatuh tegangan dibandingkan lewat momen beban
          (arus × panjang). Pastikan di lapangan sebelum dikerjakan.
        </p>
      </div>
    </ModalShell>
  );
}
