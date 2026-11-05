"use client";

import { useState } from "react";
import { Copy, Loader2, RefreshCw, Settings2, TriangleAlert } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { useLm4dx } from "@/app/admin/kinerja-yantek/_hooks/useLm4dx";
import { hariIniWita } from "@/app/admin/kinerja-yantek/_lib/realisasiHarian";
import { BULAN } from "@/app/admin/kinerja-yantek/_lib/kinerjaMeta";
import { NAMA_LAPORAN, teksTempelLm, type BarisLm, type Laporan } from "@/app/admin/kinerja-yantek/_lib/lm4dx";
import TabelLm4dx from "@/app/admin/kinerja-yantek/_components/TabelLm4dx";
import AturLm4dxModal from "@/app/admin/kinerja-yantek/_components/AturLm4dxModal";
import RincianLmModal from "./RincianLmModal";

/**
 * Tabel harian satu laporan (LM 4DX / Penurunan Susut), hanya yang disetujui,
 * plus salin ke spreadsheet (dulu "Copy to LM 4DX" di Rekap Kinerja).
 * "Salin tanggal" hanya satu kolom, supaya isian manual hari lain di
 * spreadsheet (baris yang tidak ada di SMART) tidak tertimpa sel kosong.
 */

interface Props {
  laporan: Laporan;
  ulpAwal: string;
  daftarUlp: string[];
  /** Pengatur daftar baris: UP3 & admin. null = tidak boleh. */
  pengatur: string | null;
}

export default function RealisasiLm({ laporan, ulpAwal, daftarUlp, pengatur }: Props) {
  const o = useLm4dx(ulpAwal, laporan);
  const toast = useToast();
  const [atur, setAtur] = useState(false);
  const [rincian, setRincian] = useState<{ baris: BarisLm; hari: number | null } | null>(null);
  const hariIni = hariIniWita();
  const [y, m] = o.bulan.split("-").map(Number);
  const jumlahHari = new Date(y, m, 0).getDate();
  const [pilihHari, setPilihHari] = useState(() => Number(hariIni.slice(8, 10)));
  const hari = Math.min(pilihHari, jumlahHari);
  const namaBulan = `${BULAN[m - 1]} ${y}`;
  const siap = !o.loading && !o.galat && o.baris.length > 0;

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
        Hanya pekerjaan yang <b>sudah disetujui</b>, di tanggal pekerjaannya. Yang masih menunggu persetujuan
        belum terhitung — angka hari ini bisa bertambah setelah admin menyetujui. Klik uraian (sebulan) atau
        angka (satu tanggal) untuk melihat daftar pekerjaannya. Salinan hanya angka, tanpa uraian — tempel di sel
        tanggal pada <b>baris pertama</b> blok bulan itu. Baris yang tidak ada di SMART tersalin kosong dan
        <b> menghapus</b> isian manual di sel tujuan; pakai <b>Salin tanggal</b> supaya hari lain aman.
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
          namaTindakan={o.namaTindakan}
          jumlahHari={jumlahHari}
          hariTerpilih={hari}
          hariIni={hariIni.slice(0, 7) === o.bulan ? Number(hariIni.slice(8, 10)) : null}
          teksTanpaSumber="belum ada sumber di SMART"
          onPilih={(baris, hari) => setRincian({ baris, hari })}
        />
      ) : (
        !o.galat && <p className="text-xs text-ink-muted">Daftar baris {NAMA_LAPORAN[laporan]} masih kosong — isi lewat Atur baris.</p>
      )}

      {rincian && (
        <RincianLmModal
          baris={rincian.baris}
          hari={rincian.hari}
          bulan={o.bulan}
          item={o.item}
          namaTindakan={o.namaTindakan}
          onTutup={() => setRincian(null)}
        />
      )}

      {atur && pengatur && (
        <AturLm4dxModal
          laporan={laporan}
          ulp={o.ulp}
          baris={o.baris}
          kategori={o.kategori}
          tindakan={o.tindakan}
          oleh={pengatur}
          onTutup={() => setAtur(false)}
          onTersimpan={o.muat}
        />
      )}
    </>
  );
}
