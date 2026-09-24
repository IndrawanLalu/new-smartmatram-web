"use client";

import { useState } from "react";
import { Ban, CheckCircle2, Loader2, XCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { statusTampil, type PemeliharaanMenunggu } from "../_hooks/useHargarduApproval";
import { NADA_STATUS } from "./TabelHargardu";
import DetailPemeliharaan from "./DetailPemeliharaan";

/**
 * Modal detail pemeliharaan gardu — pola Kinerja Pelayanan Teknik.
 *
 * Tiga keputusan di kaki modal, dan bedanya perlu dijaga:
 *   Setujui     → master gardu dinyatakan dikonfirmasi orang di lapangan
 *   Kembalikan  → salah kerja, ULANGI (usulan koreksi dari pekerjaan ini gugur)
 *   Batalkan    → salah gardu / uji coba, JANGAN diulang
 * "Batalkan" diletakkan di kiri, jauh dari dua lainnya.
 */

interface Props {
  d: PemeliharaanMenunggu;
  memproses: string | null;
  onTutup: () => void;
  putuskan: (id: string, setuju: boolean, catatan?: string) => Promise<void>;
  batalkan: (id: string, alasan: string) => Promise<void>;
  putuskanUsulan: (idPekerjaan: string, idUsulan: string, setuju: boolean, alasan?: string) => Promise<void>;
}

export default function DetailPemeliharaanModal({ d, memproses, onTutup, putuskan, batalkan, putuskanUsulan }: Props) {
  const toast = useToast();
  const [dialog, setDialog] = useState<"kembalikan" | "batalkan" | null>(null);
  const status = statusTampil(d.status);
  const sibuk = memproses === d.id;

  const jalankan = async (kerja: () => Promise<void>, pesan: string) => {
    try {
      await kerja();
      toast.success(pesan);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
      return false;
    }
  };

  const menunggu = d.status === "Selesai";
  const bisaBatal = d.status !== "Diverifikasi" && d.status !== "Dibatalkan";

  const footer = (
    <>
      {bisaBatal ? (
        <button onClick={() => setDialog("batalkan")} className={`${BTN_GHOST} text-ink-muted hover:text-red-600`} disabled={sibuk}>
          <Ban size={14} /> Batalkan
        </button>
      ) : <span />}
      {menunggu ? (
        <div className="flex gap-2">
          <button onClick={() => setDialog("kembalikan")} className={BTN_GHOST} disabled={sibuk}>
            <XCircle size={14} /> Kembalikan ke regu
          </button>
          <button
            onClick={() => void jalankan(() => putuskan(d.id, true), "Pemeliharaan disetujui.")}
            className={BTN_PRIMARY}
            disabled={sibuk}
          >
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Setujui pemeliharaan
          </button>
        </div>
      ) : (
        <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
      )}
    </>
  );

  return (
    <>
      <ModalShell
        title={`Pemeliharaan gardu ${d.gardu_kode}`}
        subtitle={`${d.gardu_nama ?? "—"}${d.penyulang ? ` · ${d.penyulang}` : ""} · ${d.ulp} · ${status}`}
        maxWidth="max-w-5xl"
        onClose={onTutup}
        footer={footer}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS[status]}`}>
          {status}
        </span>

        {d.status === "Diverifikasi" && (
          <p className="text-xs text-ink-muted">
            Sudah disetujui{d.verified_note ? ` — ${d.verified_note}` : ""}. Catatan pemeliharaan tidak pernah
            ditulis ulang; kalau ada yang keliru, yang membetulkannya pemeliharaan berikutnya.
          </p>
        )}
        {(d.status === "Ditolak" || d.status === "Dibatalkan") && d.verified_note && (
          <p className="text-xs rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-800">
            <b>{d.status === "Ditolak" ? "Dikembalikan" : "Dibatalkan"}:</b> {d.verified_note}
          </p>
        )}

        <DetailPemeliharaan
          aktif={d}
          memproses={memproses}
          putuskanUsulan={(idUsulan, setuju, alasan) => putuskanUsulan(d.id, idUsulan, setuju, alasan)}
        />
      </ModalShell>

      {dialog === "kembalikan" && (
        <BatalkanModal
          judul={`Kembalikan pemeliharaan ${d.gardu_kode} ke regu?`}
          keterangan="Gardu ini muncul lagi di daftar tugas regu, dan usulan koreksi master yang lahir dari pekerjaan ini ikut gugur."
          labelTombol="Kembalikan ke regu"
          placeholder="Apa yang harus diperbaiki regu — mis. foto nama plat buram, arus sesudah belum diukur"
          onTutup={() => setDialog(null)}
          onBatalkan={(catatan) => jalankan(() => putuskan(d.id, false, catatan), "Dikembalikan ke regu.")}
        />
      )}
      {dialog === "batalkan" && (
        <BatalkanModal
          judul={`Batalkan pemeliharaan gardu ${d.gardu_kode}?`}
          keterangan="Catatannya dibuang dari hitungan dan dari daftar tugas. Hasil ukur serta foto tetap tersimpan sebagai riwayat."
          peringatan="Kalau pemeliharaan inilah yang dulu mengonfirmasi master gardu ini, penanda konfirmasinya ikut dicabut."
          labelTombol="Batalkan pemeliharaan"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasan) => jalankan(() => batalkan(d.id, alasan), "Pemeliharaan dibatalkan.")}
        />
      )}
    </>
  );
}
