"use client";

import { Check, Plus } from "lucide-react";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";

/**
 * Kategori lain di titik yang sama (25 Nov 2026, scripts/kategori-banyak.sql):
 * satu pekerjaan, beberapa kategori — mis. perisai JTM + perisai gardu + ganti
 * arester. Tiap kategori yang dicentang menjadi baris sendiri (realisasi LM
 * sendiri), foto & isian lain sama. Dipakai Catat PDKB, Koreksi PDKB, Koreksi
 * Pemeliharaan Jaringan.
 */

interface Pilihan {
  kode: string;
  label: string;
}

interface Props {
  pilihan: Pilihan[];
  /** Kategori yang sudah ada (kategori utama / baris sekelompok) — tidak bisa dipilih. */
  sudah: string[];
  nilai: string[];
  onUbah: (kode: string[]) => void;
  /** Teks bila belum ada kategori utama. */
  kunci?: string | null;
}

export default function PilihKategoriLain({ pilihan, sudah, nilai, onUbah, kunci }: Props) {
  const ada = new Set(sudah);
  const bisa = pilihan.filter((k) => !ada.has(k.kode));
  const balik = (kode: string) => onUbah(nilai.includes(kode) ? nilai.filter((x) => x !== kode) : [...nilai, kode]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-ink-soft">
        Kategori lain di titik yang sama <span className="font-normal text-ink-muted">(tidak wajib — tiap kategori dihitung sendiri)</span>
      </span>
      {kunci ? (
        <p className="text-[11px] text-ink-muted">{kunci}</p>
      ) : bisa.length === 0 ? (
        <p className="text-[11px] text-ink-muted">Tidak ada kategori lain untuk jenis ini.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {bisa.map((k) => {
            const on = nilai.includes(k.kode);
            return (
              <button key={k.kode} type="button" onClick={() => balik(k.kode)} className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`} aria-pressed={on}>
                {on ? <Check size={12} /> : <Plus size={12} />} {k.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
