"use client";

import { useEffect, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Loader2, MapPin, Undo2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fotoKecil } from "@/lib/fotoKecil";
import { useToast } from "@/app/admin/_components/Toast";
import { nadaUjung, WARNA_NADA, type TitikUjungPeta } from "../_hooks/useUjungPeta";
import { GARIS, PANEL } from "../_ui";

/**
 * Persetujuan tegangan ujung satu per satu: peta menuju titiknya, kartu ini
 * menampilkan tegangan, alamat gardu, dan foto alat ukur, lalu "Setujui" atau
 * "Tolak" langsung pindah ke berikutnya. Tolak = dikembalikan ke petugas
 * (`kembalikan_tegangan_ujung`, alasan wajib). Yang selesai keluar dari
 * antrean, jadi nomor yang sama kini menunjuk titik berikutnya. Foto
 * berikutnya dimuat lebih dulu (tersembunyi) supaya tidak menunggu saat pindah.
 *
 * Papan ketik: ← → pindah, Enter setujui, T tolak.
 */

const m = (v: number | null) =>
  v === null ? "—" : v >= 1000 ? `${(v / 1000).toFixed(2).replace(".", ",")} km` : `${Math.round(v)} m`;

/** Alasan siap pakai — tinggal ketuk, masih bisa disunting. */
const ALASAN_CEPAT = ["Foto alat ukur tidak terbaca", "Angka tidak sesuai foto", "Bukan diukur di ujung jaringan"];
/** `in` masuk ke URL — dipecah supaya tidak menabrak batas panjang URL. */
const POTONG_KODE = 150;
const HABIS = "Semua tegangan ujung di saringan ini sudah diperiksa.";

const TOMBOL = "h-8 px-2.5 rounded-lg border text-xs flex items-center gap-1 disabled:opacity-40";
const kunciGardu = (ulp: string, kode: string) => `${ulp.toUpperCase()}|${kode.toUpperCase()}`;

interface Props {
  /** Titik "Menunggu verifikasi" yang lolos saringan, urut tampil. */
  antrean: TitikUjungPeta[];
  oleh: string;
  onSelesai: (id: string, hasil: "setuju" | "tolak") => void;
  onBuka: (t: TitikUjungPeta) => void;
  onTutup: () => void;
}

