"use client";

import { useState } from "react";
import { ClipboardPlus, Map as IkonPeta } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import type { JurusanJtr, PengaturanJtr } from "../_hooks/useAnalisisJtr";
import { NADA_TAHAP, PEKERJAAN_USULAN, type PekerjaanUsulan, type SimpanUsulan, type UsulanJtr } from "../_hooks/useUsulanJtr";
import type { MaterialRef } from "../_lib/materialJtr";
import { alamatPetaRencana, LABEL_RENCANA, type GawangJtr, type OpsiPecah, type Rencana } from "../_lib/rencanaJtr";
import FormUsulanJtr from "./FormUsulanJtr";
import PilihanPecah from "./PilihanPecah";

/** Rincian rencana perbaikan satu jurusan: alasan, angka, pilihan titik pecah → simpan usulan. */

interface Props {
  r: JurusanJtr;
  rencana: Rencana;
  gawang: GawangJtr[] | undefined;
  pengaturan: PengaturanJtr;
  materialRef: MaterialRef[];
  /** Usulan yang masih berjalan untuk jurusan ini (bukan Batal/Selesai). */
  usulanAda: UsulanJtr | undefined;
  bolehUsul: boolean;
  onSimpanUsulan: (u: SimpanUsulan) => Promise<void>;
  onBukaUsulan: (u: UsulanJtr) => void;
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

export default function RincianRencanaJtr(p: Props) {
  const { r, rencana, gawang, pengaturan, usulanAda, onTutup } = p;
  const pilihan = rencana.pilihan ?? [];
  // Sisip: belum memilih titik pecah = tetap sisip.
  const [opsi, setOpsi] = useState<OpsiPecah | null>(rencana.jenis === "tambah-jurusan" ? (pilihan[0] ?? null) : null);
  const [langkah, setLangkah] = useState<"rincian" | "simpan">("rincian");
  const adaPilihan = pilihan.length > 0 && !!gawang;
  const bisaUsul = p.bolehUsul && PEKERJAAN_USULAN.includes((opsi ? "tambah-jurusan" : rencana.jenis) as PekerjaanUsulan);

  if (langkah === "simpan") {
    return (
      <FormUsulanJtr
        r={r} rencana={rencana} opsi={opsi} materialRef={p.materialRef}
        onSimpan={p.onSimpanUsulan} onKembali={() => setLangkah("rincian")} onTutup={onTutup}
      />
    );
  }

  return (
    <ModalShell
      title={`${LABEL_RENCANA[rencana.jenis]} — ${r.gardu_kode} jurusan ${r.jurusan}`}
      subtitle={[r.penyulang, r.gardu_nama].filter(Boolean).join(" · ") || undefined}
      maxWidth={adaPilihan ? "max-w-5xl" : "max-w-xl"}
      onClose={onTutup}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {usulanAda && (
            <button onClick={() => p.onBukaUsulan(usulanAda)} className="mr-auto inline-flex items-center gap-2 text-sm text-ink-soft hover:underline">
              Sudah diusulkan
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${NADA_TAHAP[usulanAda.tahap]}`}>{usulanAda.tahap}</span>
            </button>
          )}
          <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
          {r.jtr_ada && (
            <a href={alamatPetaRencana(r.gardu_kode, r.jurusan, opsi?.kunci)} target="_blank" rel="noopener" className={BTN_GHOST}>
              <IkonPeta size={14} /> Lihat di peta
            </a>
          )}
          {bisaUsul && !usulanAda && (
            <button onClick={() => setLangkah("simpan")} className={BTN_PRIMARY}>
              <ClipboardPlus size={14} /> Simpan usulan{opsi && rencana.jenis === "sisip" ? " tambah jurusan" : ""}
            </button>
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
              <p className="text-sm text-ink-soft">
                Bila tetap memilih tambah jurusan, pilih titik pecahnya di bawah.
                {opsi && (
                  <button onClick={() => setOpsi(null)} className="ml-2 font-semibold text-navy-600 hover:underline">Kembali ke sisip</button>
                )}
              </p>
            )}
            <PilihanPecah r={r} gawang={gawang} pengaturan={pengaturan} pilihan={pilihan} terpilih={opsi?.kunci ?? ""} onPilih={setOpsi} />
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
