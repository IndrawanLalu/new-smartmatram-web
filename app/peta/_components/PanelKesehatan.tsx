"use client";

import { Loader2, X } from "lucide-react";
import { WARNA_KESEHATAN, type SaringKesehatan, type StatusKesehatan } from "../_hooks/useKesehatanPeta";
import { GARIS, JUDUL_BAGIAN, PANEL } from "../_ui";

/** Saringan lapisan kesehatan gardu. ULP mengikuti panel kiri. */

const STATUS: { k: StatusKesehatan; label: string }[] = [
  { k: "merah", label: "Bermasalah" },
  { k: "kuning", label: "Mendekati" },
  { k: "hijau", label: "Sehat" },
];

const CHIP = "px-2 py-1 rounded-lg text-[11px] border transition-colors";
const chip = (on: boolean) => `${CHIP} ${on ? "border-[#00897B] bg-[#00897B]/20 text-[#e2e8f0]" : "border-[#1e3552] text-gray-500"}`;

interface Props {
  saring: SaringKesehatan;
  onSaring: (s: SaringKesehatan) => void;
  hitung: { merah: number; kuning: number; hijau: number; sisip: number; jurusan160: number };
  jumlah: number;
  sibuk: boolean;
  galat: string | null;
  onTutup: () => void;
}

export default function PanelKesehatan({ saring, onSaring, hitung, jumlah, sibuk, galat, onTutup }: Props) {
  const alihStatus = (s: StatusKesehatan) => {
    const b = new Set(saring.status);
    if (b.has(s)) b.delete(s);
    else b.add(s);
    onSaring({ ...saring, status: b });
  };

  return (
    <div className="w-[300px] rounded-xl border shadow-2xl p-3 space-y-3" style={{ background: PANEL, borderColor: GARIS }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[#e2e8f0]">Kesehatan gardu</p>
        <button onClick={onTutup} className="p-1 rounded text-gray-400 hover:text-white" aria-label="Tutup lapisan kesehatan gardu">
          <X size={15} />
        </button>
      </div>
      <p className="text-[11px] text-gray-500 leading-relaxed">
        Dari pengukuran terakhir. Bermasalah = beban &gt; 80 %, jatuh tegangan &gt; 10 %, ujung &lt; 198 V, atau jurusan &gt; 160 A.
        Mendekati = beban ≥ 70 %, jatuh ≥ 8 %, atau unbalance ≥ 20 %.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {STATUS.map((s) => (
          <button key={s.k} onClick={() => alihStatus(s.k)} className={chip(saring.status.has(s.k))}>
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: WARNA_KESEHATAN[s.k] }} />
            {s.label} <span className="opacity-60">{hitung[s.k]}</span>
          </button>
        ))}
      </div>

      <div>
        <p className={JUDUL_BAGIAN}>Sorotan</p>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <button onClick={() => onSaring({ ...saring, hanyaSisip: !saring.hanyaSisip })} className={chip(saring.hanyaSisip)}>
            Calon gardu sisip <span className="opacity-60">{hitung.sisip}</span>
          </button>
          <button onClick={() => onSaring({ ...saring, hanyaJurusan160: !saring.hanyaJurusan160 })} className={chip(saring.hanyaJurusan160)}>
            Jurusan &gt; 160 A <span className="opacity-60">{hitung.jurusan160}</span>
          </button>
        </div>
      </div>

      <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
        {sibuk && <Loader2 size={11} className="animate-spin" />}
        {galat ? <span className="text-red-300">{galat}</span> : `${jumlah} gardu ditampilkan`}
      </p>
    </div>
  );
}
