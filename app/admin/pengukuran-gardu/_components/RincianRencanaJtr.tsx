"use client";

import { useState } from "react";
import { Map as IkonPeta } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import type { JurusanJtr, PengaturanJtr } from "../_hooks/useAnalisisJtr";
import { alamatPetaRencana, LABEL_RENCANA, type GawangJtr, type Rencana } from "../_lib/rencanaJtr";
import PilihanPecah from "./PilihanPecah";

/** Rincian rencana perbaikan satu jurusan: alasan, angka, pilihan titik pecah. */

interface Props {
  r: JurusanJtr;
  rencana: Rencana;
  gawang: GawangJtr[] | undefined;
  pengaturan: PengaturanJtr;
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

export default function RincianRencanaJtr({ r, rencana, gawang, pengaturan, onTutup }: Props) {
  const pilihan = rencana.pilihan ?? [];
  const [terpilih, setTerpilih] = useState(pilihan[0]?.kunci ?? "");
  const adaPilihan = pilihan.length > 0 && !!gawang;

  return (
    <ModalShell
      title={`${LABEL_RENCANA[rencana.jenis]} — ${r.gardu_kode} jurusan ${r.jurusan}`}
      subtitle={[r.penyulang, r.gardu_nama].filter(Boolean).join(" · ") || undefined}
      maxWidth={adaPilihan ? "max-w-5xl" : "max-w-xl"}
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
          {r.jtr_ada && (
            <a href={alamatPetaRencana(r.gardu_kode, r.jurusan, terpilih || undefined)} target="_blank" rel="noopener" className={BTN_PRIMARY}>
              <IkonPeta size={14} /> Lihat di peta
            </a>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-base font-semibold text-ink">{rencana.ringkas}</p>
        <Daftar judul="Alasan" isi={rencana.alasan} />
        <Daftar judul="Rincian" isi={rencana.rinci} />
        {adaPilihan && (
          <>
            {rencana.jenis === "sisip" && (
              <p className="text-sm text-ink-soft">Bila tetap memilih tambah jurusan, pilihan titik pecahnya:</p>
            )}
            <PilihanPecah r={r} gawang={gawang} pengaturan={pengaturan} pilihan={pilihan} terpilih={terpilih} onPilih={setTerpilih} />
          </>
        )}
        {!adaPilihan && <Daftar judul="Pilihan lain" isi={rencana.pilihanLain} nada="text-ink-soft" />}
        <Daftar judul="Pastikan" isi={rencana.catatan} nada="text-amber-800" />
        <p className="text-xs text-ink-muted border-t border-line pt-3">
          Perkiraan: arus jurusan disebar ke tiap tiang menurut tarikan SR, jatuh tegangan dibandingkan lewat momen beban
          (arus × panjang). Pastikan di lapangan sebelum dikerjakan.
        </p>
      </div>
    </ModalShell>
  );
}
