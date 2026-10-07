"use client";

import { useState } from "react";
import { Loader2, MessageCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, CARD, FIELD } from "@/app/admin/_ui";
import { useRealisasiHarian } from "../_hooks/useRealisasiHarian";
import { angkaId, ringkasan, tanggalPanjang, type KelompokHarian } from "../_lib/realisasiHarian";
import RincianHarianModal from "./RincianHarianModal";
import KirimWaHarianModal from "./KirimWaHarianModal";

/**
 * Tab "Realisasi Harian": pekerjaan yang dikirim regu pada satu tanggal,
 * per jenis Rekap Kinerja, termasuk yang belum disetujui. Klik baris →
 * rincian; "Kirim ke WA" → teks siap kirim per ULP.
 */

const TH = "px-4 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-4 py-2.5 border-b border-line align-top";

interface Props {
  ulpAwal: string;
  daftarUlp: string[];
}

export default function RealisasiHarian({ ulpAwal, daftarUlp }: Props) {
  const o = useRealisasiHarian(ulpAwal);
  const [rinci, setRinci] = useState<KelompokHarian | null>(null);
  const [kirim, setKirim] = useState(false);
  const adaIsi = o.item.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={o.tgl}
          onChange={(e) => o.setTgl(e.target.value)}
          className={`${FIELD} w-[170px]`}
          aria-label="Tanggal"
        />
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

      <div className={`${CARD} overflow-hidden`}>
        {o.loading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-sm text-ink-soft">
            <Loader2 size={16} className="animate-spin" /> Memuat realisasi…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-surface">
                <tr>
                  <th className={TH}>Jenis pekerjaan</th>
                  <th className={`${TH} text-right`}>Realisasi</th>
                  <th className={`${TH} text-right`}>Sudah disetujui</th>
                  <th className={`${TH} text-right`}>Belum disetujui</th>
                  <th className={TH}>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {o.kelompok.map((k) => {
                  const kosong = k.item.length === 0;
                  const d = k.meta.desimal;
                  return (
                    <tr
                      key={k.meta.kunci}
                      onClick={kosong ? undefined : () => setRinci(k)}
                      className={kosong ? "text-ink-muted" : "cursor-pointer hover:bg-navy-50/60 transition-colors"}
                    >
                      <td className={`${TD} font-medium ${kosong ? "" : "text-ink"}`}>{k.meta.jenis}</td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        {kosong ? "—" : <><b>{angkaId(k.total, d)}</b> <span className="text-xs text-ink-soft">{k.meta.satuan}</span></>}
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap ${k.setuju ? "text-emerald-700 font-semibold" : ""}`}>
                        {kosong ? "—" : angkaId(k.setuju, d)}
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap ${k.belum ? "text-amber-700 font-semibold" : ""}`}>
                        {kosong ? "—" : angkaId(k.belum, d)}
                      </td>
                      <td className={`${TD} text-xs text-ink-soft`}>
                        {kosong ? "Nihil" : [
                          d && k.cacah ? `${k.cacah} ${k.meta.kunci === "jtr" ? "gardu" : "segmen"}` : null,
                          ...ringkasan(k).tambahan,
                        ].filter(Boolean).join(" · ") || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!o.loading && !o.galat && !adaIsi && (
        <p className="text-xs text-ink-muted -mt-2">Belum ada pekerjaan yang dikirim regu pada tanggal ini.</p>
      )}

      {rinci && <RincianHarianModal k={rinci} tgl={o.tgl} onTutup={() => setRinci(null)} />}
      {kirim && (
        <KirimWaHarianModal
          tgl={o.tgl}
          ulp={o.ulp}
          item={o.item}
          daftarUlp={daftarUlp.filter((u) => u !== "SEMUA")}
          onTutup={() => setKirim(false)}
        />
      )}
    </>
  );
}
