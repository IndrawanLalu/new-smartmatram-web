"use client";

import Link from "next/link";
import {
  Activity, ArrowUpDown, ArrowUpRight, Gauge, HardHat, Loader2, Network, Scale, Trees, Waypoints, Wrench,
  type LucideIcon,
} from "lucide-react";
import { CARD, DISPLAY } from "@/app/admin/_ui";
import { capaianSla, capaianWo, type BarisKinerja } from "../_hooks/useKinerjaYantek";

/**
 * Tabel rekap kinerja — bergaris tegas di tiap sel, ikon per jenis pekerjaan,
 * angka rata kanan bersatuan, capaian sebagai bilah.
 *
 * ── YANG KOSONG TIDAK DISEMBUNYIKAN ─────────────────────────────────────────
 * Baris yang modulnya belum ada tetap muncul, bertanda, dengan alasannya
 * tertulis. Itu bukan kelalaian — itu maksudnya: daftar pekerjaan rumah yang
 * hidup di layar yang sama dengan angkanya akan terus terbaca, sedangkan yang
 * disimpan di dokumen terpisah berhenti dibaca pada minggu kedua.
 *
 * ── TIDAK ADA BARIS TOTAL ───────────────────────────────────────────────────
 * Satuannya bercampur — KILOMETER untuk perabasan dan inspeksi JTM/JTR, GARDU
 * untuk pengukuran, pemeliharaan, dan penyeimbangan. Menjumlah 12 km dengan
 * 40 gardu melahirkan angka yang terlihat resmi tapi tidak berarti apa-apa.
 * Satuannya ditulis di tiap sel justru supaya tidak ada yang tergoda
 * membandingkannya.
 */

/** Ikon sama dengan menu samping, supaya baris dan menunya saling mengenali. */
const IKON: Record<string, LucideIcon> = {
  perabasan: Trees,
  harjtm: HardHat,
  hargardu: Wrench,
  penyeimbangan: Scale,
  optimasi: ArrowUpDown,
  pengukuran: Gauge,
  jtm: Waypoints,
  jtr: Network,
};

const TANDA: Record<BarisKinerja["keadaan"], { teks: string; cls: string } | null> = {
  lengkap: null,
  tanpaWo: { teks: "belum ber-WO", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  belumAda: { teks: "belum ada modulnya", cls: "bg-red-50 text-red-700 border-red-200" },
};

const nadaPersen = (p: number) =>
  p >= 80 ? { bilah: "bg-emerald-500", teks: "text-emerald-700" } :
  p >= 50 ? { bilah: "bg-amber-500", teks: "text-amber-700" } :
            { bilah: "bg-red-500", teks: "text-red-700" };

function Capaian({ p }: { p: number | null }) {
  if (p === null) return <span className="text-ink-muted text-xs">—</span>;
  const n = nadaPersen(p);
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-24 h-1.5 rounded-full bg-surface overflow-hidden">
        <div className={`h-full rounded-full ${n.bilah}`} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
      <span className={`${DISPLAY} w-11 text-right text-sm font-bold tabular-nums ${n.teks}`}>{p}%</span>
    </div>
  );
}

/** Angka km ditulis dua desimal berkoma, cacah ditulis bulat.
 *
 *  Bukan kerapian: "2,03" dan "2" adalah panjang yang berbeda, dan
 *  membulatkannya jadi satuan km membuat segmen 300 meter menghilang dari
 *  laporan sama sekali. */
function Angka({ v, satuan, nada, desimal }: { v: number | null; satuan: string; nada?: string; desimal?: boolean }) {
  if (v === null) return <span className="text-ink-muted">—</span>;
  const teks = desimal ? v.toFixed(2).replace(".", ",") : v.toLocaleString("id-ID");
  // Satuan di KIRI angka dan angka rata kanan (permintaan user 25 Sep 2026):
  // digit satuan, puluhan, dan desimal tiap baris jatuh di kolom yang sama.
  return (
    <span className="inline-flex items-baseline justify-end gap-1.5 whitespace-nowrap">
      <span className="text-[10px] font-semibold uppercase text-ink-muted">{satuan}</span>
      <span className={`${DISPLAY} text-sm font-bold tabular-nums ${v === 0 ? "text-ink-muted" : (nada ?? "text-ink")}`}>{teks}</span>
    </span>
  );
}

interface Props {
  baris: BarisKinerja[];
  loading: boolean;
  /** Sudah dirangkai jadi "September 2026" atau "2026" — periodenya ditulis
   *  di judul supaya tangkapan layar tabel ini tetap bisa dibaca sendiri. */
  periode: string;
}

