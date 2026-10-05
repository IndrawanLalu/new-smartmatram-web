"use client";

import { Download, X } from "lucide-react";
import { BTN_GHOST, EYEBROW } from "@/app/admin/_ui";
import { hitungBeban, type GarduInfo, type HasilLepas, type Simpul } from "@/lib/sld";
import { angka } from "./DaftarPenyulang";

/** Hasil simulasi lepas pangkal/keypoint: angka padam + gardu + keypoint hilir. */

interface Props {
  penyulang: string;
  simpul: Simpul;
  labelPenanda: string;
  hasil: HasilLepas;
  gardu: Map<string, GarduInfo>;
  onPilihKeypoint: (id: string) => void;
  onUnduh: () => void;
  onTutup: () => void;
}

function Angka({ label, nilai, sub }: { label: string; nilai: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line p-2.5">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="text-lg font-semibold text-ink tabular-nums leading-tight">{nilai}</p>
      {sub && <p className="text-[10px] text-ink-muted">{sub}</p>}
    </div>
  );
}

export default function HasilLepasPanel({ penyulang, simpul, labelPenanda, hasil, gardu, onPilihKeypoint, onUnduh, onTutup }: Props) {
  const b = hitungBeban(hasil.gardu, gardu);
  const pangkal = simpul.jenis === "pangkal";
  const daftar = hasil.gardu
    .map((k) => gardu.get(k) ?? { kode: k, nama: null, daya: null, bebanKva: null, persen: null, tglUkur: null })
    .sort((x, y) => (y.persen ?? -1) - (x.persen ?? -1));

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className={EYEBROW}>Simulasi lepas {pangkal ? "pangkal" : labelPenanda}</p>
          <p className="text-base font-semibold text-ink truncate">{pangkal ? `Penyulang ${penyulang}` : simpul.kode}</p>
          <p className="text-[11px] text-ink-muted">{pangkal ? "seluruh penyulang padam" : `${penyulang} · semua di hilirnya padam`}</p>
        </div>
        <button onClick={onTutup} className="p-1.5 rounded-lg text-ink-muted hover:bg-surface" aria-label="Tutup simulasi"><X size={16} /></button>
      </div>

      {hasil.km === 0 && hasil.gardu.length === 0 ? (
        <p className="text-sm text-ink-soft rounded-xl bg-surface p-3">
          Tidak ada jaringan di hilir {simpul.kode}. Kemungkinan ujung jalur atau titik pertemuan dengan penyulang lain.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Angka label="KMS padam" nilai={`${angka(hasil.km, 2)} kms`} />
            <Angka label="Gardu padam" nilai={angka(hasil.gardu.length + hasil.garduTanpaKode)}
              sub={hasil.garduTanpaKode ? `${hasil.garduTanpaKode} tanpa kode gardu` : undefined} />
            <Angka label="kVA terpasang" nilai={`${angka(b.kva)} kVA`} />
            <Angka label="Beban terukur" nilai={`${angka(b.beban)} kVA`}
              sub={`${b.diukur}/${hasil.gardu.length} gardu diukur${b.kva ? ` · ${angka((b.beban / b.kva) * 100)}% kVA` : ""}`} />
          </div>
          {!pangkal && (
            <p className="text-xs text-ink-soft">
              <b>Zona langsung</b> {simpul.kode} (sampai keypoint berikutnya): {angka(hasil.zona.km, 2)} kms ·{" "}
              {hasil.zona.gardu} gardu
            </p>
          )}
          {b.overload > 0 && <p className="text-xs text-red-600">{b.overload} gardu padam bebannya ≥80%.</p>}
        </>
      )}

      {hasil.keypoint.length > 0 && (
        <div>
          <p className={EYEBROW}>Keypoint di hilir ({hasil.keypoint.length})</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {hasil.keypoint.map((k) => (
              <button key={k.id} onClick={() => onPilihKeypoint(k.id)}
                className="text-[11px] px-2 py-1 rounded-lg border border-line hover:border-navy-300 text-ink-soft">
                {k.kode} <span className="text-ink-muted">· {k.penanda}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {daftar.length > 0 && (
        <div>
          <div className="flex items-center">
            <p className={`${EYEBROW} flex-1`}>Gardu padam ({daftar.length})</p>
            <button onClick={onUnduh} className={`${BTN_GHOST} h-7 px-2 text-xs`}><Download size={13} /> Excel</button>
          </div>
          <table className="w-full text-xs mt-1.5">
            <thead>
              <tr className="text-ink-muted text-left">
                <th className="py-1 font-medium">Gardu</th>
                <th className="py-1 font-medium text-right">kVA</th>
                <th className="py-1 font-medium text-right">Beban</th>
              </tr>
            </thead>
            <tbody>
              {daftar.map((g) => (
                <tr key={g.kode} className="border-t border-line">
                  <td className="py-1">
                    <span className="font-medium text-ink">{g.kode}</span>
                    {g.nama && <span className="block text-[10px] text-ink-muted truncate max-w-[150px]">{g.nama}</span>}
                  </td>
                  <td className="py-1 text-right tabular-nums">{g.daya ?? "—"}</td>
                  <td className={`py-1 text-right tabular-nums ${(g.persen ?? 0) >= 80 ? "text-red-600 font-semibold" : ""}`}>
                    {g.persen !== null ? `${angka(g.persen)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
