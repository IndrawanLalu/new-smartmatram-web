"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, Search, Send, TriangleAlert } from "lucide-react";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD, NADA_TUGAS } from "@/app/admin/_ui";
import TugaskanTemuanModal from "@/app/admin/_components/TugaskanTemuanModal";
import { STATUS_TUGAS_JTR, kunciTemuanJtr, useTemuanJtr, type TemuanJtr as Temuan } from "../_hooks/useTemuanJtr";
import { tgl } from "../_lib/tampilan";

/**
 * Tab Temuan — temuan inspeksi JTR yang sudah disetujui, siap ditugaskan
 * (biasanya ke HARJAR). Kolom WO = eksekutor tugasnya, Tgl WO = saat
 * ditugaskan ("-" kalau belum).
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";
const NADA_URGENSI: Record<string, string> = {
  Tinggi: "text-red-700",
  Sedang: "text-amber-700",
};

export default function TemuanJtr({ ulp, oleh }: { ulp: string; oleh: string }) {
  const o = useTemuanJtr(ulp, oleh);
  const [halaman, setHalaman] = useState(1);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [tugaskan, setTugaskan] = useState<Temuan[] | null>(null);

  const total = Math.max(1, Math.ceil(o.baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = o.baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);
  const bisaPilih = (t: Temuan) => t.status_tugas === "Belum ditugaskan";
  const pilihan = o.semua.filter((t) => terpilih.has(kunciTemuanJtr(t)) && bisaPilih(t));
  const halamanBisa = tampil.filter(bisaPilih);
  const semuaHalamanTerpilih = halamanBisa.length > 0 && halamanBisa.every((t) => terpilih.has(kunciTemuanJtr(t)));

  const tukar = (k: string) =>
    setTerpilih((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const tukarHalaman = () =>
    setTerpilih((s) => {
      const n = new Set(s);
      for (const t of halamanBisa) {
        if (semuaHalamanTerpilih) n.delete(kunciTemuanJtr(t));
        else n.add(kunciTemuanJtr(t));
      }
      return n;
    });
  const saring = (f: () => void) => { f(); setHalaman(1); };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TUGAS_JTR.map((s) => (
          <button key={s} onClick={() => saring(() => o.setStatus(s))} className={`${CHIP} ${o.status === s ? CHIP_ON : CHIP_OFF}`}>
            {s} <span className="opacity-70">{o.loading ? "" : o.hitung[s]}</span>
          </button>
        ))}
        <button onClick={() => saring(() => o.setStatus("SEMUA"))} className={`${CHIP} ${o.status === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua</button>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={o.cari}
            onChange={(e) => saring(() => o.setCari(e.target.value))}
            placeholder="Cari tiang / gardu / penyulang / temuan"
            className={`${FIELD} w-[260px] pl-8`}
          />
        </div>
      </div>

      <p className="text-[11px] text-ink-muted -mt-1">
        Temuan dari inspeksi terakhir yang sudah <b>disetujui</b> per gardu. Temuan hilang sendiri begitu inspeksi
        berikutnya mencatatnya normal.
      </p>

      {pilihan.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 bg-navy-50 px-4 py-2.5">
          <p className="text-sm text-ink flex-1"><b>{pilihan.length}</b> temuan dipilih</p>
          <button onClick={() => setTerpilih(new Set())} className="text-xs font-semibold text-ink-soft hover:text-ink">Kosongkan</button>
          <button
            onClick={() => setTugaskan(pilihan)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-navy-600 text-white text-xs font-semibold hover:opacity-90"
          >
            <Send size={13} /> Tugaskan {pilihan.length} temuan
          </button>
        </div>
      )}

      {o.galat && !o.loading ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Temuan gagal dimuat</p>
            <p className="mt-0.5 text-amber-700">{o.galat} — kosongnya tabel bukan berarti tidak ada temuan.</p>
            <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
          </div>
        </div>
      ) : o.loading ? (
        <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
          <Loader2 size={16} className="animate-spin" /> Memuat temuan…
        </div>
      ) : o.baris.length === 0 ? (
        <div className={`${CARD} p-10 text-center`}>
          <p className="text-sm font-semibold text-ink">Tidak ada temuan</p>
          <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
            Temuan muncul di sini setelah inspeksi JTR yang mencatatnya disetujui di tab Daftar Inspeksi.
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className={`${TH} w-8`}>
                    <input
                      type="checkbox"
                      checked={semuaHalamanTerpilih}
                      disabled={halamanBisa.length === 0}
                      onChange={tukarHalaman}
                      className="accent-navy-600"
                      aria-label="Pilih semua di halaman ini"
                    />
                  </th>
                  <th className={TH}>Tiang</th>
                  <th className={TH}>Gardu · Penyulang</th>
                  <th className={TH}>Temuan</th>
                  <th className={TH}>Ditemukan</th>
                  <th className={TH}>WO</th>
                  <th className={TH}>Tgl WO</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((t) => {
                  const k = kunciTemuanJtr(t);
                  return (
                    <tr key={k} className="hover:bg-navy-50/60 transition-colors">
                      <td className={TD}>
                        <input
                          type="checkbox"
                          checked={terpilih.has(k)}
                          disabled={!bisaPilih(t)}
                          onChange={() => tukar(k)}
                          className="accent-navy-600"
                          aria-label={`Pilih temuan tiang ${t.tiang_kode}`}
                        />
                      </td>
                      <td className={`${TD} font-semibold text-ink whitespace-nowrap`}>
                        {t.tiang_kode}
                        <p className="text-[10px] font-semibold text-ink-muted">Jurusan {t.jurusan ?? "—"} · {t.ulp}</p>
                      </td>
                      <td className={`${TD} text-xs text-ink-soft`}>
                        {t.gardu_kode}
                        <p className="text-[11px] text-ink-muted max-w-56 truncate">{t.gardu_nama ?? "—"} · {t.penyulang ?? "—"}</p>
                      </td>
                      <td className={`${TD} text-xs`}>
                        <span className="text-ink">{t.temuan}</span>
                        <p className={`font-semibold ${NADA_URGENSI[t.urgensi ?? ""] ?? "text-ink-soft"}`}>
                          urgensi {t.urgensi?.toLowerCase() ?? "—"}
                          {t.foto_url && (
                            <a href={t.foto_url} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-0.5 text-navy-600 font-medium hover:underline">
                              foto <ExternalLink size={10} />
                            </a>
                          )}
                        </p>
                      </td>
                      <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>
                        {tgl(t.ditemukan_pada)}
                        <p className="text-[11px] text-ink-muted">{t.penemu ?? "—"}</p>
                      </td>
                      <td className={`${TD} text-xs text-ink-soft`}>{t.status_tugas === "Belum ditugaskan" ? "-" : (t.eksekutor ?? "-")}</td>
                      <td className={`${TD} text-xs text-ink-soft whitespace-nowrap`}>{t.status_tugas === "Belum ditugaskan" ? "-" : tgl(t.assigned_at)}</td>
                      <td className={TD}>
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_TUGAS[t.status_tugas]}`}>
                          {t.status_tugas}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
            <span>{(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, o.baris.length)} dari {o.baris.length} temuan</span>
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

      {tugaskan && (
        <TugaskanTemuanModal
          daftar={tugaskan.map((t) => ({ kunci: kunciTemuanJtr(t), judul: t.tiang_kode, keterangan: t.temuan }))}
          tugaskan={(p) => o.tugaskan(tugaskan, p)}
          onTutup={() => setTugaskan(null)}
          onSelesai={() => setTerpilih(new Set())}
        />
      )}
    </div>
  );
}
