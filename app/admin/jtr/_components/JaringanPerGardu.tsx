"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, TriangleAlert } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { CARD } from "@/app/admin/_ui";
import type { RekapGardu } from "../_hooks/useJtrRekap";
import { km } from "../_lib/tampilan";

/**
 * Jaringan JTR per gardu — panjang rute & penghantar, TURUNAN dari rangkaian
 * tiang (tidak ada angka yang diketik). Dipindah dari tab "Jaringan JTR" lama.
 *
 * Menarik `gardu_jtr_panjang` saja, dipaginasi — bukan seluruh tiang seperti
 * dashboard, karena tab ini cuma butuh angka per gardu.
 */

const PAGE_SIZE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line";

/**
 * Dua sebab panjang penghantar kurang: tiang yang kabelnya belum dicatat, dan
 * kabel yang belum jelas datang dari tiang mana. Angka yang kurang tanpa tanda
 * jauh lebih berbahaya daripada angka yang jelas kosong.
 */
const alasanKurang = (g: Pick<RekapGardu, "tiang_tanpa_kabel" | "gawang_terputus">) =>
  [
    Number(g.tiang_tanpa_kabel ?? 0) > 0 ? `${g.tiang_tanpa_kabel} tiang belum dicatat kabelnya` : null,
    Number(g.gawang_terputus ?? 0) > 0 ? `${g.gawang_terputus} kabel belum jelas datang dari tiang mana` : null,
  ].filter(Boolean).join(" · ");

interface Gabung extends RekapGardu { jurusanList: string[] }

export default function JaringanPerGardu({ ulp, cari }: { ulp: string; cari: string }) {
  const [data, setData] = useState<RekapGardu[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [halaman, setHalaman] = useState(1);

  useEffect(() => {
    let hidup = true;
    fetchAllRows<RekapGardu>(() => {
      let b = supabaseBrowser.from("gardu_jtr_panjang").select("*");
      if (ulp !== "SEMUA") b = b.eq("ulp", ulp);
      return b.order("gardu_kode").order("ulp").order("jurusan");
    }).then(
      (rows) => { if (hidup) setData(rows); },
      (e: Error) => { if (hidup) setGalat(e.message); },
    );
    return () => { hidup = false; };
  }, [ulp]);

  // Satu gardu bisa punya beberapa jurusan; yang dilihat orang adalah gardunya.
  const perGardu = useMemo(() => {
    const m = new Map<string, Gabung>();
    for (const g of data ?? []) {
      const k = `${g.gardu_kode}|${g.ulp}`;
      const ada = m.get(k);
      if (!ada) {
        m.set(k, { ...g, jurusanList: [g.jurusan] });
      } else {
        ada.jumlah_tiang += Number(g.jumlah_tiang ?? 0);
        ada.panjang_rute_km = Number(ada.panjang_rute_km) + Number(g.panjang_rute_km ?? 0);
        ada.panjang_penghantar_km = Number(ada.panjang_penghantar_km) + Number(g.panjang_penghantar_km ?? 0);
        ada.tiang_tanpa_kabel = Number(ada.tiang_tanpa_kabel ?? 0) + Number(g.tiang_tanpa_kabel ?? 0);
        ada.gawang_terputus = Number(ada.gawang_terputus ?? 0) + Number(g.gawang_terputus ?? 0);
        ada.jurusanList.push(g.jurusan);
      }
    }
    const q = cari.trim().toUpperCase();
    return [...m.values()]
      .filter((g) => !q || g.gardu_kode.toUpperCase().includes(q))
      .sort((a, b) => Number(b.panjang_rute_km) - Number(a.panjang_rute_km));
  }, [data, cari]);

  if (galat) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
        <p className="text-amber-800">Jaringan per gardu gagal dimuat: {galat}</p>
      </div>
    );
  }
  if (data === null) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat jaringan per gardu…
      </div>
    );
  }
  if (perGardu.length === 0) {
    return <div className={`${CARD} p-10 text-center text-sm text-ink-soft`}>Belum ada jaringan JTR yang tercatat.</div>;
  }

  const total = Math.max(1, Math.ceil(perGardu.length / PAGE_SIZE));
  const hal = Math.min(halaman, total);
  const tampil = perGardu.slice((hal - 1) * PAGE_SIZE, hal * PAGE_SIZE);
  const adaKurang = perGardu.some((g) => alasanKurang(g));

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-surface">
            <tr>
              <th className={TH}>Gardu</th>
              <th className={TH}>ULP</th>
              <th className={TH}>Jurusan</th>
              <th className={`${TH} text-right`}>Tiang</th>
              <th className={`${TH} text-right`}>Rute</th>
              <th className={`${TH} text-right`}>Penghantar</th>
            </tr>
          </thead>
          <tbody>
            {tampil.map((g) => {
              const kurang = alasanKurang(g);
              return (
                <tr key={`${g.gardu_kode}|${g.ulp}`}>
                  <td className={`${TD} font-semibold text-ink`}>{g.gardu_kode}</td>
                  <td className={`${TD} text-xs text-ink-soft`}>{g.ulp}</td>
                  <td className={`${TD} text-xs text-ink-soft`}>{[...new Set(g.jurusanList)].sort().join(", ")}</td>
                  <td className={`${TD} text-right tabular-nums text-xs`}>{g.jumlah_tiang}</td>
                  <td className={`${TD} text-right tabular-nums text-xs`}>{km(g.panjang_rute_km)}</td>
                  <td className={`${TD} text-right tabular-nums text-xs`}>
                    {kurang ? (
                      <span className="text-attention font-semibold" title={kurang}>{km(g.panjang_penghantar_km)} *</span>
                    ) : (
                      <span className="text-ink-soft">{km(g.panjang_penghantar_km)}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {adaKurang && (
        <p className="px-4 py-2.5 text-xs text-attention border-t border-line">
          * Panjang penghantar belum lengkap — ada tiang yang kabelnya belum dicatat, atau kabel yang belum
          ketahuan datang dari tiang mana, sehingga bentangnya belum bisa dijumlah.
        </p>
      )}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft border-t border-line">
        <span>{(hal - 1) * PAGE_SIZE + 1}–{Math.min(hal * PAGE_SIZE, perGardu.length)} dari {perGardu.length} gardu</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setHalaman(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <span>{hal} / {total}</span>
          <button onClick={() => setHalaman(hal + 1)} disabled={hal >= total} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
