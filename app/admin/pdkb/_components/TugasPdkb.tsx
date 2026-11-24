"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2, MapPin, TriangleAlert } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/app/admin/_ui";
import { KotakCari } from "@/app/admin/_kit/Field";
import IkonKolom from "@/app/admin/_kit/IkonKolom";
import { tanggal } from "@/app/admin/pemeliharaan-jaringan/_components/TabelPemeliharaan";
import { NADA_STATUS_TUGAS } from "@/app/admin/pemeliharaan-jaringan/_hooks/useTugasHarjar";
import KepalaUrut, { tglAman, urutTanggal, type ArahUrut } from "@/app/admin/_components/KepalaUrut";
import { tugasHariIni } from "@/app/admin/pemeliharaan-jaringan/_components/TugasHarjar";
import { belumSelesai, type TugasPdkb as Tugas, type useTugasPdkb } from "../_hooks/useTugasPdkb";

/**
 * Tab "Temuan ditugaskan": semua tugas ke PDKB (temuan JTM/JTR/gardu).
 * Tabel 20 baris → modal detail; "Catat hasil" membuka formulir pekerjaan
 * yang menutup tugasnya.
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";
const NADA_PRIORITAS: Record<string, string> = {
  Emergency: "text-red-700 font-semibold",
  Urgent: "text-red-600 font-semibold",
  Scheduled: "text-amber-700",
};
const terbuka = (t: Tugas) => belumSelesai(t.status);

interface Props {
  o: ReturnType<typeof useTugasPdkb>;
  onCatat: (t: Tugas) => void;
  /** Tab "Belum Selesai": hanya tugas yang belum ditutup, semua bulan. */
  hanyaBelum?: boolean;
  /** Tab "Hari ini": ditugaskan atau dikerjakan hari ini. */
  hariIni?: boolean;
}

function Nilai({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className={EYEBROW}>{label}</p>
      <div className="text-sm text-ink mt-0.5">{children}</div>
    </div>
  );
}

