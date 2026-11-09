"use client";

import { useState } from "react";
import { Clock, Loader2 } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_PRIMARY, FIELD } from "@/app/admin/_ui";

/**
 * Kirim otomatis terjadwal ke spreadsheet PRO NTB (scripts/pro-ntb-otomatis.sql).
 * Pekerja memanggil web tiap jam; ULP yang jamnya tiba dikirim per tab lalu
 * dicek ulang. NAMA TIM memakai bawaan (ketikan di layar tidak tersimpan).
 */

export interface SetelanOtomatis {
  kirim_otomatis: boolean;
  jam_kirim: number;
  menit_kirim: number;
  otomatis_mulai: string | null;
  otomatis_selesai: string | null;
  otomatis_ringkas: string | null;
}

interface Props {
  ulp: string;
  /** null = pro-ntb-otomatis.sql belum dijalankan / spreadsheet belum diatur. */
  setelan: SetelanOtomatis | null;
  pengatur: boolean;
  onBerubah: () => void;
}

const dua = (n: number) => String(n).padStart(2, "0");
const waktu = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function OtomatisProNtb({ ulp, setelan, pengatur, onBerubah }: Props) {
  const toast = useToast();
  const [nyala, setNyala] = useState(setelan?.kirim_otomatis ?? false);
  /** "HH:MM" WITA. */
  const [pukul, setPukul] = useState(setelan ? `${dua(setelan.jam_kirim)}:${dua(setelan.menit_kirim ?? 0)}` : "22:00");
  const [simpan, setSimpan] = useState(false);

  if (!setelan) {
    return <p className="text-xs text-ink-muted">Kirim otomatis belum tersedia — jalankan scripts/pro-ntb-otomatis.sql.</p>;
  }
  const [jam, menit] = pukul.split(":").map(Number);
  const berubah = nyala !== setelan.kirim_otomatis || jam !== setelan.jam_kirim || menit !== (setelan.menit_kirim ?? 0);
  const jalan = !!setelan.otomatis_mulai && !setelan.otomatis_selesai;

  const kirimSetelan = async () => {
    setSimpan(true);
    try {
      const r = await fetch("/api/pro-ntb/kirim", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ulp, aksi: "otomatis", nyala, jam, menit }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
      toast.success(nyala ? `Kirim otomatis tiap hari pukul ${dua(jam)}.${dua(menit)} WITA.` : "Kirim otomatis dimatikan.");
      onBerubah();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSimpan(false);
    }
  };

  return (
    <div className="rounded-xl border border-line px-3 py-2 space-y-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Clock size={14} className="text-ink-muted" />
        <label className="inline-flex items-center gap-2 font-semibold text-ink">
          <input type="checkbox" checked={nyala} disabled={!pengatur || simpan} onChange={(e) => setNyala(e.target.checked)} className="accent-brand-600" />
          Kirim otomatis
        </label>
        <span className="text-ink-soft">tiap hari pukul</span>
        <input type="time" value={pukul} disabled={!pengatur || simpan} onChange={(e) => e.target.value && setPukul(e.target.value)} className={`${FIELD} py-1 w-auto`} />
        <span className="text-ink-soft">WITA</span>
        {pengatur && berubah && (
          <button onClick={() => void kirimSetelan()} className={BTN_PRIMARY} disabled={simpan}>
            {simpan && <Loader2 size={14} className="animate-spin" />} Simpan
          </button>
        )}
      </div>
      <p className="text-ink-muted">
        Sebulan dari tanggal 1 dikirim per jenis pekerjaan, lalu kolom PRO NTB di Rekap Kinerja dicek ulang. Tanggal 1–5 bulan lalu ikut dikirim.
        NAMA TIM memakai isian bawaan — ketikan di layar ini tidak ikut.
      </p>
      {jalan ? (
        <p className="text-ink-soft flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Sedang mengirim sejak {waktu(setelan.otomatis_mulai!)}…</p>
      ) : setelan.otomatis_selesai && (
        <p className={/gagal/.test(setelan.otomatis_ringkas ?? "") ? "text-red-700" : "text-ink-soft"}>
          Terakhir {waktu(setelan.otomatis_selesai)}: {setelan.otomatis_ringkas}
        </p>
      )}
    </div>
  );
}
