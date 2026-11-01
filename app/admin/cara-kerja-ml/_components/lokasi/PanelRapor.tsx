"use client";

import { useState } from "react";
import { Gauge, RefreshCw, Target } from "lucide-react";
import Tombol from "@/app/admin/_kit/Tombol";
import { useToast } from "@/app/admin/_components/Toast";
import type { Kalibrasi, Rapor } from "@/app/api/prediksi-lokasi/route";

interface Props {
  kalibrasi: Kalibrasi[];
  rapor: Rapor | null;
  bolehIsi: boolean;
  onSelesai: () => void;
}

const ohm = (n: number) => n.toFixed(2).replace(".", ",");
const persen = (a: number, n: number) => (n ? `${Math.round((a / n) * 100)}%` : "–");

/** Kalibrasi sumber per trafo GI + rapor akurasi dari lokasi temuan yang sudah diisi. */
export default function PanelRapor({ kalibrasi, rapor, bolehIsi, onSelesai }: Props) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState(false);

  const nilaiUlang = async () => {
    setSibuk(true);
    try {
      const r = await fetch("/api/prediksi-lokasi/temuan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nilaiUlang: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
      toast.success(`${j.jumlah} lokasi temuan dinilai ulang — kalibrasi & rapor diperbarui.`);
      onSelesai();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-line shadow-card p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2"><Gauge size={16} className="text-brand-600" /> Kalibrasi sumber per trafo GI</h3>
          {bolehIsi && (
            <Tombol ukuran="sm" onClick={nilaiUlang} disabled={sibuk} ikon={<RefreshCw size={13} className={sibuk ? "animate-spin" : ""} />}>
              {sibuk ? "Menilai…" : "Nilai ulang semua"}
            </Tombol>
          )}
        </div>
        {kalibrasi.length ? (
          <table className="w-full text-xs">
            <thead><tr className="text-ink-muted text-left"><th className="py-1 font-semibold">Trafo</th><th className="font-semibold">Xs (Ω)</th><th className="font-semibold">Sebaran</th><th className="font-semibold text-right">Temuan OC</th></tr></thead>
            <tbody>
              {kalibrasi.map((k) => (
                <tr key={k.trafo} className="border-t border-line">
                  <td className="py-1.5 font-medium text-ink">{k.trafo}</td>
                  <td className="tabular-nums">{ohm(k.xs)}</td>
                  <td className="tabular-nums text-ink-soft">{ohm(k.min)}–{ohm(k.max)}</td>
                  <td className="tabular-nums text-right">{k.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-xs text-ink-soft">Belum ada trafo terkalibrasi. Isi lokasi temuan gangguan OC — trafo tanpa kalibrasi memakai perkiraan dari kapasitasnya (rentang lebih lebar).</p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-line shadow-card p-4">
        <h3 className="text-sm font-bold text-ink flex items-center gap-2 mb-2"><Target size={16} className="text-brand-600" /> Rapor akurasi</h3>
        {rapor && (rapor.oc.n || rapor.ef.n) ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-surface p-3">
              <p className="font-semibold text-ink">Gangguan OC · {rapor.oc.n} temuan</p>
              <p className="text-2xl font-bold text-ink mt-1 tabular-nums">{persen(rapor.oc.top3, rapor.oc.n)}</p>
              <p className="text-ink-soft">lokasi asli di 3 saran teratas ({rapor.oc.top3} dari {rapor.oc.n})</p>
              <p className="text-ink-soft mt-1">
                {persen(rapor.oc.saran1, rapor.oc.n)} tepat di saran pertama · {persen(rapor.oc.masuk, rapor.oc.n)} masuk daftar calon
              </p>
            </div>
            <div className="rounded-xl bg-surface p-3">
              <p className="font-semibold text-ink">Gangguan EF · {rapor.ef.n} temuan</p>
              <p className="text-2xl font-bold text-ink mt-1 tabular-nums">{persen(rapor.ef.top3, rapor.ef.n)}</p>
              <p className="text-ink-soft">lokasi asli di 3 saran teratas ({rapor.ef.top3} dari {rapor.ef.n})</p>
              <p className="text-ink-soft mt-1">
                {persen(rapor.ef.saran1, rapor.ef.n)} tepat di saran pertama · {persen(rapor.ef.masukZona, rapor.ef.n)} di zona peralatan yang trip
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-soft">Belum ada lokasi temuan yang dinilai. Buka satu gangguan, isi tiang tempat gangguan ditemukan — rapor dihitung dengan kalibrasi tanpa temuan itu sendiri.</p>
        )}
      </div>
    </div>
  );
}
