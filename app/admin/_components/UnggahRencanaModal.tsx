"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2, Lock, TriangleAlert, Upload, XCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import { labelBulan, type IsiBerkas, type Pratinjau } from "@/lib/rencanaGardu";

/**
 * Unggah rencana gardu (Rencana Pemeliharaan / Rencana Pengukuran): pilih berkas → pratinjau (jumlah per bulan,
 * galat yang menghalangi, peringatan yang tidak) → Simpan. Server memeriksa
 * ulang semua yang menghalangi.
 */

interface Props {
  /** "Rencana Pemeliharaan" / "Rencana Pengukuran". */
  nama: string;
  ulp: string;
  pratinjau: (ulp: string, file: File) => Promise<{ isi: IsiBerkas; hasil: Pratinjau }>;
  simpan: (ulp: string, isi: IsiBerkas) => Promise<{ tersimpan: number; bulan_terkunci: string[] }>;
  onTutup: () => void;
}

export default function UnggahRencanaModal({ nama: namaRencana, ulp, pratinjau, simpan, onTutup }: Props) {
  const toast = useToast();
  const [nama, setNama] = useState<string | null>(null);
  const [membaca, setMembaca] = useState(false);
  const [galatBaca, setGalatBaca] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ isi: IsiBerkas; hasil: Pratinjau } | null>(null);
  const [menyimpan, setMenyimpan] = useState(false);

  const pilih = async (f: File | undefined) => {
    if (!f) return;
    setNama(f.name);
    setHasil(null);
    setGalatBaca(null);
    setMembaca(true);
    try {
      setHasil(await pratinjau(ulp, f));
    } catch (e) {
      setGalatBaca(e instanceof Error ? e.message : "Berkas gagal dibaca.");
    } finally {
      setMembaca(false);
    }
  };

  const klikSimpan = async () => {
    if (!hasil) return;
    setMenyimpan(true);
    try {
      const r = await simpan(ulp, hasil.isi);
      toast.success(
        `Rencana ${ulp} tersimpan: ${r.tersimpan} tanda.` +
          (r.bulan_terkunci.length ? ` Bulan ${r.bulan_terkunci.join(", ")} dilewati (WO sudah terbit).` : ""),
      );
      onTutup();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan rencana.");
    } finally {
      setMenyimpan(false);
    }
  };

  const p = hasil?.hasil;
  const bolehSimpan = !!p && p.galat.length === 0 && p.jumlahTanda > 0 && !menyimpan;

  return (
    <ModalShell
      title={`Unggah ${namaRencana} · ${ulp}`}
      subtitle="Berkas templat hasil tombol Unduh templat, sudah diberi tanda bulan"
      maxWidth="max-w-3xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={menyimpan}>Batal</button>
          <button onClick={() => void klikSimpan()} className={BTN_PRIMARY} disabled={!bolehSimpan}>
            {menyimpan ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Simpan rencana
          </button>
        </>
      }
    >
      <label className="flex items-center gap-3 rounded-xl border-2 border-dashed border-line px-4 py-4 cursor-pointer hover:border-navy-300 transition-colors">
        <FileSpreadsheet size={22} className="text-navy-600 shrink-0" />
        <span className="text-sm text-ink">
          {nama ?? "Pilih berkas Excel (.xlsx)"}
          <span className="block text-[11px] text-ink-muted">{nama ? "Klik untuk memilih berkas lain" : `Templat ${namaRencana} dari SMART`}</span>
        </span>
        <input
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => { void pilih(e.target.files?.[0]); e.target.value = ""; }}
        />
      </label>

      {membaca && (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft"><Loader2 size={15} className="animate-spin" /> Membaca berkas & mencocokkan ke Master Gardu…</p>
      )}
      {galatBaca && (
        <p className="mt-4 flex items-start gap-2 text-sm text-red-700"><XCircle size={15} className="mt-0.5 shrink-0" /> {galatBaca}</p>
      )}

      {p && hasil && (
        <div className="mt-4 flex flex-col gap-4">
          <p className="text-sm text-ink">
            <b>{p.jumlahGardu}</b> gardu · <b>{p.jumlahTanda}</b> tanda bulan ·{" "}
            {labelBulan(p.perBulan[0].bulan)} s.d. {labelBulan(p.perBulan[p.perBulan.length - 1].bulan)}
          </p>

          <div>
            <p className={EYEBROW}>Gardu per bulan</p>
            <div className="mt-1.5 grid grid-cols-4 sm:grid-cols-6 gap-1.5">
              {p.perBulan.map((b) => (
                <div
                  key={labelBulan(b.bulan)}
                  className={`rounded-lg border px-2 py-1.5 text-center ${
                    b.terkunci ? "border-line bg-surface opacity-60" : b.lewatKuota ? "border-amber-300 bg-amber-50" : "border-line"
                  }`}
                >
                  <p className="text-[10px] text-ink-muted">{labelBulan(b.bulan)}</p>
                  <p className={`text-base font-bold tabular-nums ${b.lewatKuota && !b.terkunci ? "text-amber-800" : "text-ink"}`}>
                    {b.terkunci ? <Lock size={13} className="inline -mt-0.5" /> : b.jumlah}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {p.galat.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <p className="font-semibold">Belum bisa disimpan</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">{p.galat.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          )}
          {p.peringatan.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <p className="flex items-center gap-1.5 font-semibold"><TriangleAlert size={14} /> Perhatikan — tetap bisa disimpan</p>
              <ul className="mt-1 list-disc pl-5 space-y-0.5">{p.peringatan.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          )}
          {p.galat.length === 0 && p.jumlahTanda === 0 && (
            <p className="text-sm text-ink-soft">Berkas belum berisi tanda bulan sama sekali.</p>
          )}
          <p className="text-[11px] text-ink-muted">
            Menyimpan MENGGANTI seluruh rencana {ulp} di bulan-bulan yang WO-nya belum terbit dalam periode ini.
          </p>
        </div>
      )}
    </ModalShell>
  );
}
