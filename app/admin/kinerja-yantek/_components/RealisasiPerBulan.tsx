"use client";

import { useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Star, TriangleAlert } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { BULAN, META } from "../_hooks/useKinerjaYantek";
import { useRealisasiBulanan } from "../_hooks/useRealisasiBulanan";
import { angkaId, hariIniWita, tanggalPanjang } from "../_lib/realisasiHarian";
import { bulanIniWita, rataId, teksWaBulanan, terbaik } from "../_lib/realisasiBulanan";
import MatriksUlp from "./MatriksUlp";
import RincianBulananModal from "./RincianBulananModal";
import KirimWaShell from "./KirimWaShell";

/**
 * Realisasi Per bulan: tiap jenis pekerjaan dibandingkan antar-ULP — total
 * sebulan, hari yang ada realisasinya, dan rata-rata per hari. UP3 melihat
 * keempat ULP; admin ULP hanya ULP-nya.
 */

interface Props {
  /** "SEMUA" untuk UP3, atau ULP admin. */
  ulp: string;
  ulps: string[];
  daftarTahun: number[];
}

export default function RealisasiPerBulan({ ulp, ulps, daftarTahun }: Props) {
  const o = useRealisasiBulanan(ulp);
  const [buka, setBuka] = useState<{ kunci: string; ulp: string } | null>(null);
  const meta = (k: string) => META.find((m) => m.kunci === k) ?? META[0];
  const juara = Object.fromEntries(META.map((m) => [m.kunci, terbaik(o.rekap[m.kunci], ulps)]));
  const selBuka = buka ? o.rekap[buka.kunci]?.[buka.ulp] : undefined;
  const [kirim, setKirim] = useState(false);
  const periode = `${BULAN[o.bulan - 1]} ${o.tahun}`;
  // Bulan berjalan: sebut batas datanya, sama dengan kiriman otomatis 18.00.
  const kini = bulanIniWita();
  const berjalan = kini.tahun === o.tahun && kini.bulan === o.bulan;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <select value={o.bulan} onChange={(e) => o.setBulan(Number(e.target.value))} className={`${FIELD} w-[150px]`} aria-label="Bulan">
          {BULAN.map((b, i) => <option key={b} value={i + 1}>{b}</option>)}
        </select>
        <select value={o.tahun} onChange={(e) => o.setTahun(Number(e.target.value))} className={`${FIELD} w-[110px]`} aria-label="Tahun">
          {daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button onClick={o.muat} className={BTN_GHOST} disabled={o.loading}>
          <RefreshCw size={14} className={o.loading ? "animate-spin" : ""} /> Muat ulang
        </button>
        <button onClick={() => setKirim(true)} className={`${BTN_PRIMARY} ml-auto`} disabled={o.loading || !!o.galat}>
          <MessageCircle size={15} /> Kirim ke WA
        </button>
      </div>

      <p className="text-xs text-ink-soft -mt-1">
        {BULAN[o.bulan - 1]} {o.tahun} · semua pekerjaan yang dikirim regu, <b>termasuk yang belum disetujui</b> —
        bisa berbeda dengan Rekap Bulanan. <b>Ø</b> = total ÷ jumlah hari yang ada realisasi jenis itu di ULP tersebut.
        {ulps.length > 1 && <> <Star size={11} className="inline -mt-0.5 text-emerald-600 fill-emerald-600" /> = rata-rata harian tertinggi.</>}
      </p>

      {o.galat && !o.loading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Realisasi bulanan gagal dibaca</p>
            <p className="mt-0.5 text-amber-700">{o.galat} — coba Muat ulang.</p>
          </div>
        </div>
      )}

      {o.loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 size={16} className="animate-spin" /> Memuat realisasi bulanan…
        </div>
      ) : !o.galat && (
        <MatriksUlp
          meta={META}
          ulps={ulps}
          berisi={(k, u) => !!u && (o.rekap[k]?.[u]?.hari ?? 0) > 0}
          sorot={(k, u) => juara[k] === u}
          onKlik={(k, u) => u && setBuka({ kunci: k, ulp: u })}
          sel={(k, u) => {
            const s = o.rekap[k][u ?? ""];
            const d = meta(k).desimal;
            return (
              <>
                <b className="text-base text-ink">{angkaId(s.total, d)}</b>
                {juara[k] === u && <Star size={14} className="inline ml-1 -mt-0.5 text-emerald-600 fill-emerald-600" />}
                <span className="block text-[13px] text-ink-soft whitespace-nowrap">
                  <b className="text-ink">Ø {rataId(s.rata, d)}/hari</b> · {s.hari} hari
                </span>
              </>
            );
          }}
        />
      )}

      {buka && selBuka && (
        <RincianBulananModal
          meta={meta(buka.kunci)}
          ulp={buka.ulp}
          periode={periode}
          sel={selBuka}
          onTutup={() => setBuka(null)}
        />
      )}
      {kirim && (
        <KirimWaShell
          title="Kirim rekap bulanan ke WA"
          subtitle={`${periode} · semua ULP dalam satu pesan · penerima dipilih di WhatsApp`}
          teks={teksWaBulanan(periode, o.rekap, META, ulps, berjalan ? `Data s.d. ${tanggalPanjang(hariIniWita())}` : undefined)}
          pesanSalin={`Rekap ${periode} tersalin — tempel di grup WA.`}
          onTutup={() => setKirim(false)}
        />
      )}
    </>
  );
}
