"use client";

import dynamic from "next/dynamic";
import { Gauge, Scale, AlertTriangle, Wrench } from "lucide-react";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import { STATUS_COLOR } from "@/lib/chartColors";
import SectionHeader, { StatRingkas } from "./SectionHeader";
import { BarList } from "./DomainCard";
import type { DomainGardu, DomainPemerataan } from "../_hooks/useDashboardOverview";

const DistribusiBebanDonut = dynamic(
  () => import("@/app/admin/pengukuran-gardu/_components/DistribusiBebanDonut"),
  { ssr: false, loading: () => <div className="h-full animate-pulse rounded-lg bg-surface" /> },
);

const pct1 = (n: number) => `${n.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`;

function fmtTgl(s: string | null) {
  if (!s) return "—";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}/${m}/${y.slice(2)}`;
}

interface Props {
  gardu: DomainGardu;
  pemerataan: DomainPemerataan;
}

export default function SeksiGardu({ gardu, pemerataan }: Props) {
  const cakupan = gardu.totalMaster
    ? Math.round((gardu.terukur / gardu.totalMaster) * 100)
    : 0;

  return (
    <section className="space-y-3">
      <SectionHeader
        id="seksi-gardu"
        icon={Gauge}
        judul="Gardu Distribusi"
        // Perbedaan ini bukan detail teknis — tanpa dinyatakan, orang membaca
        // angka overload sebagai kejadian bulan ini, padahal ia keadaan armada.
        keterangan="Kondisi armada diambil dari pengukuran atau pemeliharaan TERAKHIR tiap gardu, jadi tidak mengikuti periode. Hanya baris aktivitas di bawah yang mengikuti periode."
        href="/admin/pengukuran-gardu"
        hrefLabel="Pengukuran Gardu"
      />

      <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        <StatRingkas label="Di Master" nilai={gardu.totalMaster} catatan="seluruh gardu terdaftar" />
        <StatRingkas
          label="Sudah Diukur" nilai={gardu.terukur} catatan={`cakupan ${cakupan}%`}
          nada={cakupan >= 80 ? "aman" : "netral"}
        />
        <StatRingkas
          label="Belum Diukur" nilai={gardu.belumDiukur} catatan="belum pernah sama sekali"
          nada={gardu.belumDiukur > 0 ? "waspada" : "netral"}
          href="/admin/pengukuran-gardu"
        />
        <StatRingkas
          label="Perlu Ukur Ulang" nilai={gardu.perluUkurUlang} catatan="pengukuran sudah basi"
          nada={gardu.perluUkurUlang > 0 ? "waspada" : "netral"}
        />
        <StatRingkas
          label="Overload" nilai={gardu.overload} catatan={`≥80% · ${gardu.overloadDiPeriode} di periode ini`}
          nada={gardu.overload > 0 ? "kritis" : "netral"}
        />
        <StatRingkas
          label="Suhu Tinggi" nilai={gardu.suhuTinggi} catatan="trafo ≥60°C"
          nada={gardu.suhuTinggi > 0 ? "kritis" : "netral"}
        />
      </div>

      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        <div className={`${CARD} p-4`}>
          <p className={EYEBROW}>Distribusi Beban Trafo</p>
          <p className="text-[11px] text-ink-muted mt-0.5 mb-2">
            {gardu.terukur} gardu · rata-rata {pct1(gardu.avgBeban)}
          </p>
          <div className="h-64">
            <DistribusiBebanDonut beban={gardu.bebanValues} />
          </div>
        </div>

        <div className={`${CARD} p-4 flex flex-col`}>
          <div className="flex items-center gap-1.5">
            <AlertTriangle size={13} className="text-red-600 shrink-0" />
            <p className={EYEBROW}>Gardu Overload</p>
          </div>
          {/* Tanggal ukur ikut ditampilkan karena inilah yang membedakan
              mendesak dari basi: 108% yang diukur kemarin dan 84% dari dua
              bulan lalu tidak menuntut perlakuan yang sama. */}
          <p className="text-[11px] text-ink-muted mt-0.5 mb-2">
            Beban ≥80% pada pengukuran/pemeliharaan terakhir
          </p>
          {gardu.overloadTeratas.length === 0 ? (
            <p className="text-xs text-ink-soft">Tidak ada gardu overload.</p>
          ) : (
            <ul className="space-y-1 flex-1">
              {gardu.overloadTeratas.map((g) => (
                <li key={`${g.kode}|${g.ulp}`} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-ink w-16 shrink-0 truncate">{g.kode}</span>
                  <span className="font-bold text-red-600 w-12 shrink-0 tabular-nums">
                    {Math.round(g.persen)}%
                  </span>
                  <span className="text-ink-soft tabular-nums">{fmtTgl(g.tanggal)}</span>
                  {g.dariPemeliharaan && (
                    <span
                      title="Kondisi ini berasal dari pemeliharaan, bukan pengukuran rutin"
                      className="ml-auto inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 shrink-0"
                    >
                      <Wrench size={9} /> Seimbang
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${CARD} p-4 flex flex-col`}>
          <div className="flex items-center gap-1.5">
            <Scale size={13} className="text-ink-muted shrink-0" />
            <p className={EYEBROW}>Aktivitas Periode Ini</p>
          </div>
          <p className="text-[11px] text-ink-muted mt-0.5 mb-3">Mengikuti periode terpilih</p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-[11px] text-ink-soft">Gardu diukur</p>
              <p className="text-xl font-bold text-ink leading-none mt-1">{gardu.diukur}</p>
              {gardu.barisPengukuran > gardu.diukur && (
                <p className="text-[10px] text-ink-muted mt-0.5">
                  {gardu.barisPengukuran} kali pengukuran
                </p>
              )}
            </div>
            <div>
              <p className="text-[11px] text-ink-soft">Pemerataan selesai</p>
              <p className="text-xl font-bold text-ink leading-none mt-1">{pemerataan.selesai}</p>
              {pemerataan.selesai > 0 && (
                <p className="text-[10px] text-ink-muted mt-0.5">
                  turun {pct1(pemerataan.perbaikanRataRata)} rata-rata
                </p>
              )}
            </div>
          </div>

          {pemerataan.terbaik ? (
            <>
              <p className="text-[11px] text-ink-soft mb-1.5">
                Perbaikan terbaik — {pemerataan.terbaik.no_gardu}
              </p>
              <BarList
                rows={[
                  { label: "Sebelum", value: pemerataan.terbaik.before, color: STATUS_COLOR.waspada },
                  { label: "Sesudah", value: pemerataan.terbaik.after, color: STATUS_COLOR.aman },
                ]}
                suffix="%"
              />
            </>
          ) : (
            <p className="text-xs text-ink-soft">Belum ada pemerataan beban pada periode ini.</p>
          )}
        </div>
      </div>
    </section>
  );
}
