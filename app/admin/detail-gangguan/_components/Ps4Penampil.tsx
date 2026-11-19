"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Penampil foto besar Realisasi PS4: satu laporan per layar, pilih Masuk PS4 /
 * Tidak masuk → langsung lanjut ke laporan berikutnya. Daftar dibekukan saat
 * dibuka, jadi laporan yang baru diverifikasi tidak menggeser urutan.
 */

export interface LaporanPs4 {
  no_laporan: string;
  waktu_lapor: string | null;
  alamat_pelapor: string | null;
  keterangan_pelapor: string | null;
  penyebab: string | null;
  status_foto: string | null;
  ps4: "ya" | "tidak" | null;
  ps4_oleh: string | null;
  petugas: string | null;
  foto: { tahap: "pengerjaan" | "selesai"; path: string | null }[];
}

export type NilaiPs4 = "ya" | "tidak";

export const TAHAP_PS4 = [
  { kunci: "pengerjaan", label: "Dalam Pengerjaan" },
  { kunci: "selesai", label: "Selesai" },
] as const;

export const PILIHAN_PS4 = [
  { nilai: "ya", label: "Masuk PS4", aktif: "border-green-300 bg-green-50 text-green-700" },
  { nilai: "tidak", label: "Tidak masuk", aktif: "border-red-300 bg-red-50 text-red-700" },
] as const;

export const urlFotoPs4 = (path: string) =>
  supabaseBrowser.storage.from("apkt-foto").getPublicUrl(path).data.publicUrl;

interface Props {
  daftar: LaporanPs4[];
  mulai: number;
  boleh: boolean;
  /** null = tersimpan, selain itu pesan galat. */
  onTetapkan: (no: string, nilai: NilaiPs4 | null) => Promise<string | null>;
  onTutup: () => void;
}

const TOMBOL_NAV =
  "flex items-center gap-1 px-3 py-2 rounded-lg border border-white/20 text-sm text-white hover:bg-white/10 disabled:opacity-30";

export default function Ps4Penampil({ daftar, mulai, boleh, onTetapkan, onTutup }: Props) {
  const [isi, setIsi] = useState(daftar);
  const [i, setI] = useState(mulai);
  const [simpan, setSimpan] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const selesai = i >= isi.length;
  const l = selesai ? null : isi[i];
  const berikut = isi[i + 1];

  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      if (e.key === "Escape") onTutup();
      else if (e.key === "ArrowRight") setI((v) => Math.min(v + 1, isi.length));
      else if (e.key === "ArrowLeft") setI((v) => Math.max(v - 1, 0));
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  }, [isi.length, onTutup]);

  const pilih = async (nilai: NilaiPs4) => {
    if (!l || simpan) return;
    const batal = l.ps4 === nilai;
    setSimpan(true);
    const err = await onTetapkan(l.no_laporan, batal ? null : nilai);
    setSimpan(false);
    setGalat(err && `${l.no_laporan} gagal disimpan: ${err}`);
    if (err) return;
    setIsi((v) => v.map((x) => (x.no_laporan === l.no_laporan ? { ...x, ps4: batal ? null : nilai } : x)));
    if (!batal) setI((v) => v + 1);
  };

  const sudah = isi.filter((x) => x.ps4).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/90 animate-fade-in">
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <p className="flex-1 min-w-0 text-sm truncate">
          {l ? <><b>{l.no_laporan}</b>{l.petugas && <span className="text-white/70"> · {l.petugas}</span>}</> : "Selesai"}
        </p>
        <span className="text-sm tabular-nums text-white/70">
          {Math.min(i + 1, isi.length)} / {isi.length} · {sudah} diverifikasi
        </span>
        <button onClick={onTutup} className="p-1.5 rounded-lg hover:bg-white/10" title="Tutup (Esc)">
          <X size={20} />
        </button>
      </div>

      {l ? (
        <>
          <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 px-4">
            {TAHAP_PS4.map((t) => {
              const f = l.foto.find((x) => x.tahap === t.kunci);
              return (
                <div key={t.kunci} className="flex flex-col min-h-0">
                  <p className="text-xs text-white/70 mb-1">{t.label}</p>
                  {f?.path ? (
                    <a href={urlFotoPs4(f.path)} target="_blank" rel="noreferrer" className="flex-1 min-h-0" title="Buka ukuran asli">
                      {/* eslint-disable-next-line @next/next/no-img-element -- berkas Storage, ditampilkan apa adanya */}
                      <img src={urlFotoPs4(f.path)} alt={t.label} className="w-full h-full object-contain rounded-lg bg-black" />
                    </a>
                  ) : (
                    <div className="flex-1 rounded-lg border border-dashed border-white/30 flex items-center justify-center text-sm text-white/60">
                      {f ? "Berkas dihapus" : `Tanpa foto ${t.label}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-4 pt-3 text-xs text-white/80 space-y-0.5">
            <p>{l.waktu_lapor} · {l.penyebab || "—"}</p>
            <p className="truncate">{l.keterangan_pelapor || "—"}</p>
            {l.alamat_pelapor && <p className="truncate text-white/60">{l.alamat_pelapor}</p>}
          </div>

          {galat && <p className="mx-4 mt-2 text-xs text-red-100 bg-red-900/60 border border-red-400/40 rounded-lg p-2">{galat}</p>}

          <div className="flex items-center gap-2 px-4 py-3">
            <button onClick={() => setI((v) => Math.max(v - 1, 0))} disabled={i === 0} className={TOMBOL_NAV}>
              <ChevronLeft size={16} /> Sebelumnya
            </button>
            <div className="flex-1 flex justify-center gap-2">
              {PILIHAN_PS4.map((p) => (
                <button key={p.nilai} onClick={() => void pilih(p.nilai)} disabled={!boleh || simpan}
                  title={l.ps4 === p.nilai ? "Klik lagi untuk membatalkan" : undefined}
                  className={`min-w-32 px-5 py-2.5 rounded-lg border text-sm font-semibold disabled:opacity-60 ${
                    l.ps4 === p.nilai ? p.aktif : "border-white/30 bg-white text-ink hover:bg-slate-100"
                  }`}>
                  {simpan ? "Menyimpan…" : p.label}
                </button>
              ))}
            </div>
            <button onClick={() => setI((v) => v + 1)} className={TOMBOL_NAV}>
              Lewati <ChevronRight size={16} />
            </button>
          </div>

          {/* Muat foto laporan berikutnya lebih dulu — sinyal lemah tidak menunggu saat lanjut. */}
          <div className="hidden">
            {berikut?.foto.map((f) => f.path && (
              // eslint-disable-next-line @next/next/no-img-element -- pramuat
              <img key={f.path} src={urlFotoPs4(f.path)} alt="" />
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-white">
          <p className="text-lg font-semibold">Sudah sampai laporan terakhir</p>
          <p className="text-sm text-white/70">{sudah} dari {isi.length} laporan diverifikasi.</p>
          <div className="flex gap-2">
            <button onClick={() => setI(Math.max(isi.length - 1, 0))} className={TOMBOL_NAV}>
              <ChevronLeft size={16} /> Kembali
            </button>
            <button onClick={onTutup} className="px-4 py-2 rounded-lg bg-white text-ink text-sm font-semibold">Tutup</button>
          </div>
        </div>
      )}
    </div>
  );
}
