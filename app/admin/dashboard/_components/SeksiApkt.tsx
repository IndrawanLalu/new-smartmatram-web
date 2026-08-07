"use client";

import dynamic from "next/dynamic";
import { Radio, UserX, Star } from "lucide-react";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import SectionHeader, { StatRingkas } from "./SectionHeader";
import type { DomainApkt } from "../_hooks/useDashboardOverview";

const ApktHarianChart = dynamic(() => import("./ApktHarianChart"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse rounded-lg bg-surface" />,
});

/** Menit → "1j 24m". Angka menit mentah di atas satu jam sulit dibandingkan
 *  dengan target yang orang hafal dalam jam. */
function menit(n: number | null): string {
  if (n === null) return "—";
  const b = Math.round(n);
  return b < 60 ? `${b}m` : `${Math.floor(b / 60)}j ${b % 60}m`;
}

function fmtTgl(s: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export default function SeksiApkt({ apkt }: { apkt: DomainApkt }) {
  const adaTarget = apkt.targetResponse !== null || apkt.targetRecovery !== null;

  return (
    <section className="space-y-3">
      <SectionHeader
        id="seksi-apkt"
        icon={Radio}
        judul="Gangguan Pelanggan (Yantek)"
        // Median, bukan rata-rata — mengikuti halaman Analisis Yantek, yang
        // memilih median karena durasi yantek berekor panjang.
        keterangan="Sumber dan rumusnya sama dengan Analisis Yantek, termasuk memakai median durasi. Ambang SLA dibaca dari setelan halaman itu."
        href="/admin/yantek"
        hrefLabel="Analisis Yantek"
      />

      {apkt.total === 0 ? (
        <div className={`${CARD} p-6 text-center`}>
          <p className="text-sm text-ink-soft">Belum ada data yantek pada periode ini.</p>
          <p className="text-xs text-ink-muted mt-1">
            {apkt.terakhirData
              ? `Data terakhir yang tersimpan: ${fmtTgl(apkt.terakhirData)}.`
              : "Data diunggah lewat perintah console di halaman Analisis Yantek."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
            <StatRingkas
              label="Total WO" nilai={apkt.total}
              catatan={apkt.terakhirData ? `s.d. ${fmtTgl(apkt.terakhirData)}` : "pada periode ini"}
            />
            <StatRingkas
              label="Response Time" nilai={menit(apkt.rptMedian)} catatan="median"
              nada={
                apkt.targetResponse !== null && apkt.rptMedian !== null
                  ? (apkt.rptMedian > apkt.targetResponse ? "kritis" : "aman")
                  : "netral"
              }
            />
            <StatRingkas
              label="Recovery Time" nilai={menit(apkt.rctMedian)} catatan="median"
              nada={
                apkt.targetRecovery !== null && apkt.rctMedian !== null
                  ? (apkt.rctMedian > apkt.targetRecovery ? "kritis" : "aman")
                  : "netral"
              }
            />
            <StatRingkas
              label="Lewat SLA Response"
              nilai={adaTarget ? apkt.lewatResponse : "—"}
              catatan={
                apkt.targetResponse !== null
                  ? `target ${menit(apkt.targetResponse)} · ${Math.round((apkt.lewatResponse / apkt.total) * 100)}%`
                  : "target belum diatur"
              }
              nada={apkt.lewatResponse > 0 ? "kritis" : "netral"}
            />
            <StatRingkas
              label="Lewat SLA Recovery"
              nilai={adaTarget ? apkt.lewatRecovery : "—"}
              catatan={
                apkt.targetRecovery !== null
                  ? `target ${menit(apkt.targetRecovery)} · ${Math.round((apkt.lewatRecovery / apkt.total) * 100)}%`
                  : "target belum diatur"
              }
              nada={apkt.lewatRecovery > 0 ? "waspada" : "netral"}
            />
            <StatRingkas
              label="Rating Pelanggan"
              nilai={apkt.ratingRataRata !== null ? apkt.ratingRataRata.toFixed(2) : "—"}
              satuan={apkt.ratingRataRata !== null ? "★" : undefined}
              catatan={apkt.jumlahRating ? `dari ${apkt.jumlahRating} penilaian` : "belum ada penilaian"}
              nada={
                apkt.ratingRataRata === null ? "netral"
                  : apkt.ratingRataRata >= 4.5 ? "aman"
                  : apkt.ratingRataRata >= 3.5 ? "waspada" : "kritis"
              }
            />
          </div>

          <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
            <div className={`${CARD} p-4 lg:col-span-2`}>
              <p className={EYEBROW}>Gangguan Harian & Durasi</p>
              <p className="text-[11px] text-ink-muted mt-0.5 mb-2">
                Batang = jumlah WO · garis = median response & recovery (menit)
              </p>
              <div className="h-60">
                <ApktHarianChart data={apkt.harian} targetResponse={apkt.targetResponse} />
              </div>
            </div>

            <div className={`${CARD} p-4`}>
              <div className="flex items-center gap-1.5">
                <UserX size={13} className="text-ink-muted shrink-0" />
                <p className={EYEBROW}>Petugas Terbanyak Lewat SLA</p>
              </div>
              <p className="text-[11px] text-ink-muted mt-0.5 mb-2">
                {adaTarget ? "Jumlah WO · yang lewat SLA" : "Target SLA belum diatur"}
              </p>
              {apkt.topPetugas.length === 0 ? (
                <p className="text-xs text-ink-soft">Belum ada data petugas.</p>
              ) : (
                <ul className="space-y-1.5">
                  {apkt.topPetugas.map((p) => (
                    <li key={p.nama} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 min-w-0 truncate text-ink" title={p.nama}>{p.nama}</span>
                      <span className="text-ink-muted tabular-nums shrink-0">{p.jumlah}</span>
                      <span
                        className={`font-bold tabular-nums w-9 text-right shrink-0 ${
                          p.lewat > 0 ? "text-red-600" : "text-ink-muted"
                        }`}
                      >
                        {adaTarget ? p.lewat : "—"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {apkt.jumlahRating > 0 && (
                <p className="mt-3 pt-2.5 border-t border-line text-[11px] text-ink-muted flex items-center gap-1">
                  <Star size={11} className="text-amber-500 shrink-0" />
                  {apkt.jumlahRating} dari {apkt.total} WO dinilai pelanggan
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
