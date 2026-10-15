"use client";

import Link from "next/link";
import {
  Activity, ArrowUpDown, ArrowUpRight, BarChart3, CheckCircle2, CheckSquare, Gauge, HardHat, Hourglass, Info, Layers, Loader2,
  Network, Scale, ScanSearch, Target, TrendingUp, Trees, Waypoints, Wrench,
  type LucideIcon,
} from "lucide-react";
import { CARD, DISPLAY } from "@/app/admin/_ui";
import { Kolom } from "@/app/admin/_kit/Tabel";
import { IKON as IKON_UI } from "@/lib/ikonUi";
import { NADA_UI, type NadaStatus } from "@/lib/statusUi";
import { capaianSla, capaianWo, type BarisKinerja } from "../_hooks/useKinerjaYantek";
import { KUNCI_CENTANG } from "../_lib/woSurat";

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
  jtm2: Waypoints,
  jtr: Network,
  igardu1: ScanSearch,
  igardu2: ScanSearch,
};

const TANDA: Record<BarisKinerja["keadaan"], { teks: string; cls: string } | null> = {
  lengkap: null,
  tanpaWo: { teks: "belum ber-WO", cls: NADA_UI.tunggu.pil },
  belumAda: { teks: "belum ada modulnya", cls: NADA_UI.masalah.pil },
};

/** Ambang capaian -> nada dari peta status bersama; legenda di kepala kartu
 *  dibaca dari daftar yang sama, jadi warna dan artinya tidak bisa berpisah. */
const AMBANG: { min: number; nada: NadaStatus; label: string }[] = [
  { min: 80, nada: "selesai", label: "≥ 80%" },
  { min: 50, nada: "tunggu", label: "50–79%" },
  { min: -Infinity, nada: "masalah", label: "< 50%" },
];

const nadaPersen = (p: number) => NADA_UI[AMBANG.find((a) => p >= a.min)!.nada];

function Capaian({ p }: { p: number | null }) {
  if (p === null) return <span className="text-ink-muted text-xs">—</span>;
  const n = nadaPersen(p);
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-24 h-1.5 rounded-full bg-surface overflow-hidden">
        <div className={`h-full rounded-full ${n.titik}`} style={{ width: `${Math.min(100, p)}%` }} />
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
  /** Buka centang realisasi (JTM Tier 2, Inspeksi Gardu) — hanya untuk yang boleh. */
  onCentang?: (kunci: string) => void;
}

// Garis sel tegas di semua sisi — diminta user: bentuk tabel, bukan daftar.
const TD = "px-4 py-3 align-middle border border-slate-300";

export default function TabelKinerja({ baris, loading, periode, onCentang }: Props) {
  const belum = baris.filter((b) => b.keadaan !== "lengkap").length;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 grid place-items-center shrink-0">
            <BarChart3 size={19} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h3 className={`${DISPLAY} text-base font-bold text-ink`}>Rekap Kinerja {periode}</h3>
            <p className="text-xs text-ink-soft mt-0.5">
              {baris.length} jenis pekerjaan Pelayanan Teknik · {belum} di antaranya belum ber-WO
            </p>
          </div>
          {loading && (
            <span className="flex items-center gap-1.5 text-xs text-ink-soft">
              <Loader2 size={14} className="animate-spin" /> memuat…
            </span>
          )}
        </div>
        <div className="flex items-center gap-4 text-[11.5px] text-ink-soft" aria-label="Arti warna capaian">
          <span className="font-semibold">Capaian</span>
          {AMBANG.map((a) => (
            <span key={a.nada} className="inline-flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${NADA_UI[a.nada].titik}`} />
              {a.label}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[1180px] [&_tr>*:first-child]:border-l-0 [&_tr>*:last-child]:border-r-0">
          <thead>
            <tr>
              <Kolom bergaris ikon={Layers} lebar="min-w-[250px]">Jenis pekerjaan</Kolom>
              <Kolom bergaris kanan ikon={IKON_UI.wo}>WO terbit</Kolom>
              <Kolom bergaris kanan ikon={Target}>SLA</Kolom>
              <Kolom bergaris kanan ikon={CheckCircle2}>Realisasi</Kolom>
              <Kolom bergaris kanan ikon={Hourglass}>Belum disetujui</Kolom>
              <Kolom bergaris kanan ikon={TrendingUp} lebar="min-w-[170px]">Capaian WO</Kolom>
              <Kolom bergaris kanan ikon={Gauge} lebar="min-w-[170px]">Capaian SLA</Kolom>
              <Kolom bergaris ikon={Info} lebar="min-w-[280px]">Keterangan</Kolom>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const tanda = TANDA[b.keadaan];
              const mati = b.keadaan === "belumAda";
              const Ikon = IKON[b.kunci] ?? Activity;
              return (
                <tr key={b.kunci} className={`transition-colors ${mati ? "bg-surface/50" : "hover:bg-brand-50/40"}`}>
                  <td className={TD}>
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          mati ? "bg-surface text-ink-muted" : "bg-brand-50 text-brand-600"
                        }`}
                      >
                        <Ikon size={17} />
                      </span>
                      <div className="min-w-0">
                        {b.href ? (
                          <Link
                            href={b.href}
                            className="group inline-flex items-center gap-1 text-sm font-semibold text-ink hover:text-brand-600"
                          >
                            {b.jenis}
                            <ArrowUpRight size={13} className="text-ink-muted group-hover:text-brand-600" />
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
                          {onCentang && KUNCI_CENTANG.includes(b.kunci) && (
                            <button
                              onClick={() => onCentang(b.kunci)}
                              className="inline-flex items-center gap-1 px-1.5 py-px rounded-full border border-brand-200 bg-brand-50 text-[10px] font-semibold text-brand-700 hover:bg-brand-100"
                            >
                              <CheckSquare size={10} /> centang realisasi
                            </button>
                          )}
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
                    {!!b.woGardu && (
                      <span className="block text-[11px] text-ink-soft tabular-nums whitespace-nowrap" title="Jumlah gardu di WO — KMS-nya belum semua terukur">
                        {b.woGardu.toLocaleString("id-ID")} gardu
                      </span>
                    )}
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
                    {b.dinilaiSla ? (
                      <span className="text-ink-muted text-xs" title="WO disusun dari jalur yang dikerjakan — dinilai terhadap SLA">
                        WO = realisasi
                      </span>
                    ) : (
                      <Capaian p={capaianWo(b)} />
                    )}
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
          untuk pekerjaan yang belum ber-WO. <b>Inspeksi JTR</b> dinilai terhadap SLA saja: WO-nya
          disusun dari jalur yang dikerjakan, jadi WO selalu sama dengan realisasi. SLA diisi per ULP lewat <b>Atur SLA</b>; seluruh
          tahun = jumlah SLA bulanannya (tahun berjalan: sampai bulan ini), semua ULP = jumlah
          SLA tiap ULP. Yang belum punya pembanding sengaja dikosongkan daripada dihitung
          terhadap angka yang dikarang.
        </p>
      </div>
    </div>
  );
}
