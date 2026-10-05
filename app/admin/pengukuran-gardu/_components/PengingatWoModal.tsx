"use client";

import { useState } from "react";
import { ListPlus, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import type { BarisPratinjau } from "../_hooks/usePratinjauWo";
import DaftarPengingat from "./DaftarPengingat";

/**
 * Pengingat sesudah WO terbit (otomatis maupun manual): gardu yang sudah masuk
 * waktu ukur tapi tidak ada di WO bulan ini. Hanya diingatkan; admin memilih
 * mana yang ditambahkan (keputusan user 5 Okt 2026).
 */

interface Props {
  ulp: string;
  periode: string;
  baris: BarisPratinjau[];
  onTambah: (kode: string[]) => Promise<number>;
  onTutup: () => void;
}

export default function PengingatWoModal({ ulp, periode, baris, onTambah, onTutup }: Props) {
  const toast = useToast();
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [sibuk, setSibuk] = useState(false);

  const ubah = (kode: string[], aktif: boolean) =>
    setPilih((p) => {
      const s = new Set(p);
      for (const k of kode) {
        if (aktif) s.add(k);
        else s.delete(k);
      }
      return s;
    });

  const tambah = async () => {
    setSibuk(true);
    try {
      const n = await onTambah([...pilih]);
      toast.success(`${n} gardu ditambahkan ke WO ${ulp} ${periode} dan tampil di HP petugas ukur.`);
      onTutup();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menambahkan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title={`Sudah masuk waktu ukur — ${ulp}`}
      subtitle={`${baris.length} gardu tidak ada di WO ${periode}`}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Tutup</button>
          <button onClick={() => void tambah()} className={BTN_PRIMARY} disabled={sibuk || pilih.size === 0}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <ListPlus size={14} />}
            Tambahkan {pilih.size || ""} ke WO
          </button>
        </>
      }
    >
      <div className="p-5 space-y-3">
        <p className="text-sm text-ink-soft">
          Umur pengukuran terakhirnya sudah melewati batas di Pengaturan WO (atau belum pernah diukur), tapi tidak
          direncanakan bulan ini. Centang yang ingin ikut diukur bulan ini.
        </p>
        <DaftarPengingat baris={baris} pilih={pilih} onUbah={ubah} />
      </div>
    </ModalShell>
  );
}
