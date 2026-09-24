"use client";

import { useState } from "react";
import { BadgeCheck, Ban, Loader2, MapPin, Undo2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { LABEL_LUAR, type BarisLuar } from "../_hooks/useLuarWoPerabasan";
import { NADA_STATUS, tanggal } from "../_lib/tampilan";

/**
 * Detail satu rabas di luar WO — Terima / Kembalikan ke regu / Batalkan.
 * Yang memutuskan: admin ULP LOKASI (yang mengenal jaringannya) atau UP3 —
 * dijaga juga oleh database.
 */

interface Props {
  b: BarisLuar;
  bolehPutuskan: boolean;
  onTutup: () => void;
  onPutuskan: (id: string, terima: boolean, catatan: string) => Promise<boolean>;
  onBatalkan: (id: string, alasan: string) => Promise<boolean>;
}

function Nilai({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink-muted">{label}</p>
      <div className="text-sm font-semibold text-ink">{children}</div>
    </div>
  );
}

function Bukti({ url, label }: { url: string; label: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block" title={`Buka foto ${label.toLowerCase()}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage */}
      <img src={url} alt={label} className="w-44 h-44 object-cover rounded-lg border border-line bg-surface" />
      <span className="block text-[11px] text-ink-muted text-center mt-0.5">{label}</span>
    </a>
  );
}

export default function DetailLuarWoModal({ b, bolehPutuskan, onTutup, onPutuskan, onBatalkan }: Props) {
  const [dialog, setDialog] = useState<"kembalikan" | "batal" | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const label = LABEL_LUAR[b.status];

  const jalankan = async (kerja: () => Promise<boolean>) => {
    setSibuk(true);
    try {
      return await kerja();
    } finally {
      setSibuk(false);
    }
  };

  const menunggu = b.status === "Selesai";
  const bisaBatal = bolehPutuskan && (b.status === "Selesai" || b.status === "Ditolak");

  const footer = (
    <>
      {bisaBatal ? (
        <button onClick={() => setDialog("batal")} className={BTN_GHOST} disabled={sibuk}>
          <Ban size={14} /> Batalkan
        </button>
      ) : <span />}
      {menunggu && bolehPutuskan ? (
        <div className="flex gap-2">
          <button onClick={() => setDialog("kembalikan")} className={BTN_GHOST} disabled={sibuk}>
            <Undo2 size={14} /> Kembalikan ke regu
          </button>
          <button onClick={() => void jalankan(() => onPutuskan(b.id, true, ""))} className={BTN_PRIMARY} disabled={sibuk}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />} Terima
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
        title={`Rabas di luar WO · ${b.penyulang}`}
        subtitle={`${b.ulp} · ${tanggal(b.tgl)} · ${label}`}
        maxWidth="max-w-3xl"
        onClose={onTutup}
        footer={footer}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS[label as keyof typeof NADA_STATUS]}`}>
          {label}
        </span>

        <div className="flex flex-wrap gap-3">
          <Bukti url={b.fotoSebelum} label="Sebelum" />
          <Bukti url={b.fotoSesudah} label="Sesudah" />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Nilai label="Jenis pohon">{b.jenisPohon ?? "—"}</Nilai>
          <Nilai label="Tanggal pekerjaan">{tanggal(b.tgl)}</Nilai>
          <Nilai label="Regu">
            {b.regu ?? "—"}
            <span className="block text-[11px] font-normal text-ink-muted">ULP {b.ulpRegu}</span>
          </Nilai>
          <Nilai label="Lokasi">
            <span className="font-normal">{b.lokasi ?? "—"}</span>
            {b.lat !== null && b.lng !== null && (
              <a
                href={`https://www.google.com/maps?q=${b.lat},${b.lng}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs font-normal text-navy-600 hover:underline mt-0.5"
              >
                <MapPin size={11} /> {b.lat.toFixed(5)}, {b.lng.toFixed(5)}
              </a>
            )}
          </Nilai>
          <Nilai label="Catatan regu"><span className="font-normal">{b.catatan ?? "—"}</span></Nilai>
          {b.verifiedBy && <Nilai label="Diputuskan oleh"><span className="font-normal">{b.verifiedBy}</span></Nilai>}
        </div>

        {b.ulpRegu !== b.ulp && (
          <p className="text-xs rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-800">
            Bantuan regu ULP {b.ulpRegu} di jaringan ULP {b.ulp}. Dihitung di rekap ULP {b.ulpRegu}; diperiksa admin
            ULP {b.ulp}.
          </p>
        )}
        {b.verifiedNote && (b.status === "Ditolak" || b.status === "Dibatalkan") && (
          <p className="text-xs rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-800">
            <b>{b.status === "Ditolak" ? "Dikembalikan" : "Dibatalkan"}:</b> {b.verifiedNote}
          </p>
        )}
        {menunggu && !bolehPutuskan && (
          <p className="text-xs text-ink-muted">Diperiksa oleh admin ULP {b.ulp} atau UP3.</p>
        )}
      </ModalShell>

      {dialog === "kembalikan" && (
        <BatalkanModal
          judul="Kembalikan ke regu?"
          keterangan="Catatan ini muncul lagi di HP regu sebagai draf berisi isian lama untuk diperbaiki dan dikirim ulang. Selama itu tidak dihitung."
          labelTombol="Kembalikan ke regu"
          placeholder="Apa yang harus diperbaiki — mis. foto sesudah tidak jelas, penyulang salah pilih"
          onTutup={() => setDialog(null)}
          onBatalkan={(catatan) => jalankan(() => onPutuskan(b.id, false, catatan))}
        />
      )}
      {dialog === "batal" && (
        <BatalkanModal
          judul="Batalkan rabas ini?"
          keterangan="Catatan tetap tersimpan dengan status Dibatalkan beserta alasannya, dan tidak dihitung di rekap."
          labelTombol="Batalkan"
          placeholder="Alasan — mis. pekerjaan ganda, sudah tercatat di WO"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasan) => jalankan(() => onBatalkan(b.id, alasan))}
        />
      )}
    </>
  );
}
