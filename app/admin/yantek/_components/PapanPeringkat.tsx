"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ListOrdered, Search, X } from "lucide-react";
import { CARD, DISPLAY, FIELD } from "@/app/admin/_ui";
import { KRITERIA, POIN_NETRAL, type KriteriaKey, type PetugasSkor } from "../_lib/juara";
import { MEDALI } from "./Podium";
import PetugasAvatar from "./PetugasAvatar";

/**
 * Klasemen lengkap — kelanjutan podium, bukan pengulangannya.
 *
 * Setiap sel kriteria memuat nilai asli DAN bilah poin peringkatnya, supaya
 * terlihat bukan cuma "siapa paling cepat" tapi seberapa jauh jaraknya dari
 * yang lain. Peringkat 1 tiap kriteria diberi titik emas kecil.
 */

interface PapanPeringkatProps {
  papan: PetugasSkor[];
  onPilih: (nama: string) => void;
}

/** Berapa baris ditampilkan sebelum tombol "muat lagi" — daftar petugas satu
 *  ULP bisa puluhan, dan yang dibaca sungguhan hanya bagian atas. */
const PER_HALAMAN = 15;

export default function PapanPeringkat({ papan, onPilih }: PapanPeringkatProps) {
  const [cari, setCari] = useState("");
  const [tampil, setTampil] = useState(PER_HALAMAN);

  /** Nilai terbaik tiap kriteria — untuk menandai sel dengan titik emas.
   *  Yang disimpan NILAI-nya, bukan namanya: rating 5,00 sering dicapai banyak
   *  orang sekaligus, dan menandai satu saja (yang kebetulan terbaca duluan)
   *  membuat sembilan orang lain terlihat kalah padahal seri. */
  const puncak = useMemo(() => {
    const out = {} as Record<KriteriaKey, number | null>;
    for (const k of KRITERIA) {
      let terbaik: number | null = null;
      for (const p of papan) {
        const v = p.nilai[k.key];
        if (v === null) continue;
        if (terbaik === null || (k.tinggiBaik ? v > terbaik : v < terbaik)) terbaik = v;
      }
      out[k.key] = terbaik;
    }
    return out;
  }, [papan]);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return q ? papan.filter((p) => p.nama.toLowerCase().includes(q)) : papan;
  }, [papan, cari]);

  const terlihat = tersaring.slice(0, tampil);

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="flex items-center gap-3 px-4 py-3 border-b border-line flex-wrap">
        <ListOrdered size={14} className="text-navy-600 shrink-0" />
        <p className="text-xs font-semibold text-ink">Klasemen Lengkap</p>
        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-muted" />
          <input
            value={cari}
            onChange={(e) => {
              setCari(e.target.value);
              setTampil(PER_HALAMAN);
            }}
            placeholder="Cari petugas..."
            className={`${FIELD} pl-8 w-48 text-xs`}
          />
        </div>
        {cari && (
          <button onClick={() => setCari("")} className="p-1 rounded text-ink-muted hover:text-ink">
            <X className="w-3 h-3" />
          </button>
        )}
        <span className="text-xs text-ink-muted">{tersaring.length} petugas</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="py-2.5 px-3 w-10 bg-navy-50 text-navy-600 font-semibold border-b border-line text-center">
                #
              </th>
              <th className="py-2.5 px-3 text-left bg-navy-50 text-navy-600 font-semibold border-b border-line">
                Petugas
              </th>
              <th className="py-2.5 px-3 w-40 bg-navy-50 text-navy-600 font-semibold border-b border-line text-left">
                Skor Gabungan
              </th>
              {KRITERIA.map((k) => (
                <th
                  key={k.key}
                  title={k.catatan}
                  className="py-2.5 px-3 bg-navy-50 text-navy-600 font-semibold border-b border-line text-center whitespace-nowrap"
                >
                  {k.pendek}
                </th>
              ))}
              <th className="bg-navy-50 border-b border-line w-8" />
            </tr>
          </thead>
          <tbody>
            {terlihat.map((p) => {
              const medali = p.peringkat <= 3 ? MEDALI[p.peringkat - 1] : null;
              return (
                <tr
                  key={p.nama}
                  onClick={() => onPilih(p.nama)}
                  className="border-t border-line hover:bg-surface transition-colors cursor-pointer"
                >
                  <td className="py-2 px-3 text-center">
                    {medali ? (
                      <span
                        className="inline-grid place-items-center w-5.5 h-5.5 rounded-full text-[10px] font-bold text-navy-900"
                        style={{ background: medali.balok }}
                      >
                        {p.peringkat}
                      </span>
                    ) : (
                      <span className="text-ink-muted tabular-nums">{p.peringkat}</span>
                    )}
                  </td>

                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <PetugasAvatar
                        nama={p.nama}
                        ukuran={28}
                        cincin={medali?.utama}
                        tebalCincin={medali ? 2 : 1}
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-ink truncate">{p.nama}</p>
                        <p className="text-[10px] text-ink-muted">
                          {p.adaRating} dari {p.totalWO} WO dinilai
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className={`${DISPLAY} w-9 shrink-0 text-sm font-bold text-ink tabular-nums`}>
                        {p.skor.toFixed(1)}
                      </span>
                      <span className="flex-1 h-1.5 rounded-full bg-navy-50 overflow-hidden">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${p.skor}%`,
                            background: medali ? medali.balok : "var(--color-navy-400)",
                          }}
                        />
                      </span>
                    </div>
                  </td>

                  {KRITERIA.map((k) => {
                    const v = p.nilai[k.key];
                    const poin = p.poin[k.key];
                    return (
                      <td key={k.key} className="py-2 px-3 text-center">
                        {v === null ? (
                          <span
                            className="text-ink-muted"
                            title={
                              k.key === "rating"
                                ? "Belum ada penilaian pelanggan — poin rating 0"
                                : `Tanpa data ${k.pendek} — diberi poin netral ${POIN_NETRAL} pada skor gabungan`
                            }
                          >
                            n/a
                          </span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <span
                              className="flex items-center gap-1 font-semibold text-ink tabular-nums whitespace-nowrap"
                              // Rata-rata 5,00 dicapai banyak orang sekaligus; yang membedakan
                              // poinnya adalah banyaknya penilaian, dan itu tidak terbaca dari
                              // angka rata-rata saja.
                              title={
                                k.key === "rating"
                                  ? `${p.bintangLima} bintang 5 dari ${p.adaRating} penilaian — poin ${Math.round(poin ?? 0)} (mutu × bukti)`
                                  : undefined
                              }
                            >
                              {puncak[k.key] === v && (
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{ background: MEDALI[0].utama }}
                                  title={`Nilai ${k.pendek} terbaik di papan ini`}
                                />
                              )}
                              {k.format(v)}
                            </span>
                            <span className="w-12 h-1 rounded-full bg-navy-50 overflow-hidden">
                              <span
                                className="block h-full rounded-full bg-navy-400"
                                style={{ width: `${poin ?? 0}%` }}
                              />
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}

                  <td className="py-2 px-3 text-right">
                    <ChevronRight size={13} className="inline text-ink-muted" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {tampil < tersaring.length && (
        <button
          onClick={() => setTampil((t) => t + PER_HALAMAN)}
          className="w-full py-2.5 text-xs font-medium text-navy-600 border-t border-line hover:bg-surface transition-colors"
        >
          Muat {Math.min(PER_HALAMAN, tersaring.length - tampil)} petugas lagi
        </button>
      )}
    </div>
  );
}
