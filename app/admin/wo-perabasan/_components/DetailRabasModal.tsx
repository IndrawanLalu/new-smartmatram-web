"use client";

import { useState } from "react";
import { BadgeCheck, Ban, Loader2, Undo2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { BarisRabas } from "../_hooks/useDaftarPerabasan";
import type { Regu } from "../_hooks/useWoPerabasan";
import { usePohonSegmenRabas } from "../_hooks/usePohonSegmenRabas";
import PohonSegmenRabas from "./PohonSegmenRabas";
import { NADA_STATUS, km, rentangKerja, tanggal } from "../_lib/tampilan";

/**
 * Detail satu segmen perabasan — pola sama dengan Optimasi Trafo.
 *
 * Pohon tampil langsung dalam tiga kelompok — hasil pengecekan, perabasan
 * (foto sebelum–sesudah), inspeksi — bukan di balik tombol:
 * itulah satu-satunya yang benar-benar diperiksa sebelum Terima. Penugasan
 * regu juga di sini — selama regu kosong, segmen ini tidak muncul di HP siapa
 * pun.
 */

interface Props {
  b: BarisRabas;
  regu: Regu[];
  onTutup: () => void;
  onTugaskan: (id: string, regu: string) => Promise<boolean>;
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

export default function DetailRabasModal({
  b, regu, onTutup, onTugaskan, onPutuskan, onBatalkan,
}: Props) {
  const pohon = usePohonSegmenRabas(b.id, b.segmenId);
  const [dialog, setDialog] = useState<"kembalikan" | "keluarkan" | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const jalankan = async (kerja: () => Promise<boolean>) => {
    setSibuk(true);
    try {
      return await kerja();
    } finally {
      setSibuk(false);
    }
  };

  const menunggu = b.statusDb === "Selesai";
  // Yang sudah dikerjakan regu tidak boleh keluar dari WO (dijaga database juga).
  const bisaKeluar = b.statusDb === "Dijadwalkan";
  // Yang sudah diselesaikan regu tidak dipindah: nama regu yang tercatat
  // mengerjakan akan berbeda dari yang tertulis di WO (dijaga database juga).
  const bisaPindahRegu = ["Dijadwalkan", "Dalam Proses", "Ditolak"].includes(b.statusDb);
  const reguUlp = regu.filter((g) => g.ulp === b.ulp);

  const footer = (
    <>
      {bisaKeluar ? (
        <button onClick={() => setDialog("keluarkan")} className={BTN_GHOST} disabled={sibuk}>
          <Ban size={14} /> Keluarkan dari WO
        </button>
      ) : <span />}
      {menunggu ? (
        <div className="flex gap-2">
          <button onClick={() => setDialog("kembalikan")} className={BTN_GHOST} disabled={sibuk}>
            <Undo2 size={14} /> Kembalikan ke regu
          </button>
          <button
            onClick={() => void jalankan(() => onPutuskan(b.id, true, ""))}
            className={BTN_PRIMARY}
            disabled={sibuk}
          >
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
        title={`Perabasan · ${b.segmenNama}`}
        subtitle={`${b.penyulang} · ${b.ulp} · ${b.status}`}
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={footer}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS[b.status]}`}>
          {b.status}
        </span>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Nilai label="Panjang">
            {km(b.panjangKm)}
            {b.panjangDari === "ketikan" && <span className="block text-[11px] font-normal text-amber-700">angka ketikan, belum dari bentang</span>}
          </Nilai>
          <Nilai label="WO">
            <span className="font-normal">{b.woNama ?? "-"}</span>
            {b.woTgl && <span className="block text-[11px] font-normal text-ink-muted">terbit {tanggal(b.woTgl)}</span>}
          </Nilai>
          <Nilai label="Tanggal pekerjaan">{rentangKerja(b.tglMulai, b.tglSelesai)}</Nilai>
          <Nilai label="Petugas">{b.petugasNama ?? "—"}</Nilai>
        </div>

        <div>
          <p className={`${EYEBROW} mb-1.5`}>Regu</p>
          {bisaPindahRegu && reguUlp.length > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={b.regu ?? ""}
                disabled={sibuk}
                onChange={(e) => void jalankan(() => onTugaskan(b.id, e.target.value))}
                className={`${FIELD} w-[220px] ${b.regu ? "" : "border-red-300 text-red-700"}`}
                aria-label="Regu"
              >
                <option value="">— belum dibagi —</option>
                {reguUlp.map((g) => (
                  <option key={g.regu} value={g.regu}>
                    {g.regu} · {g.segmen_berjalan} segmen berjalan
                  </option>
                ))}
              </select>
              {!b.regu && <span className="text-xs text-red-700">Belum muncul di HP regu mana pun.</span>}
            </div>
          ) : (
            <p className="text-sm text-ink">
              {b.regu ?? (reguUlp.length === 0 ? `ULP ${b.ulp} belum punya regu rabas aktif` : "—")}
            </p>
          )}
        </div>

        {b.statusDb === "Ditolak" && b.verifiedNote && (
          <p className="text-xs rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-orange-800">
            <b>Dikembalikan:</b> {b.verifiedNote}
          </p>
        )}

        <PohonSegmenRabas isi={pohon.isi} galat={pohon.galat} catatanRegu={b.catatan} />
      </ModalShell>

      {dialog === "kembalikan" && (
        <BatalkanModal
          judul={`Kembalikan ${b.segmenNama} ke regu?`}
          keterangan="Segmen ini kembali jadi kewajiban regu di WO yang sama dan belum menambah capaian km."
          labelTombol="Kembalikan ke regu"
          placeholder="Apa yang harus diperbaiki regu — mis. foto sesudah tidak jelas, pohon di tiang 12 belum dirabas"
          onTutup={() => setDialog(null)}
          onBatalkan={(catatan) => jalankan(() => onPutuskan(b.id, false, catatan))}
        />
      )}
      {dialog === "keluarkan" && (
        <BatalkanModal
          judul={`Keluarkan ${b.segmenNama} dari WO?`}
          keterangan="Segmen ini tidak lagi menjadi pekerjaan WO tersebut dan hilang dari HP regu. Catatannya tetap tersimpan dengan status Dibatalkan."
          labelTombol="Keluarkan dari WO"
          placeholder="Alasan — mis. segmen salah pilih, sudah dirabas lewat pekerjaan lain"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasan) => jalankan(() => onBatalkan(b.id, alasan))}
        />
      )}
    </>
  );
}
