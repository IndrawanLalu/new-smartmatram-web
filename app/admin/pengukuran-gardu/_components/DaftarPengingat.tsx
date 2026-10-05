"use client";

import { useState } from "react";
import { LABEL_ALASAN } from "../_lib/kandidatWo";
import type { BarisPratinjau } from "../_hooks/usePratinjauWo";

/**
 * Daftar gardu "sudah masuk waktu ukur" yang tidak ada di WO, dengan centang
 * untuk ikut dimasukkan. Bawaan TIDAK dicentang (keputusan user 5 Okt 2026):
 * rencana ULP adalah dasarnya, WO tidak membengkak tanpa sepengetahuan admin.
 */

const PER_TAMPIL = 50;

interface Props {
  baris: BarisPratinjau[];
  pilih: Set<string>;
  onUbah: (kode: string[], aktif: boolean) => void;
}

export default function DaftarPengingat({ baris, pilih, onUbah }: Props) {
  const [tampil, setTampil] = useState(PER_TAMPIL);
  const semua = baris.length > 0 && baris.every((b) => pilih.has(b.kode_gardu));

  return (
    <div className="rounded-xl border border-amber-200 overflow-hidden">
      <label className="flex items-center gap-2 px-3 py-2 bg-amber-50 text-xs font-semibold text-amber-900 border-b border-amber-200">
        <input
          type="checkbox"
          checked={semua}
          onChange={(e) => onUbah(baris.map((b) => b.kode_gardu), e.target.checked)}
          className="accent-navy-600"
        />
        Pilih semua ({baris.length})
        <span className="ml-auto font-normal">{pilih.size > 0 ? `${pilih.size} dipilih` : "belum ada yang dipilih"}</span>
      </label>
      <div className="max-h-64 overflow-y-auto divide-y divide-line">
        {baris.slice(0, tampil).map((b) => (
          <label key={b.kode_gardu} className="flex items-center gap-3 px-3 py-1.5 text-xs hover:bg-surface cursor-pointer">
            <input
              type="checkbox"
              checked={pilih.has(b.kode_gardu)}
              onChange={(e) => onUbah([b.kode_gardu], e.target.checked)}
              className="accent-navy-600"
            />
            <span className="w-16 font-semibold text-ink">{b.kode_gardu}</span>
            <span className="flex-1 min-w-0 truncate text-ink-soft">{b.penyulang ?? "—"} · {b.alamat ?? b.nama ?? ""}</span>
            <span className="text-ink-muted whitespace-nowrap">
              {b.umur_bulan === null ? LABEL_ALASAN.belum_pernah : `${b.umur_bulan} bln lalu`}
              {b.persen_beban !== null ? ` · ${Math.round(b.persen_beban)}%` : ""}
            </span>
          </label>
        ))}
      </div>
      {baris.length > tampil && (
        <button onClick={() => setTampil((t) => t + PER_TAMPIL)} className="w-full py-1.5 text-xs font-semibold text-navy-600 border-t border-line hover:bg-surface">
          Tampilkan {Math.min(PER_TAMPIL, baris.length - tampil)} lagi
        </button>
      )}
    </div>
  );
}
