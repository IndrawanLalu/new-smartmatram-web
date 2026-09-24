"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, Send, TriangleAlert } from "lucide-react";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { STATUS_TUGAS, kunciTemuan, useTemuanJtm, type TemuanJtm as Temuan } from "../_hooks/useTemuanJtm";
import { NADA_TUGAS, tgl } from "../_lib/tampilan";
import DetailTemuanModal from "./DetailTemuanModal";
import TugaskanTemuanModal from "./TugaskanTemuanModal";

/**
 * Tab Temuan — temuan inspeksi JTM yang sudah disetujui, siap ditugaskan.
 * Kolom WO = eksekutor tugasnya, Tgl WO = saat ditugaskan ("-" kalau belum).
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top";

export default function TemuanJtm({ ulp, oleh }: { ulp: string; oleh: string }) {
  const o = useTemuanJtm(ulp, oleh);
  const [halaman, setHalaman] = useState(1);
  const [terpilih, setTerpilih] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<string | null>(null);
  const [tugaskan, setTugaskan] = useState<Temuan[] | null>(null);

  const total = Math.max(1, Math.ceil(o.baris.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = o.baris.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);
  const bisaPilih = (t: Temuan) => t.status_tugas === "Belum ditugaskan";
  const pilihan = o.semua.filter((t) => terpilih.has(kunciTemuan(t)) && bisaPilih(t));
  const dtl = detail ? (o.semua.find((t) => kunciTemuan(t) === detail) ?? null) : null;
  const halamanBisa = tampil.filter(bisaPilih);
  const semuaHalamanTerpilih = halamanBisa.length > 0 && halamanBisa.every((t) => terpilih.has(kunciTemuan(t)));

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
        if (semuaHalamanTerpilih) n.delete(kunciTemuan(t));
        else n.add(kunciTemuan(t));
      }
      return n;
    });
  const saring = (f: () => void) => { f(); setHalaman(1); };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(["SEMUA", "Jaringan", "ROW"] as const).map((j) => (
          <button key={j} onClick={() => saring(() => o.setJenis(j))} className={`${CHIP} ${o.jenis === j ? CHIP_ON : CHIP_OFF}`}>
            {j === "SEMUA" ? "Semua jenis" : j}
            {j !== "SEMUA" && <span className="opacity-70">{o.loading ? "" : o.hitungJenis[j]}</span>}
          </button>
        ))}
        <span className="w-px h-6 bg-line mx-1" />
        {STATUS_TUGAS.map((s) => (
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
            placeholder="Cari tiang / segmen / penyulang / item"
            className={`${FIELD} w-[260px] pl-8`}
          />
        </div>
      </div>

      <p className="text-[11px] text-ink-muted -mt-1">
        Hanya temuan dari inspeksi yang sudah <b>disetujui</b>. Temuan hilang sendiri begitu inspeksi berikutnya mencatat
        itemnya normal.
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
            Temuan muncul di sini setelah inspeksi JTM yang mencatatnya disetujui di tab Daftar Inspeksi.
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
                  <th className={TH}>Penyulang · Segmen</th>
                  <th className={TH}>Temuan</th>
                  <th className={TH}>Ditemukan</th>
                  <th className={TH}>WO</th>
                  <th className={TH}>Tgl WO</th>
                  <th className={TH}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tampil.map((t) => {
                  const k = kunciTemuan(t);
                  return (
                    <tr key={k} onClick={() => setDetail(k)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                      <td className={TD} onClick={(e) => e.stopPropagation()}>
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
                        <p className="text-[10px] font-semibold text-ink-muted">{t.jenis} · {t.ulp}</p>
                      </td>
                      <td className={`${TD} text-xs text-ink-soft`}>
                        {t.penyulang ?? "—"}
                        <p className="text-[11px] text-ink-muted max-w-56 truncate">{t.segmen_nama ?? "—"}</p>
                      </td>
                      <td className={`${TD} text-xs`}>
                        <span className="text-ink">{t.item_nama}{t.bagian && t.bagian !== "-" ? ` (${t.bagian})` : ""}</span>
                        <p className="text-amber-800 font-semibold">{t.nilai_label ?? t.nilai ?? "—"}</p>
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

      {dtl && !tugaskan && (
        <DetailTemuanModal key={detail} t={dtl} onTutup={() => setDetail(null)} onTugaskan={() => setTugaskan([dtl])} />
      )}
      {tugaskan && (
        <TugaskanTemuanModal
          pilih={tugaskan}
          tugaskan={o.tugaskan}
          onTutup={() => setTugaskan(null)}
          onSelesai={() => setTerpilih(new Set())}
        />
      )}
    </div>
  );
}