export default function PeriksaUjung({ antrean, oleh, onSelesai, onBuka, onTutup }: Props) {
  const toast = useToast();
  const [pos, setPos] = useState(0);
  const [sibuk, setSibuk] = useState(false);
  /** null = tidak sedang menolak; string = isian alasan. */
  const [alasan, setAlasan] = useState<string | null>(null);
  const [alamat, setAlamat] = useState<Map<string, string>>(new Map());
  const n = antrean.length;
  const i = Math.min(pos, Math.max(0, n - 1));
  const kini = n > 0 ? antrean[i] : undefined;
  const berikut = n > 1 ? antrean[(i + 1) % n] : undefined;

  // Alamat gardu dibaca sekali untuk seluruh antrean, bukan per titik, supaya
  // pindah ke berikutnya tidak menunggu kueri.
  const kodeGardu = [...new Set(antrean.map((t) => t.gardu_kode.toUpperCase()))].sort().join(",");
  useEffect(() => {
    if (!kodeGardu) return;
    let hidup = true;
    const kode = kodeGardu.split(",");
    void (async () => {
      const peta = new Map<string, string>();
      for (let j = 0; j < kode.length; j += POTONG_KODE) {
        const { data } = await supabaseBrowser
          .from("gardu")
          .select("kode,ulp,alamat")
          .in("kode", kode.slice(j, j + POTONG_KODE));
        for (const g of data ?? []) {
          if (g.alamat) peta.set(kunciGardu(String(g.ulp), String(g.kode)), String(g.alamat));
        }
      }
      if (hidup) setAlamat(peta);
    })();
    return () => {
      hidup = false;
    };
  }, [kodeGardu]);

  const ke = (j: number) => {
    if (n === 0) return;
    const b = (j + n) % n;
    setPos(b);
    setAlasan(null);
    onBuka(antrean[b]);
  };

  /** Antrean memendek satu; nomor yang sama = titik berikutnya. */
  const lanjut = (id: string) => {
    setAlasan(null);
    const sisa = antrean.filter((t) => t.id !== id);
    if (sisa.length === 0) {
      toast.success(HABIS);
      return;
    }
    const b = i % sisa.length;
    setPos(b);
    onBuka(sisa[b]);
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
    onSelesai(kini.id, "setuju");
    lanjut(kini.id);
  };

  const tolak = async () => {
    const isi = alasan?.trim();
    if (!kini || sibuk || !isi) return;
    setSibuk(true);
    const { error } = await supabaseBrowser.rpc("kembalikan_tegangan_ujung", { p_id: kini.id, p_alasan: isi, p_nama: oleh });
    setSibuk(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    onSelesai(kini.id, "tolak");
    toast.success(`${kini.gardu_kode} jurusan ${kini.jurusan} dikembalikan ke petugas.`);
    lanjut(kini.id);
  };

  // Papan ketik — diabaikan saat mengetik di isian (alasan punya tombolnya sendiri).
  useEffect(() => {
    const tekan = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight") { e.preventDefault(); ke(i + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); ke(i - 1); }
      else if (e.key === "Enter" && alasan === null) { e.preventDefault(); void setujui(); }
      else if ((e.key === "t" || e.key === "T") && alasan === null) { e.preventDefault(); setAlasan(""); }
    };
    window.addEventListener("keydown", tekan);
    return () => window.removeEventListener("keydown", tekan);
  });

  const alamatKini = kini ? alamat.get(kunciGardu(kini.ulp, kini.gardu_kode)) : undefined;

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
          <p className="text-[11px] text-gray-300 flex gap-1 -mt-1">
            <MapPin size={12} className="shrink-0 mt-px text-gray-500" />
            <span>{alamatKini ?? "Alamat gardu belum ada di master"}</span>
          </p>
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

          {alasan !== null ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1">
                {ALASAN_CEPAT.map((x) => (
                  <button
                    key={x}
                    onClick={() => setAlasan(x)}
                    className={`px-2 py-0.5 rounded-md border text-[10px] ${alasan === x ? "border-orange-400 text-orange-200" : "text-gray-400"}`}
                    style={alasan === x ? undefined : { borderColor: GARIS }}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <textarea
                autoFocus
                value={alasan}
                onChange={(e) => setAlasan(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void tolak(); }
                  else if (e.key === "Escape") setAlasan(null);
                }}
                rows={2}
                placeholder="Alasan — petugas harus tahu apa yang diperbaiki"
                className="w-full rounded-lg border bg-black/30 px-2 py-1.5 text-xs text-[#e2e8f0] placeholder:text-gray-500 focus:outline-none focus:border-orange-400"
                style={{ borderColor: GARIS }}
              />
              <div className="flex gap-1.5">
                <button onClick={() => setAlasan(null)} className={TOMBOL} style={{ borderColor: GARIS }}>
                  Batal
                </button>
                <button
                  onClick={() => void tolak()}
                  disabled={sibuk || !alasan.trim()}
                  className="flex-1 h-8 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Undo2 size={13} />}
                  Tolak & berikutnya
                </button>
              </div>
            </div>
          ) : (
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
              <button
                onClick={() => setAlasan("")}
                className={`${TOMBOL} text-orange-300`}
                style={{ borderColor: GARIS }}
                title="Tolak — dikembalikan ke petugas (T)"
              >
                <Undo2 size={13} /> Tolak
              </button>
              <button onClick={() => ke(i + 1)} className={TOMBOL} style={{ borderColor: GARIS }} title="Lewati (→)">
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <p className="text-[10px] text-gray-500">
            Papan ketik: ← → pindah · Enter setujui · T tolak. Tolak = dikembalikan ke petugas untuk diperbaiki.
          </p>
        </>
      )}
    </div>
  );
}
