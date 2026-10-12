"use client";

import { Loader2 } from "lucide-react";
import { km } from "@/app/admin/jtm/_lib/tampilan";
import type { SegmenSimpul } from "../_hooks/useSegmenDaftar";
import { GARIS } from "../_ui";

/**
 * Segmen satu penyulang di folder JTM, bertingkat induk → cabang (12 Okt 2026).
 * Mengetuk satu segmen = "Segmen ini saja": peta hanya menggambar segmen itu
 * dan rinciannya terbuka di kanan.
 *
 * Nama segmen TIDAK dipotong — nama seperti "SEGMENT LEMBAR - 1.2B FCO PANTAI
 * INDUK" baru bisa dibedakan dari saudaranya di ujung kalimat.
 */

interface Props {
  daftar: SegmenSimpul[] | undefined;
  memuat: boolean;
  galat: string | null;
  aktif: string | null;
  onSegmen: (s: SegmenSimpul) => void;
}

function BarisSegmen({ s, aktif, onSegmen }: { s: SegmenSimpul; aktif: string | null; onSegmen: (s: SegmenSimpul) => void }) {
  const nyala = aktif === s.id;
  return (
    <div>
      <button
        onClick={() => onSegmen(s)}
        title="Segmen ini saja"
        className={`w-full text-left rounded-lg px-2 py-1 ${
          nyala ? "bg-[#5eead4]/15 ring-1 ring-[#5eead4]/60" : "hover:bg-white/5"
        }`}
      >
        <span className={`block text-[11px] leading-snug break-words ${nyala ? "text-[#5eead4] font-semibold" : "text-gray-200"}`}>
          {s.nama}
        </span>
        <span className="block text-[10px] text-gray-500 tabular-nums">
          {km(s.panjangKm, 2)} · {s.jumlahTiang.toLocaleString("id-ID")} tiang
          {s.cabang.length > 0 ? ` · ${s.cabang.length} cabang` : ""}
        </span>
      </button>
      {s.cabang.length > 0 && (
        <div className="ml-3 border-l" style={{ borderColor: GARIS }}>
          {s.cabang.map((c) => (
            <BarisSegmen key={c.id} s={c} aktif={aktif} onSegmen={onSegmen} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PohonSegmenJtm({ daftar, memuat, galat, aktif, onSegmen }: Props) {
  return (
    <div className="ml-5 mb-1 border-l" style={{ borderColor: GARIS }}>
      {galat ? (
        <p className="px-3 py-1.5 text-[11px] text-red-300">{galat}</p>
      ) : memuat ? (
        <p className="px-3 py-1.5 text-[11px] text-gray-400 flex items-center gap-2">
          <Loader2 size={11} className="animate-spin" /> Memuat segmen…
        </p>
      ) : !daftar || daftar.length === 0 ? (
        <p className="px-3 py-1.5 text-[11px] text-gray-500">Belum ada segmen bertiang di penyulang ini.</p>
      ) : (
        daftar.map((s) => <BarisSegmen key={s.id} s={s} aktif={aktif} onSegmen={onSegmen} />)
      )}
    </div>
  );
}
