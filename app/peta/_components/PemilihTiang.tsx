"use client";

import { Popup } from "react-leaflet";
import type { TiangPeta } from "../_hooks/usePetaIsi";

/**
 * Pilihan tiang yang berdesakan (12 Okt 2026). Dua tiang gardu portal hanya
 * berjarak ±2 m — di layar bulatannya saling menutup, dan yang terpilih
 * tergantung yang kebetulan digambar paling atas. Klik di titik seperti itu
 * memunculkan daftar ini; klik biasa (satu tiang) langsung jalan seperti dulu.
 */

export interface CalonTiang {
  t: TiangPeta;
  label: string;
}

export interface PilihanTiang {
  lat: number;
  lng: number;
  daftar: CalonTiang[];
}

interface Props {
  pilihan: PilihanTiang | null;
  onPilih: (t: TiangPeta) => void;
  onTutup: () => void;
}

export default function PemilihTiang({ pilihan, onPilih, onTutup }: Props) {
  if (!pilihan) return null;
  return (
    <Popup
      key={`${pilihan.lat},${pilihan.lng}`}
      position={[pilihan.lat, pilihan.lng]}
      autoPan={false}
      eventHandlers={{ remove: onTutup }}
    >
      <p className="text-[11px] font-semibold text-gray-700 mb-1.5">{pilihan.daftar.length} tiang di sini — pilih:</p>
      <div className="flex flex-col gap-1 min-w-[180px]">
        {pilihan.daftar.map(({ t, label }) => (
          <button
            key={`${t.kelompok}-${t.id}`}
            onClick={() => onPilih(t)}
            className="text-left rounded-md border border-gray-200 px-2 py-1 hover:bg-teal-50 hover:border-teal-400"
          >
            <span className="block text-[12px] font-semibold text-gray-900">{t.kode}</span>
            <span className="block text-[10px] text-gray-500">
              {label} · {t.kelompok}
            </span>
          </button>
        ))}
      </div>
    </Popup>
  );
}
