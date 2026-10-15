"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fotoKecil } from "@/lib/fotoKecil";
import { useToast } from "@/app/admin/_components/Toast";
import { nadaUjung, WARNA_NADA, type TitikUjungPeta } from "../_hooks/useUjungPeta";
import { GARIS, PANEL } from "../_ui";

/**
 * Persetujuan tegangan ujung satu per satu: peta menuju titiknya, kartu ini
 * menampilkan tegangan + foto alat ukur, lalu "Setujui" langsung pindah ke
 * berikutnya. Yang disetujui keluar dari antrean, jadi nomor yang sama kini
 * menunjuk titik berikutnya. Foto berikutnya dimuat lebih dulu (tersembunyi)
 * supaya tidak menunggu saat pindah.
 *
 * Papan ketik: ← → pindah, Enter setujui.
 */

const m = (v: number | null) =>
  v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2).replace(".", ",")} km` : `${Math.round(v)} m`;

const TOMBOL = "h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1 disabled:opacity-40";

interface Props {
  /** Titik "Menunggu verifikasi" yang lolos saringan, urut tampil. */
  antrean: TitikUjungPeta[];
  oleh: string;
  onDisetujui: (id: string) => void;
  onBuka: (t: TitikUjungPeta) => void;
  onTutup: () => void;
}

export default function PeriksaUjung({ antrean, oleh, onDisetujui, onBuka, onTutup }: Props) {
  const toast = useToast();
  const [pos, setPos] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  const n = antrean.length;
  const i = Math.min(pos, Math.max(0, n - 1));
  const kini = n > 0 ? antrean[i] : undefined;
  const berikut = n > 1 ? antrean[(i + 1) % n] : undefined;

  const ke = (j: number) => {
    if (n === 0) return;
    const b = (j + n) % n;
    setPos(b);
    onBuka(antrean[b]);
  };

  const setujui = async () => {
    if (!kini || sibuk) return;
    setSibuk(true);
    const { error } = await supabaseBrowser.rpc("setujui_tegangan_ujung", { p_id: kini.id, p_nama: oleh });
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onDisetujui(kini.id);
    // Antrean memendek satu; nomor yang sama = titik berikutnya.
    const sisa = antrean.filter((t) => t.id !== kini.id);
    if (sisa.length === 0) {
      toast.success("Semua tegangan ujung di saringan ini sudah disetujui.");
      return;
    }
    const b = i % sisa.length;
    setPos(b);
    onBuka(sisa[b]);
  };

  // Papan ketik — diabaikan saat mengetik di isian.
  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); ke(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); ke(i - 1); }
      else if (e.key === "Enter") { e.preventDefault(); void setujui(); }
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  });

  return (
    <div className="w-[300px] rounded-xl border shadow-2xl p-3 space-y-2.5 text-[#e2e8f0]" style={{ background: PANEL, borderColor: GARIS }}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Periksa satu per satu</p>
        <button onClick={onTutup} className="p-1 rounded text-gray-400 hover:text-white" aria-label="Tutup periksa satu per satu">
          <X size={15} />
        </button>
      </div>

      {!kini ? (
        <p className="text-xs text-gray-400">Tidak ada yang menunggu verifikasi di saringan ini.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: WARNA_NADA[nadaUjung(kini.v_min)] }} />
            <p className="text-sm font-semibold truncate">
              {kini.gardu_kode} · jurusan {kini.jurusan}
            </p>
            <span className="ml-auto text-[11px] text-gray-400 tabular-nums">{i + 1} / {n}</span>
          </div>
          <p className="text-xs tabular-nums">
            R-N <b>{kini.v_rn}</b> · S-N <b>{kini.v_sn}</b> · T-N <b>{kini.v_tn}</b> V
          </p>
          <p className="text-[11px] text-gray-400">
            {kini.tgl_ukur} · {kini.petugas_nama ?? "—"}
            <br />
            {kini.tiang_rekomendasi_kode
              ? `${m(kini.jarak_rekomendasi_m)} dari ujung terjauh (${kini.tiang_rekomendasi_kode})`
              : "Tanpa rekomendasi tiang ujung"}
          </p>
          {kini.foto_url && (
            <a href={kini.foto_url} target="_blank" rel="noreferrer" title="Buka foto ukuran penuh" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto Storage, diperkecil server web */}
              <img key={kini.id} src={fotoKecil(kini.foto_url, 384)} alt="Foto alat ukur" className="h-44 w-full object-contain rounded bg-black/40" />
            </a>
          )}
          {berikut?.foto_url && (
            // eslint-disable-next-line @next/next/no-img-element -- dimuat lebih dulu, tidak tampil
            <img src={fotoKecil(berikut.foto_url, 384)} alt="" aria-hidden className="hidden" />
          )}

          <div className="flex items-center gap-1.5">
            <button onClick={() => ke(i - 1)} className={TOMBOL} style={{ borderColor: GARIS }} title="Sebelumnya (←)">
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => void setujui()}
              disabled={sibuk}
              className="flex-1 h-8 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
              title="Setujui lalu ke berikutnya (Enter)"
            >
              {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Setujui & berikutnya
            </button>
            <button onClick={() => ke(i + 1)} className={TOMBOL} style={{ borderColor: GARIS }} title="Lewati (→)">
              Lewati <ChevronRight size={14} />
            </button>
          </div>
          <p className="text-[10px] text-gray-500">Papan ketik: ← → pindah · Enter setujui</p>
        </>
      )}
    </div>
  );
}
