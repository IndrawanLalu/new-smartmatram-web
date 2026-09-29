"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { bacaTempelan, tierDari, type BarisTempel } from "../_lib/tempelWo";
import { fmtAngka, JENIS_SURAT, labelBulan } from "../_lib/woSurat";

/**
 * Tempel WO manual dari Excel rencana kerja. Tempelan MENGGANTI daftar jenis
 * itu seluruhnya (centang realisasi objek yang sama dibawa oleh server).
 *
 * Inspeksi JTM: satu tempelan boleh berisi Tier 1 dan Tier 2 sekaligus —
 * dipisah dari kolom keterangan. Tanpa keterangan, ikut tier baris yang
 * tombolnya ditekan.
 */

interface Props {
  ulp: string;
  tahun: number;
  bulan: number;
  kunci: string;
  oleh: string;
  onTutup: () => void;
  onTersimpan: () => void;
}

const PRATINJAU = 30;

export default function TempelWoModal({ ulp, tahun, bulan, kunci, oleh, onTutup, onTersimpan }: Props) {
  const toast = useToast();
  const [teks, setTeks] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const jenis = JENIS_SURAT.find((j) => j.kunci === kunci)!;
  const jtm = kunci === "jtm" || kunci === "jtm2";
  const hasil = useMemo(() => (teks.trim() ? bacaTempelan(teks, tahun, bulan) : null), [teks, tahun, bulan]);

  /** Kelompok yang akan disimpan: kunci → baris. */
  const kelompok = useMemo(() => {
    const g = new Map<string, BarisTempel[]>();
    for (const b of hasil?.baris ?? []) {
      const k = jtm ? (tierDari(b.keterangan, kunci === "jtm2" ? 2 : 1) === 2 ? "jtm2" : "jtm") : kunci;
      g.set(k, [...(g.get(k) ?? []), b]);
    }
    return g;
  }, [hasil, jtm, kunci]);

  const simpan = async () => {
    setSibuk(true);
    for (const [k, baris] of kelompok) {
      const { error } = await supabaseBrowser.rpc("simpan_wo_manual", {
        p_ulp: ulp, p_tahun: tahun, p_bulan: bulan, p_jenis: k, p_item: baris, p_oleh: oleh,
      });
      if (error) {
        setSibuk(false);
        toast.error(`${JENIS_SURAT.find((j) => j.kunci === k)?.nama}: ${error.message}`);
        return;
      }
    }
    setSibuk(false);
    toast.success(`${hasil?.baris.length ?? 0} baris WO tersimpan untuk ${labelBulan(tahun, bulan)}.`);
    onTersimpan();
    onTutup();
  };

  const footer = (
    <>
      <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
      <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk || !hasil || !!hasil.galat}>
        {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
        Simpan {hasil && !hasil.galat ? `(${hasil.baris.length} baris)` : ""}
      </button>
    </>
  );

  return (
    <ModalShell
      title={`Tempel ${jtm ? "WO Inspeksi JTM (Tier 1 & 2)" : jenis.nama}`}
      subtitle={`ULP ${ulp} · ${labelBulan(tahun, bulan)} — menggantikan tempelan sebelumnya`}
      maxWidth="max-w-4xl"
      onClose={onTutup}
      footer={footer}
    >
      <p className="text-xs text-ink-soft leading-relaxed">
        Blok tabel di Excel <b>termasuk baris judul kolomnya</b>, salin (Ctrl+C), lalu tempel di bawah.
        Kolom dikenali dari judulnya: {jtm ? "Segment/Section, Kms, Keterangan (Tier 1/2), Pelaksana, Rencana Tanggal" : `${jenis.kolomObjek}, Alamat, ${jenis.km ? "Kms, " : ""}Pelaksana`}.
      </p>
      <textarea
        value={teks}
        onChange={(e) => setTeks(e.target.value)}
        rows={6}
        placeholder="Tempel di sini…"
        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-xs font-mono focus:outline-none focus:border-navy-500"
      />

      {hasil?.galat && <p className="text-xs text-red-600">{hasil.galat}</p>}

      {hasil && !hasil.galat && (
        <>
          <div className="flex flex-wrap gap-2 text-[11px] text-ink-soft">
            {Object.entries(hasil.dikenali).map(([k, h]) => (
              <span key={k} className="px-2 py-0.5 rounded-full bg-surface border border-line">{h} → {k}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 text-xs">
            {[...kelompok].map(([k, b]) => {
              const j = JENIS_SURAT.find((x) => x.kunci === k)!;
              const jumlah = j.km ? b.reduce((a, x) => a + (x.km ?? 0), 0) : b.length;
              return (
                <span key={k} className="font-semibold text-ink">
                  {j.nama}: {fmtAngka(jumlah, j.km)} {j.satuan} ({b.length} baris)
                </span>
              );
            })}
          </div>
          <div className="rounded-xl border border-line overflow-auto max-h-[40vh]">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 sticky top-0">
                <tr className="text-left">
                  {["Objek", "Alamat", "Kms", "Keterangan", "Pelaksana", "Rencana"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hasil.baris.slice(0, PRATINJAU).map((b, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="px-2 py-1">{b.objek}</td>
                    <td className="px-2 py-1">{b.alamat ?? ""}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{b.km === null ? "" : fmtAngka(b.km, true)}</td>
                    <td className="px-2 py-1">{b.keterangan ?? ""}</td>
                    <td className="px-2 py-1">{b.pelaksana ?? ""}</td>
                    <td className="px-2 py-1">{b.tgl_rencana ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasil.baris.length > PRATINJAU && (
            <p className="text-[11px] text-ink-muted">
              Menampilkan {PRATINJAU} dari {hasil.baris.length} baris — semuanya ikut tersimpan.
            </p>
          )}
        </>
      )}
    </ModalShell>
  );
}
