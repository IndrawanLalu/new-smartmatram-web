"use client";

import { useEffect, useState } from "react";
import { HelpCircle, Loader2 } from "lucide-react";
import { BTN_GHOST, EYEBROW } from "@/app/admin/_ui";
import { useToast } from "@/app/admin/_components/Toast";
import { aturJurusanKabel, muatKabelBelumPasti, type KabelBelumPasti } from "@/lib/jtrJurusanKabel";

/**
 * Kabel ke-2 dst. yang jurusannya belum pernah dicatat (rencana JTR bagian 8,
 * 8 Okt 2026). Dianggap jurusan tiangnya — panjangnya sudah terhitung di sana
 * — tapi bisa juga jurusan lain yang lewat tiang itu. Satu klik memastikan.
 *
 * Jurusan yang tidak tercatat lewat tiang itu tidak bisa dipilih di sini:
 * regu yang mencatatnya dari HP ("Dilewati jurusan … juga"), karena butuh
 * tiang sebelumnya di deret jurusan itu.
 */

interface Props {
  /** Satu gardu (modal persetujuan); kosong = semua gardu ULP itu. */
  gardu?: string;
  ulp?: string | null;
  oleh: string;
  /** Berubah = muat ulang. */
  kunci?: string;
  onBerubah?: () => void;
  /** Boleh memastikan (UP3 / admin ULP) — selain itu daftar hanya dibaca. */
  boleh?: boolean;
}

const TAMPIL_AWAL = 15;

export default function JurusanKabelBelumPasti({ gardu, ulp, oleh, kunci, onBerubah, boleh = true }: Props) {
  const toast = useToast();
  const [daftar, setDaftar] = useState<KabelBelumPasti[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [semua, setSemua] = useState(false);
  const [muatLagi, setMuatLagi] = useState(0);

  useEffect(() => {
    let hidup = true;
    muatKabelBelumPasti({ gardu, ulp }).then(
      (d) => hidup && (setDaftar(d), setGalat(null)),
      (e: Error) => hidup && setGalat(e.message),
    );
    return () => { hidup = false; };
  }, [gardu, ulp, kunci, muatLagi]);

  if (galat) {
    return <p className="text-xs text-red-600">Daftar jurusan kabel belum dipastikan gagal dimuat: {galat}</p>;
  }
  if (!daftar || daftar.length === 0) return null;

  const pastikan = async (k: KabelBelumPasti, jurusan: string) => {
    setSibuk(`${k.tiangId}-${k.nomor}`);
    const g = await aturJurusanKabel({ tiangId: k.tiangId, gardu: k.gardu, nomor: k.nomor, jurusan, oleh });
    setSibuk(null);
    if (g) return toast.error(g);
    toast.success(`${k.tiangKode} kabel ke-${k.nomor}: jurusan ${jurusan}.`);
    setMuatLagi((n) => n + 1);
    onBerubah?.();
  };

  const tampil = semua ? daftar : daftar.slice(0, TAMPIL_AWAL);

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <HelpCircle size={15} className="text-violet-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className={EYEBROW}>Jurusan kabel belum dipastikan ({daftar.length})</p>
          <p className="text-xs text-violet-900 mt-0.5 leading-relaxed">
            Kabel kedua di tiang ini belum pernah dicatat jurusannya. Sementara dihitung ikut jurusan tiangnya. Pastikan:
            jalur kedua jurusan yang sama, atau jurusan lain yang lewat tiang ini. Jurusan lain yang belum tercatat lewat
            ditandai regu dari HP (&ldquo;Dilewati jurusan … juga&rdquo;).
          </p>
        </div>
      </div>
      <ul className="divide-y divide-violet-200 text-sm">
        {tampil.map((k) => {
          const kunciBaris = `${k.tiangId}-${k.nomor}`;
          return (
            <li key={kunciBaris} className="flex flex-wrap items-center gap-2 py-1.5">
              {!gardu && <span className="text-ink-muted text-xs w-14">{k.gardu}</span>}
              <span className="font-semibold text-ink">{k.tiangKode}</span>
              <span className="text-ink-soft flex-1 min-w-0">
                kabel ke-{k.nomor} · dianggap jurusan {k.jurusanDianggap ?? "—"}
              </span>
              {sibuk === kunciBaris && <Loader2 size={13} className="animate-spin text-ink-muted" />}
              {boleh && k.pilihan.map((j, i) => (
                <button key={j} onClick={() => void pastikan(k, j)} disabled={!!sibuk} className={BTN_GHOST}>
                  Jurusan {j}{i === 0 ? " (jurusan tiang)" : ""}
                </button>
              ))}
            </li>
          );
        })}
      </ul>
      {daftar.length > TAMPIL_AWAL && (
        <button onClick={() => setSemua((v) => !v)} className="text-xs text-violet-700 underline">
          {semua ? "Ringkas" : `Tampilkan semua ${daftar.length}`}
        </button>
      )}
    </div>
  );
}
