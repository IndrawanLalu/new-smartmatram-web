"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Scissors, TriangleAlert } from "lucide-react";
import { km } from "@/app/admin/jtm/_lib/tampilan";
import type { PohonPenyulang, SectionSimpul, SegmenSimpul } from "../_hooks/useSegmenDaftar";
import { GARIS } from "../_ui";

/**
 * Segmen satu penyulang di folder JTM: Penyulang → Section (hulu → hilir) →
 * Segmen (27 Okt 2026, sebelumnya induk → cabang). Mengetuk section = section
 * itu disorot di peta; mengetuk segmen = "Segmen ini saja". Segmen yang
 * melewati keypoint ditandai ⚠ — namanya tidak sesuai dengan section yang
 * tergambar, dan Pecah langsung dari barisnya.
 *
 * Nama segmen TIDAK dipotong — nama seperti "SEGMENT LEMBAR - 1.2B FCO PANTAI
 * INDUK" baru bisa dibedakan dari saudaranya di ujung kalimat.
 */

interface Props {
  pohon: PohonPenyulang | undefined;
  memuat: boolean;
  galat: string | null;
  aktif: string | null;
  sectionAktif: string | null;
  onSegmen: (s: SegmenSimpul) => void;
  onSection: (s: SectionSimpul) => void;
  /** undefined = tidak berhak memecah. */
  onPecah?: (s: SegmenSimpul) => void;
}

interface BarisProps {
  s: SegmenSimpul;
  aktif: string | null;
  onSegmen: (s: SegmenSimpul) => void;
  onPecah?: (s: SegmenSimpul) => void;
}

function BarisSegmen({ s, aktif, onSegmen, onPecah }: BarisProps) {
  const nyala = aktif === s.id;
  return (
    <div className={`group flex items-start rounded-lg ${nyala ? "bg-[#5eead4]/15 ring-1 ring-[#5eead4]/60" : "hover:bg-white/5"}`}>
      <button onClick={() => onSegmen(s)} title="Segmen ini saja" className="flex-1 min-w-0 text-left px-2 py-1">
        <span className={`block text-[11px] leading-snug break-words ${nyala ? "text-[#5eead4] font-semibold" : "text-gray-200"}`}>
          {s.nama}
        </span>
        <span className="block text-[10px] text-gray-500 tabular-nums">
          {km(s.panjangKm, 2)} · {s.jumlahTiang.toLocaleString("id-ID")} tiang
        </span>
        {s.lintas && (
          <span className="mt-0.5 flex items-start gap-1 text-[10px] leading-snug text-amber-300">
            <TriangleAlert size={10} className="mt-px shrink-0" /> Melewati keypoint: {s.lintas}
          </span>
        )}
      </button>
      {onPecah && (
        <button
          onClick={() => onPecah(s)}
          title="Pecah segmen"
          className={`shrink-0 m-1 p-1 rounded-md hover:bg-white/10 ${
            s.lintas ? "text-amber-300" : "text-gray-500 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
          }`}
        >
          <Scissors size={11} />
        </button>
      )}
    </div>
  );
}

function BarisSection({ s, sectionAktif, onSection, ...baris }: { s: SectionSimpul; sectionAktif: string | null; onSection: (s: SectionSimpul) => void } & Omit<BarisProps, "s">) {
  const lintas = s.segmen.filter((x) => x.lintas).length;
  // Section yang memuat segmen bertanda terbuka sendiri — itulah yang perlu dilihat.
  const [buka, setBuka] = useState(lintas > 0);
  const nyala = sectionAktif === s.id;
  return (
    <div>
      <div className={`flex items-start rounded-lg ${nyala ? "bg-[#F472B6]/10 ring-1 ring-[#F472B6]/50" : "hover:bg-white/5"}`}>
        <button
          onClick={() => setBuka((b) => !b)}
          className="shrink-0 pl-1.5 pt-1.5 text-gray-500 hover:text-gray-300"
          title={buka ? "Tutup segmen" : "Lihat segmen"}
        >
          {buka ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </button>
        <button onClick={() => onSection(s)} title="Sorot section di peta" className="flex-1 min-w-0 text-left px-1.5 py-1">
          <span className={`block text-[11px] leading-snug break-words font-semibold ${nyala ? "text-[#F9A8D4]" : "text-gray-300"}`}>
            {s.nama}
          </span>
          <span className="block text-[10px] text-gray-500 tabular-nums">
            Section · {km(s.panjangKm, 2)} · {s.segmen.length} segmen
            {lintas > 0 && <span className="text-amber-300"> · ⚠ {lintas}</span>}
          </span>
        </button>
      </div>
      {buka && (
        <div className="ml-3 border-l" style={{ borderColor: GARIS }}>
          {s.segmen.length === 0 ? (
            <p className="px-2 py-1 text-[10px] text-gray-500">Belum ada segmen di section ini.</p>
          ) : (
            s.segmen.map((x) => <BarisSegmen key={x.id} s={x} {...baris} />)
          )}
        </div>
      )}
    </div>
  );
}

export default function PohonSegmenJtm({ pohon, memuat, galat, aktif, sectionAktif, onSegmen, onSection, onPecah }: Props) {
  const baris = { aktif, onSegmen, onPecah };
  return (
    <div className="ml-5 mb-1 border-l" style={{ borderColor: GARIS }}>
      {galat ? (
        <p className="px-3 py-1.5 text-[11px] text-red-300">{galat}</p>
      ) : memuat ? (
        <p className="px-3 py-1.5 text-[11px] text-gray-400 flex items-center gap-2">
          <Loader2 size={11} className="animate-spin" /> Memuat section & segmen…
        </p>
      ) : !pohon || (pohon.section.length === 0 && pohon.lain.length === 0) ? (
        <p className="px-3 py-1.5 text-[11px] text-gray-500">Belum ada segmen bertiang di penyulang ini.</p>
      ) : (
        <>
          {pohon.section.map((s) => (
            <BarisSection key={s.id} s={s} sectionAktif={sectionAktif} onSection={onSection} {...baris} />
          ))}
          {pohon.lain.length > 0 && (
            <>
              {pohon.section.length > 0 && (
                <p className="px-2 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Section belum tersusun</p>
              )}
              {pohon.lain.map((x) => <BarisSegmen key={x.id} s={x} {...baris} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
