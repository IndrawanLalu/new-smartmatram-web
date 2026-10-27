"use client";

import { useState } from "react";
import { Copy, Loader2, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { useLm4dx } from "../_hooks/useLm4dx";
import { BULAN } from "../_lib/kinerjaMeta";
import { hariIniWita } from "../_lib/realisasiHarian";
import { teksTempelLm } from "../_lib/lm4dx";
import TabelLm4dx from "./TabelLm4dx";
import AturLm4dxModal from "./AturLm4dxModal";

/**
 * Copy to LM 4DX (27 Okt 2026): blok bulanan spreadsheet Lead Measure 4DX —
 * baris pekerjaan × tanggal 1–31 — disalin lalu ditempel di sel tanggal.
 * "Salin tanggal" hanya satu kolom, supaya isian manual hari lain di
 * spreadsheet (baris yang tidak ada di SMART) tidak tertimpa sel kosong.
 */

interface Props {
  ulpAwal: string;
  daftarUlp: string[];
  /** Pengatur daftar baris: UP3 & admin. null = tidak boleh. */
  pengatur: string | null;
}

export default function CopyLm4dx({ ulpAwal, daftarUlp, pengatur }: Props) {
  const o = useLm4dx(ulpAwal);
  const toast = useToast();
  const [atur, setAtur] = useState(false);
  const hariIni = hariIniWita();
  const [pilihHari, setPilihHari] = useState(() => Number(hariIni.slice(8, 10)));

  const [y, m] = o.bulan.split("-").map(Number);
  const jumlahHari = new Date(y, m, 0).getDate();
  const hari = Math.min(pilihHari, jumlahHari);
  const namaBulan = `${BULAN[m - 1]} ${y}`;

  const salin = async (h: number | null) => {
    try {
      await navigator.clipboard.writeText(teksTempelLm(o.baris, o.matriks, h));
      toast.success(h === null
        ? `${o.baris.length} baris × 31 tanggal tersalin — tempel di sel tanggal 1 baris pertama blok ${namaBulan}.`
        : `Tanggal ${h} (${o.baris.length} baris) tersalin — tempel di sel tanggal ${h} baris pertama blok ${namaBulan}.`);
    } catch {
      toast.error("Gagal menyalin — izinkan akses papan klip di peramban.");
    }
  };

  const siap = !o.loading && !o.galat && o.baris.length > 0;

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-ink-soft">
          Bulan
          <input type="month" value={o.bulan} onChange={(e) => o.setBulan(e.target.value)} className={`${FIELD} w-[170px] mt-1 block`} />
        </label>
        <label className="text-xs text-ink-soft">
          ULP
          <select value={o.ulp} onChange={(e) => o.setUlp(e.target.value)} className={`${FIELD} w-[160px] mt-1 block`} disabled={daftarUlp.length <= 1}>
            {daftarUlp.map((u) => <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>)}
          </select>
        </label>
        <button onClick={o.muat} className={BTN_GHOST} disabled={o.loading}>
          <RefreshCw size={14} className={o.loading ? "animate-spin" : ""} /> Muat ulang
        </button>
        {pengatur && (
          <button onClick={() => setAtur(true)} className={BTN_GHOST} disabled={o.loading}>
            <Settings2 size={14} /> Atur baris
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-end gap-2">
          <label className="text-xs text-ink-soft">
            Tanggal
            <select value={hari} onChange={(e) => setPilihHari(Number(e.target.value))} className={`${FIELD} w-[90px] mt-1 block`}>
              {Array.from({ length: jumlahHari }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </label>
          <button onClick={() => void salin(hari)} className={BTN_PRIMARY} disabled={!siap}>
            <Copy size={14} /> Salin tanggal {hari}
          </button>
          <button onClick={() => void salin(null)} className={BTN_GHOST} disabled={!siap}>
            <Copy size={14} /> Salin sebulan
          </button>
        </div>
      </div>

      <p className="text-xs text-ink-soft -mt-1">
        Pekerjaan yang dikirim regu, <b>termasuk yang belum disetujui</b>. Salinan hanya angka, tanpa uraian —
        tempel di sel tanggal pada <b>baris pertama</b> blok bulan itu. Baris yang tidak ada di SMART tersalin
        kosong dan <b>menghapus</b> isian manual di sel tujuan; pakai <b>Salin tanggal</b> supaya hari lain aman.
      </p>

      {o.galat && !o.loading && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">{o.galat}</p>
        </div>
      )}

      {o.loading ? (
        <div className="p-8 flex items-center justify-center gap-2 text-sm text-ink-soft">
          <Loader2 size={16} className="animate-spin" /> Memuat realisasi…
        </div>
      ) : o.baris.length > 0 ? (
        <TabelLm4dx
          baris={o.baris}
          matriks={o.matriks}
          namaKategori={o.namaKategori}
          jumlahHari={jumlahHari}
          hariTerpilih={hari}
          hariIni={hariIni.slice(0, 7) === o.bulan ? Number(hariIni.slice(8, 10)) : null}
        />
      ) : (
        !o.galat && <p className="text-xs text-ink-muted">Daftar baris LM 4DX masih kosong — isi lewat Atur baris.</p>
      )}

      {atur && pengatur && (
        <AturLm4dxModal
          baris={o.baris}
          kategori={o.kategori}
          oleh={pengatur}
          onTutup={() => setAtur(false)}
          onTersimpan={o.muat}
        />
      )}
    </>
  );
}
