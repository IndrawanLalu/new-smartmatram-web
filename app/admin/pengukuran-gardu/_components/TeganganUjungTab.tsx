"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Search, TriangleAlert } from "lucide-react";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import { STATUS_UJUNG, useTeganganUjung, type StatusUjung, type TitikUjung } from "../_hooks/useTeganganUjung";
import DetailUjungModal, { NADA_UJUNG, meter } from "./DetailUjungModal";

/**
 * Tab Tegangan Ujung — daftar TABEL titik ukur di ujung JTR (klik = rincian
 * dengan peta, foto, Setujui/Kembalikan/Batalkan), ditambah dua sorotan:
 * gardu yang bebannya terkirim tapi belum punya tegangan ujung, dan titik
 * dengan tegangan di bawah standar (< 198 V).
 */

type Saring = StatusUjung | "tanpa" | "bawah" | "SEMUA";

const PAGE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top text-xs";
const cocok = (k: string, v: (string | null)[]) => !k || v.some((x) => (x ?? "").toUpperCase().includes(k));
const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export default function TeganganUjungTab({ ulp, oleh }: { ulp: string; oleh: string }) {
  const o = useTeganganUjung(ulp, oleh);
  const [saring, setSaring] = useState<Saring>("Menunggu verifikasi");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [detail, setDetail] = useState<string | null>(null);

  const k = cari.trim().toUpperCase();

  const baris = useMemo(() => {
    if (saring === "tanpa") return [];
    return o.titik.filter(
      (t) =>
        (saring === "SEMUA" ||
          (saring === "bawah" ? t.di_bawah_standar && t.status !== "Dibatalkan" : t.status_tampil === saring)) &&
        cocok(k, [t.gardu_kode, t.gardu_nama, t.penyulang, t.petugas_nama]),
    );
  }, [o.titik, saring, k]);

  const tanpa = useMemo(
    () => o.tanpa.filter((b) => cocok(k, [b.no_gardu, b.gardu_nama, b.penyulang, b.petugas_nama])),
    [o.tanpa, k],
  );

  const jumlah = saring === "tanpa" ? tanpa.length : baris.length;
  const total = Math.max(1, Math.ceil(jumlah / PAGE));
  const hal = Math.min(halaman, total);
  const tampil = baris.slice((hal - 1) * PAGE, hal * PAGE);
  const tampilTanpa = tanpa.slice((hal - 1) * PAGE, hal * PAGE);
  const dtl: TitikUjung | null = detail ? (o.titik.find((t) => t.id === detail) ?? null) : null;
  const pilih = (s: Saring) => { setSaring(s); setHalaman(1); };

  const chip = (s: Saring, label: string, n: number, merah = false) => (
    <button key={s} onClick={() => pilih(s)} className={`${CHIP} ${saring === s ? CHIP_ON : CHIP_OFF}`}>
      {label} <span className={`opacity-70 ${merah && n > 0 && saring !== s ? "text-red-700 opacity-100 font-bold" : ""}`}>{o.loading ? "" : n}</span>
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={o.bulan} onChange={(e) => o.setBulan(Number(e.target.value))} className={`${FIELD} w-[140px]`} aria-label="Bulan">
          {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
        </select>
        <select value={o.tahun} onChange={(e) => o.setTahun(Number(e.target.value))} className={`${FIELD} w-[100px]`} aria-label="Tahun">
          {[o.tahun + 1, o.tahun, o.tahun - 1].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="relative ml-auto">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            value={cari}
            onChange={(e) => { setCari(e.target.value); setHalaman(1); }}
            placeholder="Cari gardu / penyulang / petugas"
            className={`${FIELD} w-[260px] pl-8`}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_UJUNG.map((s) => chip(s, s, o.hitung[s]))}
        <button onClick={() => pilih("SEMUA")} className={`${CHIP} ${saring === "SEMUA" ? CHIP_ON : CHIP_OFF}`}>Semua</button>
        <span className="w-px h-6 bg-line mx-1" />
        {chip("tanpa", "Gardu belum diukur ujung", o.tanpa.length, true)}
        {chip("bawah", "Di bawah standar (< 198 V)", o.hitung.bawah, true)}
      </div>

      {o.galat && !o.loading ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Tegangan ujung gagal dimuat</p>
            <p className="mt-0.5 text-amber-700">{o.galat} — kosongnya tabel bukan berarti tidak ada data.</p>
            <button onClick={o.muat} className="mt-2 font-semibold text-navy-600 hover:text-navy-500">Muat ulang</button>
          </div>
        </div>
      ) : o.loading ? (
        <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
          <Loader2 size={16} className="animate-spin" /> Memuat tegangan ujung…
        </div>
      ) : jumlah === 0 ? (
        <div className={`${CARD} p-10 text-center text-sm text-ink-soft`}>
          {saring === "tanpa" ? "Semua beban terkirim bulan ini sudah punya tegangan ujung." : "Tidak ada titik tegangan ujung untuk saringan ini."}
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            {saring === "tanpa" ? (
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className={TH}>Gardu</th>
                    <th className={TH}>Penyulang</th>
                    <th className={TH}>Tanggal beban</th>
                    <th className={TH}>Petugas</th>
                  </tr>
                </thead>
                <tbody>
                  {tampilTanpa.map((b) => (
                    <tr key={b.id}>
                      <td className={TD}>
                        <p className="font-semibold text-ink text-sm">{b.no_gardu}</p>
                        <p className="text-[11px] text-ink-muted">{b.gardu_nama ?? "—"} · {b.ulp}</p>
                      </td>
                      <td className={`${TD} text-ink-soft`}>{b.penyulang ?? "—"}</td>
                      <td className={`${TD} text-ink-soft whitespace-nowrap`}>{b.tanggal_pengukuran}</td>
                      <td className={`${TD} text-ink-soft`}>{b.petugas_nama ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className={TH}>Gardu · Jurusan</th>
                    <th className={`${TH} text-right`}>R-N / S-N / T-N (V)</th>
                    <th className={`${TH} text-right`}>Dari gardu</th>
                    <th className={`${TH} text-right`}>Dari ujung terjauh</th>
                    <th className={`${TH} text-right`}>GPS</th>
                    <th className={TH}>Petugas · Tanggal</th>
                    <th className={TH}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((t) => (
                    <tr key={t.id} onClick={() => setDetail(t.id)} className="cursor-pointer hover:bg-navy-50/60 transition-colors">
                      <td className={TD}>
                        <p className="font-semibold text-ink text-sm">{t.gardu_kode} <span className="text-accent-deep">· {t.jurusan}</span></p>
                        <p className="text-[11px] text-ink-muted">{t.penyulang ?? "—"} · {t.ulp}</p>
                      </td>
                      <td className={`${TD} text-right tabular-nums whitespace-nowrap ${t.di_bawah_standar ? "text-red-700 font-semibold" : "text-ink"}`}>
                        {t.v_rn} / {t.v_sn} / {t.v_tn}
                      </td>
                      <td className={`${TD} text-right tabular-nums ${t.jarak_gardu_m !== null && t.jarak_gardu_m < 30 ? "text-amber-700 font-semibold" : "text-ink-soft"}`}>
                        {meter(t.jarak_gardu_m)}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-ink-soft`}>{t.tiang_rekomendasi_kode ? meter(t.jarak_rekomendasi_m) : "—"}</td>
                      <td className={`${TD} text-right tabular-nums ${t.akurasi_m !== null && t.akurasi_m > 20 ? "text-amber-700 font-semibold" : "text-ink-soft"}`}>
                        {t.akurasi_m === null ? "—" : `±${Math.round(t.akurasi_m)} m`}
                      </td>
                      <td className={`${TD} text-ink-soft`}>
                        {t.petugas_nama ?? "—"}
                        <p className="text-[11px] text-ink-muted whitespace-nowrap">{t.tgl_ukur} {t.jam_ukur?.slice(0, 5) ?? ""}</p>
                      </td>
                      <td className={TD}>
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_UJUNG[t.status_tampil]}`}>
                          {t.status_tampil}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
            <span>{(hal - 1) * PAGE + 1}–{Math.min(hal * PAGE, jumlah)} dari {jumlah}</span>
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

      {dtl && (
        <DetailUjungModal
          key={dtl.id}
          t={dtl}
          onTutup={() => setDetail(null)}
          setujui={o.setujui}
          kembalikan={o.kembalikan}
          batalkan={o.batalkan}
        />
      )}
    </div>
  );
}
