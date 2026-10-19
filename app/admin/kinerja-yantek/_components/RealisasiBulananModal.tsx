"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, TriangleAlert } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import { BULAN, type BarisKinerja } from "../_lib/kinerjaMeta";
import { ambilLampiran, type BahanLampiran } from "../_lib/ambilLampiran";

/**
 * Realisasi Bulanan — Excel lampiran tagihan satu ULP satu bulan
 * (rencana-lampiran-tagihan.md). ULP & bulan = pilihan Rekap Kinerja yang
 * sedang tampil, supaya lembar Rekap = tabel di layar.
 *
 * Sebelum unduh, jumlah pekerjaan yang dirinci dibandingkan dengan angka
 * Realisasi Rekap Kinerja per jenis. Beda = peringatan (unduh tetap boleh):
 * tagihan yang tidak cocok dengan rekap adalah persoalan saat diperiksa.
 */

interface Props {
  ulp: string;
  tahun: number;
  bulan: number;
  rekap: BarisKinerja[];
  onTutup: () => void;
}

interface Cek {
  kunci: string;
  jenis: string;
  satuan: string;
  desimal: boolean;
  rinci: number;
  rekap: number | null;
  cocok: boolean;
}

const fmt = (v: number | null, desimal: boolean) =>
  v === null ? "—" : desimal ? v.toFixed(2).replace(".", ",") : v.toLocaleString("id-ID");

export default function RealisasiBulananModal({ ulp, tahun, bulan, rekap, onTutup }: Props) {
  const toast = useToast();
  const [bahan, setBahan] = useState<BahanLampiran | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  // Lampiran tagihan per kontrak ULP, per bulan (keputusan user 16 Okt 2026).
  const sah = ulp !== "SEMUA" && ulp !== "" && bulan >= 1;

  useEffect(() => {
    if (!sah) return;
    let hidup = true;
    ambilLampiran(ulp, tahun, bulan).then(
      (b) => { if (hidup) setBahan(b); },
      (e: Error) => { if (hidup) setGalat(e.message); },
    );
    return () => { hidup = false; };
  }, [ulp, tahun, bulan, sah]);

  // Pekerjaan utama saja (bagian kosong) — rabas di luar WO & tegangan ujung
  // ikut dirinci, tapi tidak dihitung di angka Realisasi (sama dengan rekap).
  const cek = useMemo<Cek[]>(() => {
    if (!bahan) return [];
    return rekap.map((b) => {
      const rows = bahan.realisasi.filter((r) => r.kunci === b.kunci && r.bagian === null);
      const rinci = b.desimal ? rows.reduce((n, r) => n + (r.km ?? 0), 0) : rows.length;
      const cocok = b.realisasi === null ? rinci === 0 : Math.abs(rinci - b.realisasi) < (b.desimal ? 0.005 : 0.5);
      return { kunci: b.kunci, jenis: b.jenis, satuan: b.satuan, desimal: b.desimal, rinci, rekap: b.realisasi, cocok };
    });
  }, [bahan, rekap]);
  const beda = cek.filter((c) => !c.cocok);
  const tambahan = bahan
    ? { luar: bahan.luar.length, ujung: bahan.realisasi.filter((r) => r.bagian === "ujung").length }
    : null;

  const unduh = async () => {
    if (!bahan) return;
    setSibuk(true);
    try {
      const { unduhRealisasiBulanan } = await import("../_lib/unduhRealisasiBulanan");
      await unduhRealisasiBulanan(ulp, tahun, bulan, rekap, bahan);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title="Realisasi Bulanan"
      subtitle={sah ? `ULP ${ulp} · ${BULAN[bulan - 1]} ${tahun} — lampiran tagihan, hanya pekerjaan yang sudah disetujui` : "Lampiran tagihan"}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
          <button onClick={() => void unduh()} disabled={!bahan || sibuk} className={`${BTN_PRIMARY} flex items-center gap-2`}>
            {sibuk ? <Loader2 size={15} className="animate-spin" /> : <FileSpreadsheet size={15} />}
            {sibuk ? "Menyusun Excel…" : "Unduh Excel"}
          </button>
        </div>
      }
    >
      {!sah ? (
        <p className="text-sm text-ink-soft">
          Lampiran tagihan dibuat per ULP per bulan. Pilih <b>satu ULP</b> dan <b>satu bulan</b> di bagian atas Rekap
          Kinerja, lalu buka lagi.
        </p>
      ) : galat ? (
        <p className="text-sm text-red-600">{galat}</p>
      ) : !bahan ? (
        <p className="text-sm text-ink-soft flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Membaca pekerjaan yang disetujui…</p>
      ) : (
        <div className="space-y-3 text-sm">
          {beda.length > 0 ? (
            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-800">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <p>
                {beda.length} jenis pekerjaan rinciannya <b>tidak sama</b> dengan angka Realisasi Rekap Kinerja.
                Periksa sebelum dilampirkan — lihat baris bertanda di bawah.
              </p>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={16} /> Rincian semua jenis sama dengan angka Realisasi Rekap Kinerja.
            </p>
          )}

          <table className="w-full border-collapse text-[13px]">
            <thead className="kepala-kit">
              <tr>
                <th className="text-left px-3 py-2">Jenis pekerjaan</th>
                <th className="text-right px-3 py-2">Dirinci</th>
                <th className="text-right px-3 py-2">Realisasi rekap</th>
              </tr>
            </thead>
            <tbody>
              {cek.map((c) => (
                <tr key={c.kunci} className={`border-t border-line ${c.cocok ? "" : "bg-amber-50"}`}>
                  <td className="px-3 py-1.5">
                    {c.jenis}
                    {!c.cocok && <TriangleAlert size={13} className="inline ml-1.5 -mt-0.5 text-amber-600" />}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(c.rinci, c.desimal)} <span className="text-[11px] text-ink-muted">{c.satuan}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{fmt(c.rekap, c.desimal)} <span className="text-[11px] text-ink-muted">{c.satuan}</span></td>
                </tr>
              ))}
            </tbody>
          </table>

          {tambahan && (tambahan.luar > 0 || tambahan.ujung > 0) && (
            <p className="text-xs text-ink-soft">
              Ikut dirinci, di luar angka Realisasi:
              {tambahan.luar > 0 && <> {tambahan.luar} pohon dirabas di luar WO (lembar sendiri)</>}
              {tambahan.luar > 0 && tambahan.ujung > 0 && " ·"}
              {tambahan.ujung > 0 && <> {tambahan.ujung} titik tegangan ujung (di lembar Pengukuran)</>}.
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Lembar pertama = Rekap Realisasi seperti tabel di layar; lembar berikutnya = rincian tiap jenis dengan format
            unduhan modulnya. JTM per segmen, JTR per gardu.
          </p>
        </div>
      )}
    </ModalShell>
  );
}
