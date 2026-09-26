"use client";

import { ExternalLink, MapPin, Send, TreePine } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, NADA_TUGAS } from "@/app/admin/_ui";
import type { TemuanJtm } from "../_hooks/useTemuanJtm";
import { tgl, tglJam } from "../_lib/tampilan";

interface Props {
  t: TemuanJtm;
  onTutup: () => void;
  onTugaskan: () => void;
}

function Baris({ label, nilai }: { label: string; nilai: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-1.5 text-sm border-b border-line last:border-0">
      <span className="w-36 shrink-0 text-ink-muted text-xs pt-0.5">{label}</span>
      <span className="text-ink flex-1">{nilai}</span>
    </div>
  );
}

export default function DetailTemuanModal({ t, onTutup, onTugaskan }: Props) {
  const belum = t.status_tugas === "Belum ditugaskan";

  return (
    <ModalShell
      title={`Temuan · Tiang ${t.tiang_kode}`}
      subtitle={`${t.item_nama}: ${t.nilai_label ?? t.nilai ?? "—"} · ${t.penyulang ?? "—"} · ${t.ulp}`}
      maxWidth="max-w-3xl"
      onClose={onTutup}
      footer={
        <>
          <span />
          {belum ? (
            <button onClick={onTugaskan} className={BTN_PRIMARY}>
              <Send size={14} /> Tugaskan ke…
            </button>
          ) : (
            <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
          )}
        </>
      }
    >
      <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_TUGAS[t.status_tugas]}`}>
        {t.status_tugas}
      </span>

      {t.wo_perabasan_aktif && (
        <p className="flex items-start gap-2 text-xs rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-800">
          <TreePine size={14} className="shrink-0 mt-0.5" />
          Segmen ini sedang masuk WO Perabasan <b>{t.wo_perabasan_aktif}</b> — pohonnya bisa jadi sudah dijadwalkan dirabas.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className={`${EYEBROW} mb-1.5`}>Foto temuan</p>
          {t.foto_url ? (
            <a href={t.foto_url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage, ukuran tak tentu */}
              <img src={t.foto_url} alt={`Temuan ${t.item_nama} tiang ${t.tiang_kode}`} className="w-full max-h-72 object-cover rounded-xl border border-line" />
            </a>
          ) : (
            <p className="text-xs text-ink-muted rounded-xl border border-dashed border-line p-6 text-center">Tidak ada foto.</p>
          )}
        </div>
        <div>
          <Baris label="Jenis" nilai={t.jenis} />
          <Baris label="Item" nilai={`${t.item_nama}${t.bagian && t.bagian !== "-" ? ` (${t.bagian})` : ""}`} />
          <Baris label="Keadaan" nilai={<b className="text-amber-800">{t.nilai_label ?? t.nilai ?? "—"}</b>} />
          {t.catatan && <Baris label="Catatan regu" nilai={t.catatan} />}
          <Baris label="Segmen" nilai={t.segmen_nama ?? "—"} />
          {t.sirkit_nama && <Baris label="Sirkit" nilai={t.sirkit_nama} />}
          <Baris label="Ditemukan" nilai={`${tgl(t.ditemukan_pada)} · ${t.penemu ?? "—"}`} />
          {t.lat !== null && t.lng !== null && (
            <Baris
              label="Titik tiang"
              nilai={
                <a
                  href={`https://www.google.com/maps?q=${t.lat},${t.lng}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-navy-600 font-semibold hover:underline"
                >
                  <MapPin size={13} /> {t.lat.toFixed(6)}, {t.lng.toFixed(6)} <ExternalLink size={11} />
                </a>
              }
            />
          )}
        </div>
      </div>

      {!belum && (
        <div>
          <p className={`${EYEBROW} mb-1.5`}>Penugasan</p>
          <Baris label="Eksekutor" nilai={t.eksekutor ?? "—"} />
          <Baris label="Tanggal tugas" nilai={tglJam(t.assigned_at)} />
          <Baris label="Prioritas" nilai={t.prioritas ?? "—"} />
          <Baris label="Status tugas" nilai={`${t.tugas_status ?? "—"}${t.team_name ? ` · ${t.team_name}` : ""}`} />
          {t.foto_sesudah_url && (
            <Baris
              label="Foto sesudah"
              nilai={<a href={t.foto_sesudah_url} target="_blank" rel="noreferrer" className="text-navy-600 font-semibold hover:underline">lihat foto</a>}
            />
          )}
          {t.status_tugas === "Selesai" && (
            <p className="text-xs text-ink-muted mt-2">
              Temuan ini hilang sendiri dari daftar begitu inspeksi berikutnya mencatat itemnya normal. Kalau inspeksi
              berikutnya masih menemukannya rusak, ia kembali jadi <b>Belum ditugaskan</b>.
            </p>
          )}
        </div>
      )}
    </ModalShell>
  );
}
