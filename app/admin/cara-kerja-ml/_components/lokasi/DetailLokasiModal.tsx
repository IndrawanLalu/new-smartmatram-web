"use client";

import { useCallback, useEffect, useState } from "react";
import ModalShell from "@/app/admin/_components/ModalShell";
import Tombol from "@/app/admin/_kit/Tombol";
import type { HasilPrediksi } from "@/lib/prediksiGangguan/hitung";
import type { BarisTemuan } from "@/lib/prediksiGangguan/temuan";
import type { BarisGangguan } from "../../_hooks/usePrediksiLokasi";
import IsiPrediksi from "./IsiPrediksi";
import FormTemuan from "./FormTemuan";

interface Props {
  baris: BarisGangguan;
  bolehIsi: boolean;
  onTemuan: (kunci: string, t: BarisTemuan | null) => void;
  onClose: () => void;
}

const SUMBER: Record<BarisGangguan["sumber"], string> = {
  sheet: "Sheet gangguan penyulang",
  wa: "Laporan dispatcher via WA (belum ada di sheet)",
  "sheet+wa": "Sheet gangguan penyulang + laporan WA",
};
const a = (v: number | null) => (v == null ? "–" : `${Math.round(v).toLocaleString("id-ID")} A`);

/** Detail satu gangguan: prediksi dihitung saat dibuka (data jaringan terkini) + isian lokasi temuan. */
export default function DetailLokasiModal({ baris, bolehIsi, onTemuan, onClose }: Props) {
  const [hasil, setHasil] = useState<HasilPrediksi | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ctl = new AbortController();
    fetch(`/api/prediksi-lokasi/hitung?kunci=${encodeURIComponent(baris.kunci)}`, { signal: ctl.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
        setHasil(j.hasil);
      })
      .catch((e: Error) => { if (e.name !== "AbortError") setGalat(e.message); });
    return () => ctl.abort();
  }, [baris.kunci, nonce]);

  const hitungUlang = useCallback(() => { setHasil(null); setGalat(null); setNonce((n) => n + 1); }, []);

  return (
    <ModalShell
      title={`${baris.penyulang} · ${baris.keypoint ?? "PMT di GI"}`}
      subtitle={`${baris.tanggal.split("-").reverse().join("-")} ${baris.jam?.slice(0, 5) ?? ""} · ${SUMBER[baris.sumber]}`}
      maxWidth="max-w-4xl"
      onClose={onClose}
      footer={<><span className="text-[11px] text-ink-muted">Perkiraan dari arus gangguan — tetap pastikan dengan penyisiran.</span><Tombol onClick={onClose}>Tutup</Tombol></>}
    >
      <div className="grid sm:grid-cols-4 gap-2 text-xs">
        {(["r", "s", "t", "n"] as const).map((f) => (
          <div key={f} className="rounded-xl border border-line px-3 py-2">
            <p className="text-ink-muted">Arus {f.toUpperCase()}</p>
            <p className="font-semibold text-ink tabular-nums">{a(baris.arus[f])}</p>
          </div>
        ))}
      </div>
      {(baris.relay || baris.trafoGi || baris.penyebab) && (
        <p className="text-xs text-ink-soft">
          {[baris.relay && `Relay ${baris.relay}`, baris.trafoGi, baris.kode && `Kode ${baris.kode}`, baris.penyebab && `Penyebab: ${baris.penyebab}`].filter(Boolean).join(" · ")}
        </p>
      )}

      {galat ? (
        <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>Prediksi gagal dihitung: {galat}</span>
          <Tombol ukuran="sm" onClick={hitungUlang}>Coba lagi</Tombol>
        </div>
      ) : !hasil ? (
        <div className="flex items-center gap-3 text-xs text-ink-soft py-6 justify-center">
          <span className="w-5 h-5 border-4 border-line border-t-brand-600 rounded-full animate-spin" /> Menghitung dari data jaringan JTM…
        </div>
      ) : (
        <IsiPrediksi h={hasil} />
      )}

      {bolehIsi && (
        <FormTemuan
          kunci={baris.kunci}
          penyulang={baris.penyulang}
          temuan={baris.temuan}
          onTersimpan={(t) => { onTemuan(baris.kunci, t); hitungUlang(); }}
        />
      )}
    </ModalShell>
  );
}
