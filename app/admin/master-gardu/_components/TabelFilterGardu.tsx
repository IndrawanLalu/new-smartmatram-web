"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ListFilter, MapPin } from "lucide-react";
import IkonKolom from "@/app/admin/_kit/IkonKolom";
import { kunciKondisi as kunciHar, type KeadaanHar } from "../_lib/kondisiGardu";
import { judulKondisi, nilaiTampil, type GarduFilter, type Kondisi, type NilaiHar } from "../_lib/filterGardu";

const PER_HAL = 20;
const TH = "px-4 py-2.5 text-xs font-semibold text-accent-deep text-left";
const TD = "px-4 py-2.5";
const KOSONG = <span className="text-ink-muted">—</span>;
const TOMBOL_HAL =
  "w-7 h-7 flex items-center justify-center rounded border border-line text-ink-soft hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed";

const fmtTgl = (s: string) => s.slice(0, 10).split("-").reverse().join("-");

interface Props {
  hasil: GarduFilter[];
  kondisi: Kondisi[];
  har: Map<string, KeadaanHar>;
  nilaiHar: NilaiHar;
  namaItem: (kode: string) => string;
  memuat: boolean;
  adaKondisi: boolean;
}

export default function TabelFilterGardu({ hasil, kondisi, har, nilaiHar, namaItem, memuat, adaKondisi }: Props) {
  const [page, setPage] = useState(1);
  const totalHal = Math.max(1, Math.ceil(hasil.length / PER_HAL));
  // Hasil menyusut saat kondisi ditambah — halaman ikut dijepit, bukan kosong.
  const hal = Math.min(page, totalHal);
  const isi = hasil.slice((hal - 1) * PER_HAL, hal * PER_HAL);

  if (!adaKondisi || !hasil.length)
    return (
      <div className="bg-white rounded-xl border border-line flex flex-col items-center gap-2 py-14 text-ink-soft">
        <ListFilter size={28} className="opacity-40" />
        <p className="text-sm">
          {!adaKondisi
            ? "Tambah kondisi di atas — misalnya Jenis Cut Out: Keramik dan Jenis Arrester: Keramik."
            : memuat ? "Menyaring gardu…" : "Tidak ada gardu yang memenuhi semua kondisi."}
        </p>
      </div>
    );

  return (
    <div className="bg-white rounded-xl border border-line overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead className="kepala-kit">
            <tr className="bg-surface">
              <th className={TH}><IkonKolom teks="No. Gardu" />No. Gardu</th>
              <th className={TH}>ULP</th>
              <th className={TH}><IkonKolom teks="Penyulang" />Penyulang</th>
              <th className={TH}><IkonKolom teks="KVA" />kVA</th>
              <th className={TH}><IkonKolom teks="Alamat" />Alamat</th>
              <th className={TH}>Koordinat</th>
              <th className={TH}><IkonKolom teks="HAR Terakhir" />HAR terakhir</th>
              {kondisi.map((k) => <th key={k.id} className={`${TH} bg-brand-50`}>{judulKondisi(k, namaItem)}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {isi.map((g) => {
              const kunci = kunciHar(g.kode, g.ulp);
              const tglHar = har.get(kunci)?.tgl;
              return (
                <tr key={`${g.kode}|${g.ulp}`} className="hover:bg-navy-50/60">
                  <td className={`${TD} font-semibold text-ink`}>{g.kode}</td>
                  <td className={`${TD} text-ink-soft`}>{g.ulp}</td>
                  <td className={`${TD} text-ink-soft`}>{g.penyulang ?? KOSONG}</td>
                  <td className={`${TD} text-ink`}>{g.kva_master ?? KOSONG}</td>
                  <td className={`${TD} text-ink-soft max-w-48 truncate`} title={g.alamat ?? ""}>{g.alamat ?? KOSONG}</td>
                  <td className={TD}>
                    {g.lat !== null && g.lng !== null ? (
                      <a
                        href={`https://www.google.com/maps?q=${g.lat},${g.lng}`} target="_blank" rel="noopener"
                        className="inline-flex items-center gap-1 font-mono text-xs text-navy-600 hover:underline"
                        title="Buka di Google Maps"
                      >
                        <MapPin size={12} /> {g.lat.toFixed(6)}, {g.lng.toFixed(6)}
                      </a>
                    ) : KOSONG}
                  </td>
                  <td className={`${TD} text-ink-soft`}>{tglHar ? fmtTgl(tglHar) : KOSONG}</td>
                  {kondisi.map((k) => (
                    <td key={k.id} className={`${TD} bg-brand-50/40`}>
                      {nilaiTampil(g, kunci, k, nilaiHar).map((p, i) => (
                        <span key={i} className={p.cocok ? "font-semibold text-ink" : "text-ink-muted"}>
                          {i > 0 && <span className="text-ink-muted font-normal"> · </span>}
                          {p.teks}
                        </span>
                      ))}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalHal > 1 && (
        <div className="px-5 py-3 border-t border-line flex items-center justify-between">
          <span className="text-sm text-ink-soft">{hasil.length} gardu · Hal {hal}/{totalHal}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(Math.max(1, hal - 1))} disabled={hal === 1} className={TOMBOL_HAL}><ChevronLeft size={14} /></button>
            <button onClick={() => setPage(Math.min(totalHal, hal + 1))} disabled={hal === totalHal} className={TOMBOL_HAL}><ChevronRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
