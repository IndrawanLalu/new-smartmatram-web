"use client";

import Link from "next/link";
import { ChevronRight, Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import { kolomPersen, type BarisKinerja } from "../_hooks/useKinerjaYantek";

/**
 * Tabel rekap kinerja — sepola Rekap Tahunan di Pengukuran Gardu.
 *
 * ── YANG KOSONG TIDAK DISEMBUNYIKAN ─────────────────────────────────────────
 * Baris yang modulnya belum ada tetap muncul, bertanda, dengan alasannya
 * tertulis. Itu bukan kelalaian — itu maksudnya: daftar pekerjaan rumah yang
 * hidup di layar yang sama dengan angkanya akan terus terbaca, sedangkan yang
 * disimpan di dokumen terpisah berhenti dibaca pada minggu kedua.
 *
 * ── TIDAK ADA BARIS TOTAL ───────────────────────────────────────────────────
 * Rekap Tahunan Pengukuran punya baris total karena kolomnya satuan yang sama
 * (gardu). Di sini satuannya bercampur — KILOMETER untuk perabasan dan inspeksi
 * JTM/JTR, GARDU untuk pengukuran, pemeliharaan, dan penyeimbangan. Menjumlah
 * 12 km dengan 40 gardu melahirkan angka yang terlihat resmi tapi tidak berarti
 * apa-apa. Satuannya ditulis di tiap baris justru supaya tidak ada yang tergoda
 * membandingkannya.
 */

function Persen({ b }: { b: BarisKinerja }) {
  const p = kolomPersen(b);
  if (p === null) {
    return <span className="text-ink-muted text-xs">—</span>;
  }
  const cls =
    p >= 80 ? "bg-emerald-50 text-emerald-700" :
    p >= 50 ? "bg-amber-50 text-amber-700" :
              "bg-red-50 text-red-700";
  return <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cls}`}>{p}%</span>;
}

/** Angka km ditulis dua desimal berkoma, cacah ditulis bulat.
 *
 *  Bukan kerapian: "2,03" dan "2" adalah panjang yang berbeda, dan
 *  membulatkannya jadi satuan km membuat segmen 300 meter menghilang dari
 *  laporan sama sekali. */
function Angka({ v, nada, desimal }: { v: number | null; nada?: string; desimal?: boolean }) {
  if (v === null) return <span className="text-ink-muted">—</span>;
  if (v === 0) return <span className="text-ink-muted">{desimal ? "0,00" : "0"}</span>;
  const teks = desimal ? v.toFixed(2).replace(".", ",") : String(v);
  return <span className={`font-semibold ${nada ?? "text-ink"}`}>{teks}</span>;
}

const TANDA: Record<BarisKinerja["keadaan"], { teks: string; cls: string } | null> = {
  lengkap: null,
  tanpaWo: { teks: "belum ber-WO", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  belumAda: { teks: "belum ada modulnya", cls: "bg-red-50 text-red-700 border-red-200" },
};

interface Props {
  baris: BarisKinerja[];
  loading: boolean;
  /** Sudah dirangkai jadi "September 2026" atau "2026" — periodenya ditulis
   *  di judul supaya tangkapan layar tabel ini tetap bisa dibaca sendiri. */
  periode: string;
}

export default function TabelKinerja({ baris, loading, periode }: Props) {
  const TH =
    "px-3 py-2 text-center text-[11px] font-semibold border-b border-r border-line whitespace-nowrap text-ink-soft";
  const TD = "px-3 py-3 text-center text-xs border-b border-r border-line";

  const belum = baris.filter((b) => b.keadaan !== "lengkap").length;

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-3.5 border-b border-line flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">Rekap Kinerja {periode}</h3>
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
        <table className="w-full border-collapse min-w-[860px]">
          <thead className="bg-surface">
            <tr>
              <th className={`${TH} text-left min-w-[230px]`}>Jenis pekerjaan</th>
              <th className={TH}>WO terbit</th>
              <th className={TH}>Realisasi</th>
              <th className={TH}>Belum disetujui</th>
              <th className={TH}>Capaian</th>
              <th className={`${TH} text-left min-w-[280px] border-r-0`}>Keterangan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const tanda = TANDA[b.keadaan];
              const mati = b.keadaan === "belumAda";
              return (
                <tr key={b.kunci} className={mati ? "bg-surface/60" : "hover:bg-surface/50"}>
                  <td className={`${TD} text-left`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      {b.href ? (
                        <Link
                          href={b.href}
                          className="font-semibold text-navy-600 hover:text-navy-500 inline-flex items-center gap-0.5"
                        >
                          {b.jenis}
                          <ChevronRight size={13} />
                        </Link>
                      ) : (
                        <span className="font-semibold text-ink-muted">{b.jenis}</span>
                      )}
                      {tanda && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold ${tanda.cls}`}
                        >
                          {tanda.teks}
                        </span>
                      )}
                    </div>
                    {!mati && (
                      <span className="text-[10px] text-ink-muted">satuan: {b.satuan}</span>
                    )}
                  </td>
                  <td className={TD}>
                    <Angka v={b.woTerbit} desimal={b.desimal} />
                  </td>
                  <td className={TD}>
                    <Angka v={b.realisasi} nada="text-emerald-700" desimal={b.desimal} />
                  </td>
                  <td className={TD}>
                    <Angka v={b.belumApprove} nada="text-amber-700" desimal={b.desimal} />
                  </td>
                  <td className={TD}>
                    <Persen b={b} />
                  </td>
                  <td className={`${TD} text-left text-[11px] text-ink-soft leading-snug border-r-0`}>
                    {b.catatan}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 bg-surface/60 border-t border-line">
        <p className="text-[11px] text-ink-soft leading-relaxed">
          <b>Capaian hanya muncul kalau ada WO-nya.</b> Pekerjaan yang lahir dari lapangan —
          inspeksi JTM/JTR, pemeliharaan gardu, penyeimbangan — belum punya angka target, jadi
          realisasinya tidak punya pembanding. Selama itu belum ada, persentasenya sengaja
          dikosongkan daripada dihitung terhadap angka yang dikarang.
        </p>
      </div>
    </div>
  );
}
