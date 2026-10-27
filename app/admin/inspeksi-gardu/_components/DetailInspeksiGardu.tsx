"use client";

import { useEffect, useState } from "react";
import { Ban, Check, CheckCheck, Loader2, MapPin, Undo2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import FotoTambahan from "@/app/admin/_components/FotoTambahan";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import { fotoKecil } from "@/lib/fotoKecil";
import type { BarisInspeksiGardu, TemuanGardu } from "../_hooks/useInspeksiGardu";
import { NADA_PRIORITAS, tanggal } from "./TabelInspeksiGardu";

/**
 * Detail satu kunjungan: foto gardu + temuan. Setujui langsung (tanpa dialog);
 * kembalikan / batalkan wajib beralasan. Temuan yang sudah ditindaklanjuti
 * bisa ditandai selesai — keluar dari Perlu Perbaikan Pemeliharaan Gardu.
 */

interface Props {
  b: BarisInspeksiGardu;
  oleh: string;
  temuanDari: (id: string) => Promise<TemuanGardu[]>;
  onTutup: () => void;
  onVerifikasi: (id: string, oleh: string) => Promise<void>;
  onKembalikan: (id: string, alasan: string, oleh: string) => Promise<void>;
  onBatalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
  onSelesaikanTemuan: (id: string, catatan: string, oleh: string) => Promise<void>;
}

function Foto({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block" title={`Buka ${label.toLowerCase()} ukuran penuh`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- gambar mini (lib/fotoKecil); klik = asli */}
      <img src={fotoKecil(url, 384)} alt={label} className="w-full h-56 object-cover rounded-xl border border-line hover:border-navy-300" />
    </a>
  );
}

export default function DetailInspeksiGardu({ b, oleh, temuanDari, onTutup, onVerifikasi, onKembalikan, onBatalkan, onSelesaikanTemuan }: Props) {
  const toast = useToast();
  const [temuan, setTemuan] = useState<TemuanGardu[] | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [dialog, setDialog] = useState<"kembali" | "batal" | { selesai: TemuanGardu } | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let hidup = true;
    temuanDari(b.id).then(
      (t) => { if (hidup) setTemuan(t); },
      (e: Error) => { if (hidup) { setTemuan([]); toast.error(e.message); } },
    );
    return () => { hidup = false; };
  }, [b.id, temuanDari, toast, nonce]);

  const jalankan = async (f: () => Promise<void>, pesan: string) => {
    setSibuk(true);
    try {
      await f();
      toast.success(pesan);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
      return false;
    } finally {
      setSibuk(false);
    }
  };
  const menunggu = b.statusDb === "Selesai";

  return (
    <>
      <ModalShell
        title={`Inspeksi Gardu ${b.garduKode} · Tier ${b.tier}`}
        subtitle={`${b.garduNama ?? ""} · ${b.ulp} · ${tanggal(b.tgl)} · ${b.status}`}
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={menunggu ? (
          <>
            <div className="flex gap-2">
              <button onClick={() => setDialog("batal")} className={BTN_GHOST} disabled={sibuk}><Ban size={14} /> Salah input</button>
              <button onClick={() => setDialog("kembali")} className={BTN_GHOST} disabled={sibuk}><Undo2 size={14} /> Kembalikan ke petugas</button>
            </div>
            <button onClick={() => void jalankan(() => onVerifikasi(b.id, oleh), "Disetujui.")} className={BTN_PRIMARY} disabled={sibuk}>
              {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Setujui
            </button>
          </>
        ) : (
          <>
            {b.statusDb === "Diverifikasi" && (
              <button onClick={() => setDialog("batal")} className={BTN_GHOST} disabled={sibuk}><Ban size={14} /> Salah input</button>
            )}
            <button onClick={onTutup} className={`${BTN_GHOST} ml-auto`}>Tutup</button>
          </>
        )}
      >
        {b.statusDb === "Dikembalikan" && (
          <p className="text-xs rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
            <b>Dikembalikan ke petugas:</b> {b.dikembalikanAlasan ?? "—"} — menunggu dikirim ulang dari HP.
          </p>
        )}
        {b.tertahan && (
          <p className="text-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
            Regu mengusulkan titik gardu baru — belum dihitung realisasi sampai usulannya diputuskan di Master Gardu.
          </p>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div><p className="text-[11px] text-ink-muted">Petugas</p><p className="font-semibold text-ink">{b.petugas ?? "—"}</p></div>
          <div><p className="text-[11px] text-ink-muted">WO</p><p className="font-semibold text-ink">{b.woNama ?? "di luar WO"}</p></div>
          <div><p className="text-[11px] text-ink-muted">Penyulang</p><p className="font-semibold text-ink">{b.penyulang ?? "—"}</p></div>
          <div>
            <p className="text-[11px] text-ink-muted">Jarak ke titik gardu</p>
            <p className="font-semibold text-ink">{b.jarakM === null ? "—" : `${Math.round(b.jarakM)} m`}</p>
          </div>
        </div>
        {b.lat !== null && b.lng !== null && (
          <a href={`https://www.google.com/maps?q=${b.lat},${b.lng}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:text-navy-500">
            <MapPin size={12} /> {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
          </a>
        )}
        {b.catatan && <p className="text-xs text-ink-soft italic">{b.catatan}</p>}

        {b.fotoGardu && (
          <div className="max-w-sm"><p className={`${EYEBROW} mb-1.5`}>Foto gardu</p><Foto url={b.fotoGardu} label="Foto gardu" /></div>
        )}

        <div>
          <p className={`${EYEBROW} mb-2`}>Temuan</p>
          {temuan === null ? (
            <p className="text-xs text-ink-muted"><Loader2 size={12} className="inline animate-spin" /> Memuat…</p>
          ) : temuan.length === 0 ? (
            <p className="text-xs text-ink-muted">Tidak ada temuan.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {temuan.map((t) => (
                <div key={t.id} className="rounded-xl border border-line p-3 flex flex-col sm:flex-row gap-3">
                  <div className="sm:w-56 shrink-0">
                    {t.foto[0] && <Foto url={t.foto[0]} label={`Foto ${t.kategoriLabel}`} />}
                    <FotoTambahan foto={t.foto.slice(1)} alt={t.kategoriLabel} />
                  </div>
                  <div className="flex-1 text-xs flex flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${NADA_PRIORITAS[t.prioritas]}`}>{t.prioritas}</span>
                      <b className="text-sm text-ink">{t.kategoriLabel}</b>
                    </p>
                    <p className="text-ink">{t.uraian}</p>
                    {t.suhu !== null && (
                      <p className="text-ink-soft">
                        Suhu {t.suhu}°C{t.suhuPembanding !== null ? ` · pembanding ${t.suhuPembanding}°C · ΔT ${(t.suhu - t.suhuPembanding).toFixed(1)}°C` : ""}
                      </p>
                    )}
                    {t.statusTl === "Selesai" ? (
                      <p className="text-emerald-700 font-semibold mt-1">✓ Ditindaklanjuti{t.selesaiOleh ? ` · ${t.selesaiOleh}` : ""}{t.selesaiCatatan ? ` — ${t.selesaiCatatan}` : ""}</p>
                    ) : b.statusDb !== "Dibatalkan" && (
                      <button onClick={() => setDialog({ selesai: t })} className="self-start mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-navy-600 hover:underline">
                        <CheckCheck size={12} /> Tandai sudah ditindaklanjuti
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {b.verifiedBy && b.statusDb !== "Selesai" && (
          <p className="text-[11px] text-ink-muted">
            {b.statusDb === "Dibatalkan" ? `dibatalkan oleh ${b.verifiedBy}: ${b.batalAlasan ?? ""}` : `disetujui oleh ${b.verifiedBy}`}
          </p>
        )}
      </ModalShell>

      {dialog === "kembali" && (
        <BatalkanModal
          judul={`Kembalikan inspeksi ${b.garduKode} ke petugas?`}
          keterangan="Catatan ini muncul lagi di HP petugas untuk diperbaiki lalu dikirim ulang. Temuannya keluar dari Perlu Perbaikan sampai dikirim ulang."
          labelTombol="Kembalikan"
          placeholder="Alasan — mis. foto temuan buram, kategori salah"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasan) => jalankan(() => onKembalikan(b.id, alasan, oleh), "Dikembalikan ke petugas.")}
        />
      )}
      {dialog === "batal" && (
        <BatalkanModal
          judul={`Tandai inspeksi ${b.garduKode} salah input?`}
          keterangan="Catatan tetap tersimpan berstatus Dibatalkan beserta alasannya, tidak dihitung realisasi, dan temuannya keluar dari Perlu Perbaikan. Item WO-nya terbuka lagi."
          labelTombol="Tandai salah input"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasan) => jalankan(() => onBatalkan(b.id, alasan, oleh), "Ditandai salah input.")}
        />
      )}
      {dialog !== null && typeof dialog === "object" && (
        <BatalkanModal
          judul={`Temuan ${dialog.selesai.kategoriLabel} sudah ditindaklanjuti?`}
          keterangan="Temuan keluar dari Perlu Perbaikan Pemeliharaan Gardu. Isi bagaimana tindak lanjutnya."
          labelTombol="Tandai selesai"
          placeholder="mis. sudah diganti PDKB 28 Okt, WO pemeliharaan no. …"
          onTutup={() => setDialog(null)}
          onBatalkan={async (catatan) => {
            const ok = await jalankan(() => onSelesaikanTemuan(dialog.selesai.id, catatan, oleh), "Temuan ditandai selesai.");
            if (ok) setNonce((n) => n + 1);
            return ok;
          }}
        />
      )}
    </>
  );
}
