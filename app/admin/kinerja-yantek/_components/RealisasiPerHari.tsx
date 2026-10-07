"use client";

import { useState } from "react";
import { Loader2, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { META } from "../_hooks/useKinerjaYantek";
import { useRealisasiHarian } from "../_hooks/useRealisasiHarian";
import { angkaId, kelompokkan, tanggalPanjang, type KelompokHarian } from "../_lib/realisasiHarian";
import MatriksUlp from "./MatriksUlp";
import TabelHarian from "./TabelHarian";
import RincianHarianModal from "./RincianHarianModal";
import KirimWaHarianModal from "./KirimWaHarianModal";

/**
 * Realisasi Per hari: pekerjaan yang dikirim regu pada satu tanggal, per jenis
 * Rekap Kinerja, termasuk yang belum disetujui. "Semua ULP" tampil berkolom per
 * ULP supaya bisa dibandingkan. Klik → rincian; "Kirim ke WA" → teks per ULP.
 */

interface Props {
  ulpAwal: string;
  daftarUlp: string[];
}

export default function RealisasiPerHari({ ulpAwal, daftarUlp }: Props) {
  const o = useRealisasiHarian(ulpAwal);
  const [rinci, setRinci] = useState<{ k: KelompokHarian; ulp: string | null } | null>(null);
  const [kirim, setKirim] = useState(false);
  const ulps = daftarUlp.filter((u) => u !== "SEMUA");
  // Ratusan baris paling banyak — cukup dihitung tiap render.
  const perUlp = Object.fromEntries(ulps.map((u) => [u, kelompokkan(o.item.filter((x) => x.ulp === u), META)]));
  const cari = (kunci: string, ulp: string | null) =>
    (ulp === null ? o.kelompok : perUlp[ulp] ?? []).find((k) => k.meta.kunci === kunci);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={o.tgl} onChange={(e) => o.setTgl(e.target.value)} className={`${FIELD} w-[170px]`} aria-label="Tanggal" />
        <select
          value={o.ulp}
          onChange={(e) => o.setUlp(e.target.value)}
          className={`${FIELD} w-[170px]`}
          disabled={daftarUlp.length <= 1}
          aria-label="ULP"
        >
          {daftarUlp.map((u) => <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>)}
        </select>
        <button onClick={o.muat} className={BTN_GHOST} disabled={o.loading}>
          <RefreshCw size={14} className={o.loading ? "animate-spin" : ""} /> Muat ulang
        </button>
        <button onClick={() => setKirim(true)} className={`${BTN_PRIMARY} ml-auto`} disabled={o.loading || !!o.galat}>
          <MessageCircle size={15} /> Kirim ke WA
        </button>
      </div>

      <p className="text-xs text-ink-soft -mt-1">
        {tanggalPanjang(o.tgl)} · pekerjaan yang dikirim regu hari itu, <b>termasuk yang belum disetujui</b>.
        Yang dibatalkan, dikembalikan, atau belum dikirim tidak dihitung.
      </p>

      {o.galat && !o.loading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Realisasi harian gagal dibaca lengkap</p>
            <p className="mt-0.5 text-amber-700">{o.galat} — angka di bawah belum bisa dipakai.</p>
          </div>
        </div>
      )}

      {o.loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 size={16} className="animate-spin" /> Memuat realisasi…
        </div>
      ) : o.ulp === "SEMUA" ? (
        <MatriksUlp
          meta={META}
          ulps={ulps}
          kolomTotal
          berisi={(kunci, u) => (cari(kunci, u)?.item.length ?? 0) > 0}
          onKlik={(kunci, u) => { const k = cari(kunci, u); if (k) setRinci({ k, ulp: u }); }}
          sel={(kunci, u) => {
            const k = cari(kunci, u);
            if (!k) return null;
            const tambahan = [k.luar ? `+${k.luar} luar WO` : null, k.ujung ? `+${k.ujung} ujung` : null].filter(Boolean);
            return (
              <>
                <b className="text-base text-ink">{angkaId(k.total, k.meta.desimal)}</b>
                {k.belum > 0 && (
                  <span className="block text-[13px] text-amber-700 whitespace-nowrap">⏳ {angkaId(k.belum, k.meta.desimal)} belum</span>
                )}
                {tambahan.length > 0 && <span className="block text-xs text-ink-muted whitespace-nowrap">{tambahan.join(" · ")}</span>}
              </>
            );
          }}
        />
      ) : (
        <TabelHarian kelompok={o.kelompok} onKlik={(k) => setRinci({ k, ulp: null })} />
      )}

      {!o.loading && !o.galat && o.item.length === 0 && (
        <p className="text-xs text-ink-muted -mt-2">Belum ada pekerjaan yang dikirim regu pada tanggal ini.</p>
      )}

      {rinci && <RincianHarianModal k={rinci.k} ulp={rinci.ulp} tgl={o.tgl} onTutup={() => setRinci(null)} />}
      {kirim && (
        <KirimWaHarianModal tgl={o.tgl} ulp={o.ulp} item={o.item} daftarUlp={ulps} onTutup={() => setKirim(false)} />
      )}
    </>
  );
}
