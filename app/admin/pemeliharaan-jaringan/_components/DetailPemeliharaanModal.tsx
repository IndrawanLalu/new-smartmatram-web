"use client";

import { useState } from "react";
import { Ban, Check, Loader2, MapPin, Pencil } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import type { BarisPemeliharaan, KategoriRef, KoreksiPemeliharaan } from "../_hooks/usePemeliharaanJaringan";
import { NADA_STATUS, tanggal } from "./TabelPemeliharaan";
import FormKoreksiPemeliharaan, { ID_FORM_KOREKSI } from "./FormKoreksiPemeliharaan";

/**
 * Detail satu pemeliharaan — pola sama dengan Optimasi Trafo.
 *
 * Foto SEBELUM dan SESUDAH berdampingan dan besar: satu foto tiang yang rapi
 * tidak membuktikan apa pun, yang membuktikan adalah perbedaannya.
 * Verifikasi tidak mengubah data master, jadi langsung jalan tanpa dialog
 * konfirmasi — admin memverifikasi puluhan catatan sekali duduk.
 */

interface Props {
  b: BarisPemeliharaan;
  kategori: KategoriRef[];
  oleh: string;
  onTutup: () => void;
  onVerifikasi: (id: string, oleh: string) => Promise<void>;
  onBatalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
  onKoreksi: (id: string, v: KoreksiPemeliharaan) => Promise<void>;
}

function Foto({ url, label }: { url: string; label: string }) {
  return (
    <div className="flex-1 min-w-0">
      <p className={`${EYEBROW} mb-1.5`}>{label}</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="block group" title={`Buka foto ${label.toLowerCase()} ukuran penuh`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage */}
          <img src={url} alt={label} className="w-full h-64 object-cover rounded-xl border border-line group-hover:border-navy-300" />
        </a>
      ) : (
        <div className="w-full h-64 rounded-xl border border-dashed border-line grid place-items-center text-xs text-ink-muted">
          tidak ada foto
        </div>
      )}
    </div>
  );
}

function Nilai({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink-muted">{label}</p>
      <div className="text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}

export default function DetailPemeliharaanModal({
  b, kategori, oleh, onTutup, onVerifikasi, onBatalkan, onKoreksi,
}: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<"lihat" | "koreksi">("lihat");
  const [batal, setBatal] = useState(false);
  const [sibuk, setSibuk] = useState(false);

  const jalankan = async (kerja: () => Promise<string>) => {
    setSibuk(true);
    try {
      toast.success(await kerja());
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
      return false;
    } finally {
      setSibuk(false);
    }
  };

  const menunggu = b.statusDb === "Selesai";

  const footer =
    mode === "koreksi" ? (
      <>
        <button onClick={() => setMode("lihat")} className={BTN_GHOST} disabled={sibuk}>Batal</button>
        <button type="submit" form={ID_FORM_KOREKSI} className={BTN_PRIMARY} disabled={sibuk}>
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan koreksi
        </button>
      </>
    ) : menunggu ? (
      <>
        <div className="flex gap-2">
          <button onClick={() => setBatal(true)} className={BTN_GHOST} disabled={sibuk}>
            <Ban size={14} /> Salah input
          </button>
          <button onClick={() => setMode("koreksi")} className={BTN_GHOST} disabled={sibuk}>
            <Pencil size={14} /> Koreksi
          </button>
        </div>
        <button
          onClick={() => void jalankan(async () => { await onVerifikasi(b.id, oleh); return "Diverifikasi."; })}
          className={BTN_PRIMARY}
          disabled={sibuk}
        >
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Verifikasi
        </button>
      </>
    ) : (
      <button onClick={onTutup} className={`${BTN_GHOST} ml-auto`}>Tutup</button>
    );

  return (
    <>
      <ModalShell
        title={`${mode === "koreksi" ? "Koreksi pemeliharaan" : "Pemeliharaan"} ${b.jenis} · ${b.penyulang}`}
        subtitle={`${b.ulp} · ${tanggal(b.tgl)} · ${b.status}`}
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={footer}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS[b.status]}`}>
          {b.status}
        </span>

        {mode === "koreksi" ? (
          <FormKoreksiPemeliharaan
            b={b}
            kategori={kategori}
            onSimpan={(v) =>
              void jalankan(async () => {
                await onKoreksi(b.id, v);
                setMode("lihat");
                return "Koreksi tersimpan.";
              })
            }
          />
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3">
              <Foto url={b.fotoSebelum} label="Sebelum" />
              <Foto url={b.fotoSesudah} label="Sesudah" />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Nilai label="Kategori">{b.kategoriLabel ?? b.kategori}</Nilai>
              <Nilai label="Petugas">{b.petugasNama ?? "—"}</Nilai>
              <Nilai label="Tanggal">{tanggal(b.tgl)}</Nilai>
              <Nilai label="WO">
                <span className="font-normal">{b.woLabel ?? "-"}</span>
                {b.woTgl && <span className="block text-[11px] font-normal text-ink-muted">terbit {tanggal(b.woTgl)}</span>}
              </Nilai>
            </div>

            <Nilai label="Pekerjaan"><span className="font-normal">{b.pekerjaan}</span></Nilai>
            {b.alamat && <Nilai label="Alamat"><span className="font-normal">{b.alamat}</span></Nilai>}
            {b.catatan && <p className="text-xs text-ink-soft italic">{b.catatan}</p>}

            <div className="flex flex-wrap items-center gap-3 text-xs">
              {b.lat !== null && b.lng !== null ? (
                <a
                  href={`https://www.google.com/maps?q=${b.lat},${b.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-semibold text-navy-600 hover:text-navy-500"
                >
                  <MapPin size={12} /> {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
                </a>
              ) : (
                <span className="inline-flex items-center gap-1 text-ink-muted"><MapPin size={12} /> titik tidak terbaca</span>
              )}
              {b.verifiedBy && (
                <span className="text-ink-muted">
                  {b.statusDb === "Dibatalkan" ? "dibatalkan" : "diverifikasi"} oleh {b.verifiedBy}
                  {b.verifiedAt ? ` · ${tanggal(b.verifiedAt)}` : ""}
                </span>
              )}
            </div>
          </>
        )}
      </ModalShell>

      {batal && (
        <BatalkanModal
          judul={`Tandai pemeliharaan ${b.penyulang} salah input?`}
          keterangan="Catatannya tetap tersimpan dengan status Dibatalkan beserta alasannya, dan tidak ikut dihitung sebagai realisasi."
          labelTombol="Tandai salah input"
          onTutup={() => setBatal(false)}
          onBatalkan={(alasan) =>
            jalankan(async () => {
              await onBatalkan(b.id, alasan, oleh);
              return "Ditandai salah input.";
            })
          }
        />
      )}
    </>
  );
}
