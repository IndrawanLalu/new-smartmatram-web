"use client";

import { useEffect, useState } from "react";
import { Ban, CheckCircle2, Loader2, XCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { ambilPerbandingan, statusTampil, type Banding, type InspeksiMenunggu } from "../_hooks/useApprovalJtr";
import { NADA_STATUS } from "../_lib/tampilan";
import IsiInspeksiJtr from "./IsiInspeksiJtr";

/**
 * Modal persetujuan inspeksi JTR — pola Kinerja Pelayanan Teknik.
 *
 *   Setujui     → pekerjaan di gardu ini dinyatakan benar dan sesuai
 *   Kembalikan  → salah kerja, ULANGI (alasan wajib)
 *   Batalkan    → salah objek / uji coba, JANGAN diulang (dijauhkan ke kiri)
 */

interface Props {
  d: InspeksiMenunggu;
  memproses: string | null;
  oleh: string;
  onTutup: () => void;
  putuskan: (id: string, setuju: boolean, catatan?: string) => Promise<void>;
  batalkan: (id: string, alasan: string) => Promise<void>;
}

export default function DetailInspeksiJtrModal({ d, memproses, oleh, onTutup, putuskan, batalkan }: Props) {
  const toast = useToast();
  const [banding, setBanding] = useState<Banding | null>(null);
  const [galatBanding, setGalatBanding] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"kembalikan" | "batalkan" | null>(null);
  const status = statusTampil(d.status);
  const sibuk = memproses === d.id;

  // Dipasang ulang per inspeksi (key = id di halaman), jadi cukup menarik.
  useEffect(() => {
    let hidup = true;
    ambilPerbandingan(d).then(
      (h) => { if (hidup) setBanding(h); },
      (e: Error) => { if (hidup) setGalatBanding(e.message); },
    );
    return () => { hidup = false; };
    // Hanya id yang menentukan data perbandingan; objek baris berganti setiap
    // kali daftar ditambal sesudah keputusan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.id]);

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
  const bisaBatal = !d.sementara && d.status !== "Diverifikasi" && d.status !== "Dibatalkan";

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
            <XCircle size={14} /> Kembalikan ke petugas
          </button>
          <button
            onClick={() => void jalankan(() => putuskan(d.id, true), "Inspeksi JTR disetujui.")}
            className={BTN_PRIMARY}
            disabled={sibuk}
          >
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Setujui inspeksi
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
        title={`Inspeksi JTR · ${d.gardu_kode}${d.gardu_nama ? ` — ${d.gardu_nama}` : ""}`}
        subtitle={`${d.gardu_alamat || d.penyulang || "—"} · ${d.ulp} · ${status}`}
        maxWidth="max-w-5xl"
        onClose={onTutup}
        footer={footer}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS[status]}`}>
          {status}
        </span>
        {d.sementara && (
          <p className="text-xs rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-800">
            Petugas masih menitik jaringan gardu ini dan belum menekan <b>Selesai</b> di aplikasi. Yang tampil adalah
            keadaan jaringan sejauh ini; persetujuan baru bisa diberikan setelah gardunya ditutup petugas.
          </p>
        )}
        {(d.status === "Ditolak" || d.status === "Dibatalkan") && d.verified_note && (
          <p className="text-xs rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-800">
            <b>{d.status === "Ditolak" ? "Dikembalikan" : "Dibatalkan"}:</b> {d.verified_note}
          </p>
        )}

        <IsiInspeksiJtr aktif={d} banding={banding} galatBanding={galatBanding} oleh={oleh} />
      </ModalShell>

      {dialog === "kembalikan" && (
        <BatalkanModal
          judul={`Kembalikan inspeksi ${d.gardu_kode} ke petugas?`}
          keterangan="Gardu ini kembali jadi pekerjaan petugas, dan alasannya terbaca di aplikasi."
          labelTombol="Kembalikan ke petugas"
          placeholder="Apa yang harus diperbaiki — mis. jurusan B belum ditelusuri sampai ujung, kabel tiang 7 belum dicatat"
          onTutup={() => setDialog(null)}
          onBatalkan={(catatan) => jalankan(() => putuskan(d.id, false, catatan), "Dikembalikan ke petugas.")}
        />
      )}
      {dialog === "batalkan" && (
        <BatalkanModal
          judul="Batalkan inspeksi JTR ini?"
          keterangan="Catatan inspeksinya dibuang dari hitungan cakupan dan rekap temuan. Tiang yang sudah dinilai TIDAK ikut dibatalkan — tiangnya nyata berdiri di lapangan."
          peringatan="Berbeda dengan Kembalikan: gardunya tidak dikembalikan jadi pekerjaan, jadi tidak akan ada yang mengerjakannya ulang."
          labelTombol="Batalkan inspeksi"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasan) => jalankan(() => batalkan(d.id, alasan), "Inspeksi dibatalkan.")}
        />
      )}
    </>
  );
}
