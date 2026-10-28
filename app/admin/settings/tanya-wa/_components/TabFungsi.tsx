"use client";

import { useState } from "react";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";
import type { NamaSaringan, TanyaWa } from "../_hooks/useTanyaWa";
import PanelKata from "./PanelKata";
import PanelContoh from "./PanelContoh";

/**
 * Daftar fungsi (kiri) + rincian fungsi terpilih (kanan): kata kunci, contoh
 * pertanyaan, dan saringan yang dibaca fungsi itu (dari kode, hanya baca).
 */

const LABEL_SARINGAN: Record<NamaSaringan, string> = { ulp: "ULP", periode: "Waktu", gardu: "Kode gardu", penyulang: "Penyulang" };

interface Props {
  data: TanyaWa;
  bisaUbah: boolean;
}

export default function TabFungsi({ data, bisaUbah }: Props) {
  const [pilih, setPilih] = useState(data.fungsi[0]?.kode ?? "");
  const [galat, setGalat] = useState<string | null>(null);
  const f = data.fungsi.find((x) => x.kode === pilih);

  async function ubahAktif(kode: string, aktif: boolean) {
    setGalat(await data.ubahAktif(kode, aktif));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr] items-start">
      <div className={`${CARD} p-2 flex flex-col gap-1`}>
        {data.fungsi.map((x) => {
          const jumlah = data.kata.filter((k) => k.fungsi_kode === x.kode).length;
          const on = x.kode === pilih;
          return (
            <div
              key={x.kode}
              role="button"
              tabIndex={0}
              onClick={() => setPilih(x.kode)}
              onKeyDown={(e) => e.key === "Enter" && setPilih(x.kode)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${on ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-surface"}`}
            >
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold truncate ${x.aktif ? "text-ink" : "text-ink-muted line-through"}`}>{x.nama}</div>
                <div className="text-[11px] text-ink-muted">
                  {jumlah} kata kunci{!x.kodeInfo && " · tidak ada di kode"}
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={x.aktif}
                aria-label={`${x.aktif ? "Matikan" : "Aktifkan"} ${x.nama}`}
                disabled={!bisaUbah}
                onClick={(e) => {
                  e.stopPropagation();
                  void ubahAktif(x.kode, !x.aktif);
                }}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-60 ${x.aktif ? "bg-emerald-500" : "bg-slate-300"}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${x.aktif ? "left-[18px]" : "left-0.5"}`} />
              </button>
            </div>
          );
        })}
        {galat && <p className="px-3 py-1 text-xs text-red-600">{galat}</p>}
      </div>

      {f && (
        <div className="flex flex-col gap-4">
          <div className={`${CARD} p-4 flex flex-wrap items-center gap-x-6 gap-y-2`}>
            <div>
              <div className={EYEBROW}>Fungsi</div>
              <div className="text-base font-semibold">{f.nama}</div>
            </div>
            <div>
              <div className={EYEBROW}>Membaca</div>
              <div className="flex flex-wrap gap-1.5 mt-0.5">
                {f.kodeInfo?.saringan.length ? (
                  f.kodeInfo.saringan.map((s) => (
                    <span key={s} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface text-ink-soft">
                      {LABEL_SARINGAN[s]}
                      {f.kodeInfo?.wajib.includes(s) && " (wajib)"}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-ink-muted">—</span>
                )}
              </div>
            </div>
            {f.updated_by && (
              <div className="ml-auto text-[11px] text-ink-muted">
                Diubah {f.updated_by} · {new Date(f.updated_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            )}
          </div>

          <PanelKata key={`k-${f.kode}`} kode={f.kode} data={data} bisaUbah={bisaUbah} />
          <PanelContoh key={`c-${f.kode}`} kode={f.kode} data={data} bisaUbah={bisaUbah} />

          <CatatanInfo>
            Fungsi dipilih bila nilai kata kuncinya paling tinggi dan minimal 1. Kata yang persis = nilai penuh, salah ketik ringan
            (kata 4 huruf ke atas) = setengah. Kata pendek (≤3 huruf) harus persis. Perubahan berlaku di WA paling lama 1 menit.
          </CatatanInfo>
        </div>
      )}
    </div>
  );
}
