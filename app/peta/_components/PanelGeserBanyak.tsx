"use client";

import { useState } from "react";
import { Move, X } from "lucide-react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { jarakGeser, type GeserTiang } from "../_hooks/useGeserBanyak";
import { GARIS, JUDUL_BAGIAN, PANEL } from "../_ui";
import { TOMBOL_PANEL } from "./InfoTiang";

interface Props {
  daftar: GeserTiang[];
  jumlahTergeser: number;
  onBuang: (id: string) => void;
  onSimpan: (alasan: string) => Promise<boolean>;
  onKeluar: () => void;
}

/** Daftar tiang di mode geser titik + satu tombol simpan untuk semuanya. */
export default function PanelGeserBanyak({ daftar, jumlahTergeser, onBuang, onSimpan, onKeluar }: Props) {
  const [tanyaAlasan, setTanyaAlasan] = useState(false);
  const [tanyaKeluar, setTanyaKeluar] = useState(false);

  return (
    <aside
      className="absolute z-[1100] top-14 right-3 bottom-3 w-[300px] max-w-[calc(100%-1.5rem)] rounded-xl border shadow-2xl flex flex-col"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b" style={{ borderColor: GARIS }}>
        <div className="flex-1 min-w-0">
          <p className={JUDUL_BAGIAN}>Mode geser titik</p>
          <p className="text-[#e2e8f0] font-semibold text-base">{jumlahTergeser} tiang digeser</p>
        </div>
        <button
          onClick={() => (jumlahTergeser > 0 ? setTanyaKeluar(true) : onKeluar())}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          aria-label="Keluar mode geser"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        <p className="text-xs text-gray-400 leading-relaxed">
          Klik tiang di peta, lalu seret lingkaran hijaunya ke letak yang benar. Ulangi untuk tiang
          lain — alasannya diisi sekali saat menyimpan.
        </p>
        {daftar.length === 0 ? (
          <p className="text-xs text-gray-500 italic">Belum ada tiang dipilih.</p>
        ) : (
          <ul className="space-y-1">
            {daftar.map((g) => {
              const m = jarakGeser(g);
              return (
                <li key={g.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs border" style={{ borderColor: GARIS }}>
                  <span className="flex-1 min-w-0 truncate text-[#e2e8f0] font-medium">{g.kode}</span>
                  <span className={`tabular-nums ${m >= 0.1 ? "text-[#5eead4] font-semibold" : "text-gray-500"}`}>
                    {m >= 0.1 ? `${m.toFixed(1)} m` : "belum diseret"}
                  </span>
                  <button
                    onClick={() => onBuang(g.id)}
                    className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/10"
                    title="Kembalikan ke titik asal"
                    aria-label={`Kembalikan ${g.kode}`}
                  >
                    <X size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="px-4 py-3 border-t flex gap-2" style={{ borderColor: GARIS }}>
        <button
          onClick={() => setTanyaAlasan(true)}
          disabled={jumlahTergeser === 0}
          className={`${TOMBOL_PANEL} flex-1 justify-center border-[#00897B] text-[#5eead4] disabled:opacity-40`}
        >
          <Move size={13} /> Simpan {jumlahTergeser || ""} tiang
        </button>
      </div>

      {tanyaAlasan && (
        <BatalkanModal
          judul={`Simpan titik baru ${jumlahTergeser} tiang?`}
          keterangan="Semua tiang yang diseret pindah ke titik barunya dengan satu alasan ini. Tercatat di jejak audit per tiang."
          peringatan="Kalau satu tiang ditolak, tidak ada yang tersimpan — daftar tetap utuh untuk dibetulkan."
          labelTombol="Simpan titik"
          placeholder="Alasan — mis. titik GPS jalur ini meleset ke jalan"
          onTutup={() => setTanyaAlasan(false)}
          onBatalkan={onSimpan}
        />
      )}

      {tanyaKeluar && (
        <ConfirmDialog
          title="Keluar tanpa menyimpan?"
          message={`${jumlahTergeser} tiang yang sudah diseret kembali ke titik asalnya.`}
          confirmLabel="Keluar"
          tone="danger"
          onConfirm={() => {
            setTanyaKeluar(false);
            onKeluar();
          }}
          onClose={() => setTanyaKeluar(false)}
        />
      )}
    </aside>
  );
}