// Garis sel tegas di semua sisi — diminta user: bentuk tabel, bukan daftar.
const TH = "px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-ink whitespace-nowrap border border-slate-300";
const TD = "px-4 py-3 align-middle border border-slate-300";

export default function TabelKinerja({ baris, loading, periode }: Props) {
  const belum = baris.filter((b) => b.keadaan !== "lengkap").length;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-navy-600 shrink-0" />
            <h3 className={`${DISPLAY} text-base font-bold text-ink`}>Rekap Kinerja {periode}</h3>
          </div>
          <p className="text-xs text-ink-soft mt-0.5">
            Delapan jenis pekerjaan Pelayanan Teknik · {belum} di antaranya belum lengkap
          </p>
        </div>
        {loading && (
          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <Loader2 size={14} className="animate-spin" /> memuat…
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[1180px] [&_tr>*:first-child]:border-l-0 [&_tr>*:last-child]:border-r-0">
          <thead className="bg-slate-100">
            <tr>
              <th className={`${TH} text-left min-w-[250px]`}>Jenis pekerjaan</th>
              <th className={`${TH} text-right`}>WO terbit</th>
              <th className={`${TH} text-right`}>SLA</th>
              <th className={`${TH} text-right`}>Realisasi</th>
              <th className={`${TH} text-right`}>Belum disetujui</th>
              <th className={`${TH} text-right min-w-[170px]`}>Capaian WO</th>
              <th className={`${TH} text-right min-w-[170px]`}>Capaian SLA</th>
              <th className={`${TH} text-left min-w-[280px]`}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const tanda = TANDA[b.keadaan];
              const mati = b.keadaan === "belumAda";
              const Ikon = IKON[b.kunci] ?? Activity;
              return (
                <tr key={b.kunci} className={`transition-colors ${mati ? "bg-surface/50" : "hover:bg-navy-50/40"}`}>
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          mati ? "bg-surface text-ink-muted" : "bg-navy-50 text-navy-600"
                        }`}
                      >
                        <Ikon size={17} />
                      </span>
                      <div className="min-w-0">
                        {b.href ? (
                          <Link
                            href={b.href}
                            className="group inline-flex items-center gap-1 text-sm font-semibold text-ink hover:text-navy-600"
                          >
                            {b.jenis}
                            <ArrowUpRight size={13} className="text-ink-muted group-hover:text-navy-600" />
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold text-ink-muted">{b.jenis}</span>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {!mati && <span className="text-[10px] text-ink-muted">satuan {b.satuan}</span>}
                          {tanda && (
                            <span className={`px-1.5 py-px rounded-full border text-[10px] font-semibold ${tanda.cls}`}>
                              {tanda.teks}
                            </span>
                          )}
                          {/* Baris yang sumbernya tidak terbaca harus mengaku
                              begitu. Sel kosong tanpa tanda terbaca sebagai
                              "memang belum ada pekerjaannya". */}
                          {b.gagal && (
                            <span className="px-1.5 py-px rounded-full border border-amber-300 bg-amber-50 text-[10px] font-semibold text-amber-700">
                              gagal dimuat
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className={`${TD} text-right`}>
                    <Angka v={b.woTerbit} satuan={b.satuan} desimal={b.desimal} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <Angka v={b.sla} satuan={b.satuan} desimal={b.desimal} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <Angka v={b.realisasi} satuan={b.satuan} nada="text-emerald-700" desimal={b.desimal} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <Angka v={b.belumApprove} satuan={b.satuan} nada="text-amber-700" desimal={b.desimal} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <Capaian p={capaianWo(b)} />
                  </td>
                  <td className={`${TD} text-right`}>
                    <Capaian p={capaianSla(b)} />
                  </td>
                  <td className={`${TD} text-[11px] text-ink-soft leading-snug`}>{b.catatan}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 bg-surface/60 border-t border-line">
        <p className="text-[11px] text-ink-soft leading-relaxed">
          <b>Capaian WO</b> = realisasi ÷ WO terbit, hanya muncul kalau ada WO-nya.{" "}
          <b>Capaian SLA</b> = seluruh realisasi (WO maupun di luar WO) ÷ SLA — pembanding
          untuk pekerjaan yang belum ber-WO. SLA diisi per ULP lewat <b>Atur SLA</b>; seluruh
          tahun = jumlah SLA bulanannya (tahun berjalan: sampai bulan ini), semua ULP = jumlah
          SLA tiap ULP. Yang belum punya pembanding sengaja dikosongkan daripada dihitung
          terhadap angka yang dikarang.
        </p>
      </div>
    </div>
  );
}
