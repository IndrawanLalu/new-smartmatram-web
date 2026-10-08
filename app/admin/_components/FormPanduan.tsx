"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { IsianPanduan, ItemPanduan } from "@/app/admin/_hooks/usePanduan";

/** Tambah / ubah satu istilah panduan. Hapus butuh ketukan kedua di modal ini. */

interface Props {
  awal: ItemPanduan | null;
  kelompokAda: string[];
  urutanBaru: number;
  onSimpan: (isi: IsianPanduan) => Promise<string | null>;
  onHapus?: () => Promise<string | null>;
  onTutup: () => void;
}

const LABEL = `${EYEBROW} block mb-1`;

export default function FormPanduan({ awal, kelompokAda, urutanBaru, onSimpan, onHapus, onTutup }: Props) {
  const [isi, setIsi] = useState<IsianPanduan>({
    kelompok: awal?.kelompok ?? kelompokAda[0] ?? "",
    istilah: awal?.istilah ?? "",
    maksud: awal?.maksud ?? "",
    kapan: awal?.kapan ?? "",
    contoh: awal?.contoh ?? "",
    urutan: awal?.urutan ?? urutanBaru,
    aktif: awal?.aktif ?? true,
  });
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [yakinHapus, setYakinHapus] = useState(false);

  const kurang = !isi.kelompok.trim() || !isi.istilah.trim() || !isi.maksud.trim();
  const ubah = (p: Partial<IsianPanduan>) => setIsi((s) => ({ ...s, ...p }));

  const jalankan = async (fn: () => Promise<string | null>) => {
    setSibuk(true);
    const g = await fn();
    setSibuk(false);
    if (g) setGalat(g);
    else onTutup();
  };

  return (
    <ModalShell
      title={awal ? `Ubah: ${awal.istilah}` : "Tambah istilah"}
      subtitle="Tampil di halaman Panduan web dan HP."
      maxWidth="max-w-xl"
      onClose={onTutup}
      footer={
        <div className="flex items-center gap-2">
          {onHapus && (
            <button
              onClick={() => (yakinHapus ? void jalankan(onHapus) : setYakinHapus(true))}
              disabled={sibuk}
              className={`${BTN_GHOST} text-red-600`}
            >
              <Trash2 size={14} /> {yakinHapus ? "Ya, hapus istilah ini" : "Hapus"}
            </button>
          )}
          <span className="flex-1" />
          <button onClick={onTutup} disabled={sibuk} className={BTN_GHOST}>Batal</button>
          <button onClick={() => void jalankan(() => onSimpan(isi))} disabled={sibuk || kurang} className={BTN_PRIMARY}>
            {sibuk && <Loader2 size={14} className="animate-spin" />} Simpan
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className="min-w-0">
            <span className={LABEL}>Kelompok</span>
            <input id="panduan-kelompok" list="panduan-kelompok-ada" value={isi.kelompok} onChange={(e) => ubah({ kelompok: e.target.value })} className={`${FIELD} w-full`} />
            <datalist id="panduan-kelompok-ada">
              {kelompokAda.map((k) => <option key={k} value={k} />)}
            </datalist>
          </label>
          <label>
            <span className={LABEL}>Urutan</span>
            <input id="panduan-urutan" type="number" value={isi.urutan} onChange={(e) => ubah({ urutan: Number(e.target.value) || 0 })} className={`${FIELD} w-full`} />
          </label>
        </div>
        <label className="block">
          <span className={LABEL}>Istilah (sama persis dengan tulisan di layar)</span>
          <input id="panduan-istilah" value={isi.istilah} onChange={(e) => ubah({ istilah: e.target.value })} className={`${FIELD} w-full`} />
        </label>
        <label className="block">
          <span className={LABEL}>Maksudnya</span>
          <textarea id="panduan-maksud" rows={3} value={isi.maksud} onChange={(e) => ubah({ maksud: e.target.value })} className={`${FIELD} w-full`} />
        </label>
        <label className="block">
          <span className={LABEL}>Kapan dipakai / caranya</span>
          <textarea id="panduan-kapan" rows={2} value={isi.kapan ?? ""} onChange={(e) => ubah({ kapan: e.target.value })} className={`${FIELD} w-full`} />
        </label>
        <label className="block">
          <span className={LABEL}>Contoh (boleh kosong)</span>
          <input id="panduan-contoh" value={isi.contoh ?? ""} onChange={(e) => ubah({ contoh: e.target.value })} className={`${FIELD} w-full`} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input id="panduan-aktif" type="checkbox" checked={isi.aktif} onChange={(e) => ubah({ aktif: e.target.checked })} />
          Tampilkan (hilangkan centang untuk menyembunyikan tanpa menghapus)
        </label>
        {galat && <p className="text-sm text-red-600">Belum tersimpan: {galat}</p>}
      </div>
    </ModalShell>
  );
}