function DetailTugas({ t, onTutup, onCatat }: { t: Tugas; onTutup: () => void; onCatat: () => void }) {
  const titik = t.koordinat?.split(",").map((s) => s.trim());
  return (
    <ModalShell
      title={`Tugas PDKB · ${t.jenis === "GARDU" ? `Gardu ${t.garduKode ?? ""}` : t.penyulang}`}
      subtitle={`${t.ulp} · ${t.sumber} · ${t.ditugaskan ? "ditugaskan" : "dibuat"} ${tglAman(t.tanggal)}`}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
          {terbuka(t) && (
            <button onClick={onCatat} className={BTN_PRIMARY}><ClipboardCheck size={14} /> Catat hasil</button>
          )}
        </>
      }
    >
      <span className={`inline-block w-fit px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS_TUGAS[t.status] ?? ""}`}>{t.status}</span>
      {t.status === "Dibatalkan" && (
        <p className="text-xs rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-700">
          <b>Dibatalkan{t.dibatalkanOleh ? ` oleh ${t.dibatalkanOleh}` : ""}:</b> {t.dibatalkanAlasan ?? "—"}
        </p>
      )}
      <div className="flex gap-3">
        {t.foto && (
          <a href={t.foto} target="_blank" rel="noreferrer" title="Foto temuan">
            {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage */}
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
        <Nilai label="Tanggal temuan">{tglAman(t.ditemukan)}</Nilai>
        <Nilai label="Penemu / pemberi tugas">{t.penemu ?? "—"}</Nilai>
        <Nilai label="Dikerjakan">{t.catatanTgl ? tanggal(t.catatanTgl) : "—"}</Nilai>
      </div>
      {titik && titik.length === 2 && (
        <a href={`https://www.google.com/maps?q=${titik[0]},${titik[1]}`} target="_blank" rel="noreferrer"
          className="flex w-fit items-center gap-1 text-xs font-semibold text-navy-600 hover:text-navy-500">
          <MapPin size={12} /> {t.koordinat}
        </a>
      )}
      {t.catatanId && <p className="text-xs text-ink-muted">Foto sebelum–sesudah ada di tab Daftar Pekerjaan.</p>}
    </ModalShell>
  );
}

export default function TugasPdkb({ o, onCatat, hanyaBelum, hariIni }: Props) {
  const [idDetail, setIdDetail] = useState<string | null>(null);
  const [halaman, setHalaman] = useState(1);
  const [arah, setArah] = useState<ArahUrut>("baru");
  const detail = idDetail ? (o.semua.find((t) => `${t.tabel}:${t.id}` === idDetail) ?? null) : null;
  // Belum selesai: tersaring cari, bukan chip status (semuanya memang terbuka).
  const dasar = hanyaBelum ? o.baris.filter((t) => terbuka(t)) : hariIni ? o.baris.filter(tugasHariIni) : o.baris;
  const daftar = urutTanggal(dasar, (t) => t.tanggal, arah);
  const total = Math.max(1, Math.ceil(daftar.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = daftar.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 -mt-1">
        {hanyaBelum || hariIni ? (
          <span className="text-sm font-semibold text-ink">{o.loading ? "Memuat…" : `${daftar.length} tugas ${hariIni ? "hari ini" : "belum selesai"}`}</span>
        ) : (
          <>
            <button onClick={() => o.setStatus("SEMUA")} className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua</button>
            {o.hitung.map(([s, n]) => (
              <button key={s} onClick={() => o.setStatus(s)} className={`${CHIP} ${o.status === s ? CHIP_ON : CHIP_OFF}`}>
                {s} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </>
        )}
        <KotakCari nilai={o.cari} onUbah={o.setCari} placeholder="Cari penyulang / gardu / temuan" lebar="w-[240px]" />
      </div>
      <p className="text-[11px] text-ink-muted -mt-2">
        {hariIni
          ? "Tugas yang ditugaskan atau dikerjakan hari ini."
          : hanyaBelum
          ? "Semua tugas PDKB yang belum selesai, apa pun bulannya — tekan “Catat hasil” bila sudah dikerjakan."
          : "Tugas yang belum dikerjakan selalu tampil, apa pun bulannya. Yang selesai atau dibatalkan mengikuti bulan ditugaskan."}
      </p>

      {o.loading ? (
        <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
          <Loader2 size={16} className="animate-spin" /> Memuat tugas…
        </div>
      ) : o.galat ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Tugas gagal dimuat</p>
            <p className="mt-0.5 text-amber-700">{o.galat} — kosongnya tabel bukan berarti tidak ada tugas.</p>
            <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
          </div>
        </div>
      ) : daftar.length === 0 ? (
        <div className={`${CARD} p-10 text-center`}>
          <p className="text-sm font-semibold text-ink">{hariIni ? "Tidak ada tugas PDKB hari ini" : hanyaBelum ? "Tidak ada tugas PDKB yang belum selesai" : "Tidak ada temuan yang ditugaskan ke PDKB"}</p>
          <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
            Tugas lahir dari Temuan JTM/JTR (Tugaskan → PDKB) dan Perlu Perbaikan gardu (Jadikan WO → PDKB).
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="kepala-kit bg-surface">
                <tr>
                  <KepalaUrut label="Tanggal" arah={arah} onUbah={(a) => { setArah(a); setHalaman(1); }} className={TH} />
                  <th className={TH}><IkonKolom teks="Penyulang" />Penyulang / Gardu</th>
                  <th className={TH}><IkonKolom teks="Jenis" />Jenis</th>
                  <th className={TH}>Temuan</th>
                  <th className={TH}><IkonKolom teks="Lokasi" />Lokasi</th>
                  <th className={TH}>Sumber</th>
                  <th className={TH}><IkonKolom teks="Prioritas" />Prioritas</th>
                  <th className={TH}><IkonKolom teks="Status" />Status</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {tampil.map((t) => (
                  <tr key={`${t.tabel}:${t.id}`} onClick={() => setIdDetail(`${t.tabel}:${t.id}`)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                    <td className={`${TD} text-xs font-medium whitespace-nowrap`}>
                      {tglAman(t.tanggal)}
                      {!t.ditugaskan && t.tanggal && <span className="block text-[10px] text-ink-muted">tanggal dibuat</span>}
                    </td>
                    <td className={TD}>
                      <p className="font-semibold text-ink">{t.jenis === "GARDU" ? t.garduKode ?? "—" : t.penyulang}</p>
                      <p className="text-[11px] text-ink-muted">{t.ulp}</p>
                    </td>
                    <td className={TD}>
                      {t.jenis ? <span className="px-2 py-0.5 rounded-md bg-navy-50 border border-navy-200 text-[11px] font-bold text-navy-700">{t.jenis}</span> : "—"}
                    </td>
                    <td className={`${TD} text-xs max-w-64`}><p className="line-clamp-2">{t.uraian}</p></td>
                    <td className={`${TD} text-xs text-ink-soft max-w-48`}><p className="line-clamp-2">{t.lokasi ?? "—"}</p></td>
                    <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{t.sumber}</td>
                    <td className={`${TD} text-xs whitespace-nowrap ${NADA_PRIORITAS[t.prioritas ?? ""] ?? "text-ink-soft"}`}>{t.prioritas ?? "—"}</td>
                    <td className={TD}>
                      <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_STATUS_TUGAS[t.status] ?? ""}`}>{t.status}</span>
                    </td>
                    <td className={TD}>
                      {terbuka(t) && (
                        <button onClick={(e) => { e.stopPropagation(); onCatat(t); }}
                          className="text-xs font-semibold text-brand-700 hover:text-brand-600 whitespace-nowrap">
                          Catat hasil
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
            <span>{(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, daftar.length)} dari {daftar.length}</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setHalaman(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
                <ChevronLeft size={15} />
              </button>
              <span>{hal} / {total}</span>
              <button onClick={() => setHalaman(hal + 1)} disabled={hal >= total} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && <DetailTugas t={detail} onTutup={() => setIdDetail(null)} onCatat={() => { setIdDetail(null); onCatat(detail); }} />}
    </>
  );
}
