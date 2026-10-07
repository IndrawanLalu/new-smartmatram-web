"use client";

import { useState } from "react";
import { Ban, MapPin } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, EYEBROW } from "@/app/admin/_ui";
import { NADA_STATUS_TUGAS, type TugasHarjar } from "../_hooks/useTugasHarjar";
import { tanggal } from "./TabelPemeliharaan";

/**
 * Detail satu tugas HARJAR. Satu-satunya keputusan admin di sini: membatalkan
 * tugas MANUAL yang belum dikerjakan (teknisaplikasi.md butir 12). Tugas dari
 * temuan berasal dari temuannya; catatan pekerjaan diperiksa di tab Daftar.
 */

interface Props {
  t: TugasHarjar;
  oleh: string;
  onTutup: () => void;
  onBatalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
}

function Nilai({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={EYEBROW}>{label}</p>
      <div className="text-sm text-ink mt-0.5">{children}</div>
    </div>
  );
}

export default function DetailTugasModal({ t, oleh, onTutup, onBatalkan }: Props) {
  const toast = useToast();
  const [batal, setBatal] = useState(false);
  const terbuka = t.status === "Ditugaskan" || t.status === "Dalam Proses";
  const titik = t.koordinat?.split(",").map((s) => s.trim());

  return (
    <>
      <ModalShell
        title={`Tugas ${t.jenis ?? ""} · ${t.penyulang}`}
        subtitle={`${t.ulp} · ${t.sumber} · dibuat ${tanggal(t.ditugaskan)}`}
        maxWidth="max-w-2xl"
        onClose={onTutup}
        footer={
          <>
            {t.manual && terbuka ? (
              <button onClick={() => setBatal(true)} className={BTN_GHOST}>
                <Ban size={14} /> Batalkan tugas
              </button>
            ) : <span />}
            <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
          </>
        }
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS_TUGAS[t.status] ?? ""}`}>
          {t.status}
        </span>

        {t.status === "Dibatalkan" && (
          <p className="text-xs rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
            <b>Dibatalkan{t.dibatalkanOleh ? ` oleh ${t.dibatalkanOleh}` : ""}{t.dibatalkanAt ? ` · ${tanggal(t.dibatalkanAt)}` : ""}:</b>{" "}
            {t.dibatalkanAlasan ?? "—"}
          </p>
        )}

        <div className="flex gap-3">
          {t.foto && (
            <a href={t.foto} target="_blank" rel="noreferrer" title="Foto temuan">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage / Firebase lama */}
              <img src={t.foto} alt="Foto temuan" className="w-24 h-24 object-cover rounded-lg border border-line" />
            </a>
          )}
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold text-ink">{t.uraian}</p>
            {t.catatan && <p className="text-sm text-ink-soft">{t.catatan}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Nilai label="Lokasi">{t.lokasi ?? "—"}</Nilai>
          <Nilai label="Prioritas">{t.prioritas ?? "—"}</Nilai>
          <Nilai label={t.manual ? "Dibuat oleh" : "Penemu"}>{t.pembuat ?? "—"}</Nilai>
          <Nilai label="Dikerjakan">
            {t.catatanPetugas ? `${t.catatanPetugas} · ${tanggal(t.catatanTgl)}` : "—"}
          </Nilai>
          {t.tim && <Nilai label="Tim">{t.tim}</Nilai>}
        </div>

        {titik && titik.length === 2 && (
          <a
            href={`https://www.google.com/maps?q=${titik[0]},${titik[1]}`}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-xs font-semibold text-navy-600 hover:text-navy-500"
          >
            <MapPin size={12} /> {t.koordinat}
          </a>
        )}

        {t.catatanId && (
          <p className="text-xs text-ink-muted">
            Foto sebelum-sesudah dan verifikasinya ada di tab Daftar Pemeliharaan.
          </p>
        )}
      </ModalShell>

      {batal && (
        <BatalkanModal
          judul={`Batalkan tugas ${t.penyulang}?`}
          keterangan="Tugas hilang dari HP regu dan tidak dihitung sebagai WO terbit. Barisnya tetap tersimpan dengan status Dibatalkan beserta alasannya. Kalau regu telanjur mengerjakan dan mengirimnya, catatannya tetap diterima sebagai pekerjaan di luar tugas."
          labelTombol="Batalkan tugas"
          placeholder="Alasan — mis. sudah dikerjakan tim lain, salah penyulang, lokasi ganda"
          onTutup={() => setBatal(false)}
          onBatalkan={async (alasan) => {
            try {
              await onBatalkan(t.id, alasan, oleh);
              toast.success("Tugas dibatalkan.");
              return true;
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Gagal membatalkan.");
              return false;
            }
          }}
        />
      )}
    </>
  );
}
