"use client";

import { useEffect, useState } from "react";
import { Loader2, TriangleAlert } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import { useToast } from "@/app/admin/_components/Toast";
import {
  muatUsulanAsalKabel,
  sebutUsulan,
  terapkanAsalKabel,
  terapkanSemuaUsulan,
  type UsulanAsalKabel,
} from "@/lib/jtrAsalKabel";

/**
 * Kabel yang asalnya belum jelas + usulan sistem, di modal persetujuan JTR.
 * Biasanya dua jalur berdampingan yang berbagi tiang (AM136, 4 Okt 2026):
 * kabel di tiang itu datang dari tiang lain atau langsung dari gardu, bukan
 * dari induk tiangnya. Satu klik per kabel, atau semua sekaligus.
 */

interface Props {
  gardu: string;
  ulp: string;
  oleh: string;
  /** Berubah = muat ulang (mis. jumlah kabel terputus di perbandingan). */
  kunci: string;
  onBerubah: () => void;
}

export default function AsalKabelBelumJelas({ gardu, ulp, oleh, kunci, onBerubah }: Props) {
  const toast = useToast();
  const [daftar, setDaftar] = useState<UsulanAsalKabel[] | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    muatUsulanAsalKabel(gardu, ulp).then(
      (d) => hidup && setDaftar(d),
      (e: Error) => hidup && toast.error(e.message),
    );
    return () => { hidup = false; };
  }, [gardu, ulp, kunci, toast]);

  if (!daftar || daftar.length === 0) return null;

  const satu = async (u: UsulanAsalKabel, dariGardu: boolean) => {
    setSibuk(`${u.tiangId}-${u.nomor}`);
    const galat = await terapkanAsalKabel({
      tiangId: u.tiangId, gardu, nomor: u.nomor, huluId: u.usulTiangId, dariGardu, oleh,
    });
    setSibuk(null);
    if (galat) return toast.error(galat);
    toast.success(`${u.tiangKode} kabel ke-${u.nomor}: asal ${dariGardu ? "langsung dari gardu" : u.usulKode}.`);
    onBerubah();
  };

  const semua = async () => {
    setSibuk("semua");
    const h = await terapkanSemuaUsulan(gardu, daftar, oleh);
    setSibuk(null);
    if (h.galat) toast.error(`${h.berhasil} diterapkan, lalu berhenti — ${h.galat}`);
    else toast.success(`${h.berhasil} asal kabel diterapkan.`);
    onBerubah();
  };

  const adaUsulan = daftar.some((u) => u.usulDariGardu || u.usulTiangId);

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <TriangleAlert size={15} className="text-orange-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className={EYEBROW}>Asal kabel belum dipilih ({daftar.length})</p>
          <p className="text-xs text-orange-900 mt-0.5 leading-relaxed">
            Tiang induknya tidak membawa kabel bernomor sama — biasanya dua jalur berdampingan yang berbagi tiang,
            jadi kabelnya datang dari tiang lain atau langsung dari gardu. Panjangnya belum terhitung sampai asalnya dipilih.
          </p>
        </div>
        {adaUsulan && (
          <button onClick={() => void semua()} disabled={!!sibuk} className={`${BTN_PRIMARY} shrink-0`}>
            {sibuk === "semua" && <Loader2 size={13} className="animate-spin" />} Terapkan semua usulan
          </button>
        )}
      </div>
      <ul className="divide-y divide-orange-200 text-sm">
        {daftar.map((u) => {
          const k = `${u.tiangId}-${u.nomor}`;
          const usul = sebutUsulan(u);
          return (
            <li key={k} className="flex flex-wrap items-center gap-2 py-1.5">
              <span className="font-semibold text-ink">{u.tiangKode}</span>
              <span className="text-ink-soft">kabel ke-{u.nomor}</span>
              <span className="text-ink-soft flex-1 min-w-0">{usul ? <>usulan: <b className="text-ink">{usul}</b></> : "tidak ada usulan"}</span>
              {sibuk === k && <Loader2 size={13} className="animate-spin text-ink-muted" />}
              {u.usulTiangId && !u.usulDariGardu && (
                <button onClick={() => void satu(u, false)} disabled={!!sibuk} className={BTN_GHOST}>Dari {u.usulKode}</button>
              )}
              <button onClick={() => void satu(u, true)} disabled={!!sibuk} className={BTN_GHOST}>Dari gardu</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
