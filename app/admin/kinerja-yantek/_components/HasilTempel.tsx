"use client";

import { CircleCheck, CircleX, SkipForward } from "lucide-react";
import { JENIS_SURAT } from "../_lib/woSurat";

/** Jawaban `tempel_wo` (scripts/wo-tempel-semua.sql). */
export interface HasilRpc {
  /** Penyulang salah → tidak ada yang disimpan sama sekali. */
  ditahan?: boolean;
  masuk: number;
  manual: number;
  segmen_baru: number;
  tanpa_regu: number;
  dilewati: { objek: string; sebab: string }[];
  ditolak: { objek: string; sebab: string }[];
}

/**
 * Pemberitahuan hasil tempel satu jenis WO (keputusan user: "berikan
 * pemberitahuan saat create WO"). Yang ditolak disebut satu per satu dengan
 * sebabnya — daftar yang hanya berupa angka tidak bisa ditindaklanjuti.
 */
export default function HasilTempel({ jenis, h }: { jenis: string; h: HasilRpc }) {
  const j = JENIS_SURAT.find((x) => x.kunci === jenis);
  if (h.ditahan) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-red-700">
          <CircleX size={15} /> WO DITAHAN — tidak ada satu baris pun yang disimpan
        </p>
        <p className="text-xs text-red-800">
          Penyulang di baris berikut kosong, tidak terdaftar, atau milik ULP lain. Perbaiki di Excel (atau daftarkan
          penyulangnya di Master Penyulang), lalu tempel ulang seluruhnya.
        </p>
        <Daftar ikon="x" judul={`${h.ditolak.length} baris perlu diperbaiki`} isi={h.ditolak} />
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-line p-3 space-y-2">
      <p className="text-sm font-semibold text-ink">{j?.nama ?? jenis}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {h.masuk > 0 && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CircleCheck size={13} /> {h.masuk} masuk WO (tampil di HP)
          </span>
        )}
        {h.manual > 0 && (
          <span className="inline-flex items-center gap-1 text-sky-700">
            <CircleCheck size={13} /> {h.manual} tersimpan untuk surat & rekap
            {j?.modul ? " (belum ada di master — tidak tampil di HP)" : ""}
          </span>
        )}
        {h.segmen_baru > 0 && (
          <span className="text-ink-soft">{h.segmen_baru} segmen baru dibuat (sumber: tempelan)</span>
        )}
        {h.tanpa_regu > 0 && (
          <span className="text-amber-700">
            {h.tanpa_regu} segmen tanpa regu — pelaksana bukan nama regu terdaftar; bagi ke regu di WO Perabasan supaya
            tampil di HP
          </span>
        )}
      </div>
      {h.ditolak.length > 0 && <Daftar ikon="x" judul={`${h.ditolak.length} ditolak`} isi={h.ditolak} />}
      {h.dilewati.length > 0 && <Daftar ikon="lewat" judul={`${h.dilewati.length} dilewati`} isi={h.dilewati} />}
    </div>
  );
}

function Daftar({ ikon, judul, isi }: { ikon: "x" | "lewat"; judul: string; isi: { objek: string; sebab: string }[] }) {
  const merah = ikon === "x";
  return (
    <div className={`rounded-lg border px-3 py-2 ${merah ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
      <p className={`inline-flex items-center gap-1 text-xs font-semibold ${merah ? "text-red-700" : "text-amber-800"}`}>
        {merah ? <CircleX size={13} /> : <SkipForward size={13} />} {judul}
      </p>
      <ul className="mt-1 max-h-40 overflow-auto text-[11px] text-ink-soft space-y-0.5">
        {isi.map((d, i) => (
          <li key={i}><b className="text-ink">{d.objek}</b> — {d.sebab}</li>
        ))}
      </ul>
    </div>
  );
}
