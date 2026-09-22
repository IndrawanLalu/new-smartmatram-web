"use client";

import { useState } from "react";
import { Check, Loader2, MapPin, Images, Ban } from "lucide-react";
import { CARD, BTN_GHOST } from "@/app/admin/_ui";
import { useToast } from "@/app/admin/_components/Toast";
import type { BarisPemeliharaan } from "../_hooks/usePemeliharaanJaringan";

/**
 * Daftar pemeliharaan jaringan yang sudah dikerjakan.
 *
 * ── FOTONYA BERPASANGAN, SELALU ─────────────────────────────────────────────
 * Sebelum dan sesudah ditampilkan BERDAMPINGAN, tidak pernah sendiri-sendiri.
 * Itu seluruh gunanya: satu foto tiang yang rapi tidak membuktikan apa pun —
 * yang membuktikan adalah perbedaannya. Menaruh keduanya di belakang tombol
 * "lihat foto" yang harus diketuk dua kali akan membuat verifikasi berhenti
 * dilakukan pada minggu kedua.
 */

const NADA: Record<string, string> = {
  Selesai: "bg-amber-50 text-amber-700 border-amber-200",
  Diverifikasi: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};

const tanggal = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";

function Foto({ url, label }: { url: string; label: string }) {
  if (!url) {
    return (
      <div className="flex-1 min-w-0 h-28 rounded-lg bg-surface border border-line grid place-items-center">
        <span className="text-[10px] text-ink-muted">tidak ada</span>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex-1 min-w-0 group"
      title={`Buka ${label} ukuran penuh`}
    >
      {/* next/image sengaja tidak dipakai: berkasnya di Supabase Storage dengan
          nama acak, dan mendaftarkan host-nya di next.config demi foto yang
          dibuka sekilas saat verifikasi tidak sepadan. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        className="w-full h-28 object-cover rounded-lg border border-line group-hover:border-navy-300"
      />
      <span className="block text-[10px] text-ink-muted mt-1">{label}</span>
    </a>
  );
}

interface Props {
  baris: BarisPemeliharaan[];
  loading: boolean;
  oleh: string;
  onVerifikasi: (id: string, oleh: string) => Promise<void>;
  onBatalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
}

export default function DaftarPemeliharaan({
  baris, loading, oleh, onVerifikasi, onBatalkan,
}: Props) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState<string | null>(null);

  const verifikasi = async (id: string) => {
    setSibuk(id);
    try {
      await onVerifikasi(id, oleh);
      toast.success("Diverifikasi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memverifikasi.");
    } finally {
      setSibuk(null);
    }
  };

  const batalkan = async (id: string) => {
    const alasan = window.prompt(
      "Alasan pembatalan — dibaca orang lain enam bulan lagi, jadi sebutkan apa yang keliru:",
    );
    if (!alasan?.trim()) return;
    setSibuk(id);
    try {
      await onBatalkan(id, alasan.trim(), oleh);
      toast.success("Dibatalkan.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membatalkan.");
    } finally {
      setSibuk(null);
    }
  };

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat catatan…
      </div>
    );
  }

  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Belum ada catatan pemeliharaan</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          Pemeliharaan dicatat dari HP oleh regu yang mengerjakannya — lengkap dengan titik
          koordinat dan foto sebelum-sesudah. Daftar ini terisi sendiri begitu catatan pertama
          terkirim.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {baris.map((b) => (
        <div key={b.id} className={`${CARD} p-4`}>
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-navy-50 border border-navy-200 text-[11px] font-bold text-navy-700">
                  {b.jenis}
                </span>
                <span className="text-sm font-semibold text-ink">{b.penyulang}</span>
                <span className="text-xs text-ink-muted">·</span>
                <span className="text-xs font-medium text-ink-soft">
                  {b.kategoriLabel ?? b.kategori}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                    NADA[b.status] ?? NADA.Selesai
                  }`}
                >
                  {b.status}
                </span>
              </div>

              <p className="text-sm text-ink mt-1.5">{b.pekerjaan}</p>

              <p className="text-xs text-ink-soft mt-1">
                {tanggal(b.tgl)}
                {b.petugasNama ? ` · ${b.petugasNama}` : ""}
                {b.ulp ? ` · ${b.ulp}` : ""}
              </p>

              {b.alamat && <p className="text-xs text-ink-muted mt-0.5">{b.alamat}</p>}

              {b.catatan && (
                <p className="text-[11px] text-ink-muted mt-1 italic">{b.catatan}</p>
              )}

              <div className="flex items-center gap-3 mt-2">
                {b.lat !== null && b.lng !== null ? (
                  <a
                    href={`https://www.google.com/maps?q=${b.lat},${b.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-600 hover:text-navy-500"
                  >
                    <MapPin size={12} />
                    {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                    <MapPin size={12} /> titik tidak terbaca
                  </span>
                )}

                {b.verifiedBy && b.status === "Diverifikasi" && (
                  <span className="text-[11px] text-ink-muted">
                    diverifikasi {b.verifiedBy}
                  </span>
                )}
              </div>
            </div>

            <div className="w-full sm:w-[280px] shrink-0">
              <div className="flex items-center gap-1 mb-1.5 text-[10px] font-semibold text-ink-muted">
                <Images size={11} /> SEBELUM &amp; SESUDAH
              </div>
              <div className="flex gap-2">
                <Foto url={b.fotoSebelum} label="sebelum" />
                <Foto url={b.fotoSesudah} label="sesudah" />
              </div>
            </div>
          </div>

          {b.status === "Selesai" && (
            <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-line">
              <button
                onClick={() => void verifikasi(b.id)}
                disabled={sibuk === b.id}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold bg-navy-600 text-white hover:bg-navy-500 disabled:opacity-40"
              >
                {sibuk === b.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Check size={12} />
                )}
                Verifikasi
              </button>
              <button
                onClick={() => void batalkan(b.id)}
                disabled={sibuk === b.id}
                className={`${BTN_GHOST} h-8 px-3 text-xs`}
              >
                <Ban size={12} /> Salah input
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
