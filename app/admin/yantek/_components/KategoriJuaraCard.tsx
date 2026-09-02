"use client";

import type { LucideIcon } from "lucide-react";
import { CARD, DISPLAY, EYEBROW } from "@/app/admin/_ui";
import type { Kriteria, PetugasSkor } from "../_lib/juara";
import { MEDALI } from "./Podium";
import PetugasAvatar from "./PetugasAvatar";

/**
 * Kartu juara satu kriteria: emas dibesarkan, perak & perunggu jadi baris
 * pendukung. Bentuknya sengaja berbeda dari podium utama — kalau keduanya
 * memakai podium bertingkat, halaman jadi berisi lima panggung dan tidak ada
 * yang terasa utama lagi.
 */

interface KategoriJuaraCardProps {
  kriteria: Kriteria;
  icon: LucideIcon;
  tiga: PetugasSkor[];
  /** Urutan kartu — dipakai untuk menunda animasi masuk. */
  urutan: number;
  onPilih: (nama: string) => void;
}

export default function KategoriJuaraCard({
  kriteria,
  icon: Icon,
  tiga,
  urutan,
  onPilih,
}: KategoriJuaraCardProps) {
  const emas = tiga[0];
  const sisa = tiga.slice(1);

  /**
   * Rating tidak cukup dibaca dari rata-ratanya saja: 5,00 dari 84 laporan
   * bukan hal yang sama dengan 5,00 dari 1 laporan, dan sejak poin rating
   * dihitung mutu × bukti, jumlah itulah yang menentukan urutannya.
   */
  const adalahRating = kriteria.key === "rating";

  return (
    <div
      className={`${CARD} animate-juara-pop overflow-hidden`}
      style={{ animationDelay: `${0.5 + urutan * 0.08}s` }}
    >
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line">
        <Icon size={14} className="text-navy-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-ink truncate">{kriteria.label}</p>
          <p className="text-[10px] text-ink-muted truncate">{kriteria.catatan}</p>
        </div>
      </div>

      {!emas ? (
        <div className="py-8 text-center text-xs text-ink-muted">Belum ada data</div>
      ) : (
        <>
          {/* Pemenang kriteria */}
          <button
            onClick={() => onPilih(emas.nama)}
            className="relative w-full flex items-center gap-3 px-4 py-3 text-left overflow-hidden group"
            style={{ background: "linear-gradient(100deg,#fdf6e0,#fffdf7 62%)" }}
          >
            <span className="animate-juara-shine absolute inset-y-0 -left-1/3 w-1/3 bg-linear-to-r from-transparent via-white/85 to-transparent pointer-events-none" />
            <div className="relative shrink-0">
              <PetugasAvatar
                nama={emas.nama}
                ukuran={44}
                cincin={MEDALI[0].utama}
                className="transition-transform group-hover:scale-105"
              />
              <span
                className="absolute -bottom-0.5 -right-0.5 grid place-items-center w-4 h-4 rounded-full text-[9px] font-bold text-navy-900"
                style={{ background: MEDALI[0].balok, border: `1px solid ${MEDALI[0].terang}` }}
              >
                1
              </span>
            </div>
            <div className="relative min-w-0 flex-1">
              <p className={`${EYEBROW} text-[#8a6d1f]`}>Juara 1</p>
              <p className={`${DISPLAY} text-sm font-bold text-ink truncate`}>{emas.nama}</p>
              {adalahRating && (
                <p className="text-[10px] text-[#8a6d1f] truncate">
                  {emas.adaRating} dari {emas.totalWO} laporan dinilai
                </p>
              )}
            </div>
            <p className={`${DISPLAY} relative text-xl font-bold text-ink tabular-nums shrink-0`}>
              {kriteria.format(emas.nilai[kriteria.key] as number)}
            </p>
          </button>

          <div className="divide-y divide-line border-t border-line">
            {sisa.map((p, i) => (
              <button
                key={p.nama}
                onClick={() => onPilih(p.nama)}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-left hover:bg-surface transition-colors"
              >
                <span
                  className="grid place-items-center w-4.5 h-4.5 rounded-full text-[9px] font-bold text-navy-900 shrink-0"
                  style={{ background: MEDALI[i + 1].balok }}
                >
                  {i + 2}
                </span>
                <PetugasAvatar nama={p.nama} ukuran={26} cincin={MEDALI[i + 1].utama} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-medium text-ink truncate">{p.nama}</span>
                  {adalahRating && (
                    <span className="block text-[10px] text-ink-muted truncate">
                      {p.adaRating} dari {p.totalWO} laporan dinilai
                    </span>
                  )}
                </span>
                <span className="text-xs font-semibold text-ink-soft tabular-nums shrink-0">
                  {kriteria.format(p.nilai[kriteria.key] as number)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
