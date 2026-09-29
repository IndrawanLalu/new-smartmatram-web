"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { labelTanggal } from "../_lib/woSurat";

/**
 * Hari libur nasional — ditandai merah di lampiran dan tidak dihitung sebagai
 * hari efektif. Sabtu dan Minggu tidak perlu dimasukkan. Berlaku untuk semua
 * ULP, jadi diisi sekali saja per tahun.
 */

interface Libur {
  tanggal: string;
  keterangan: string;
}

interface Props {
  tahun: number;
  oleh: string;
  onTutup: () => void;
  onBerubah: () => void;
}

export default function HariLiburModal({ tahun, oleh, onTutup, onBerubah }: Props) {
  const toast = useToast();
  const [daftar, setDaftar] = useState<Libur[] | null>(null);
  const [tgl, setTgl] = useState("");
  const [ket, setKet] = useState("");
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    supabaseBrowser
      .from("hari_libur")
      .select("tanggal,keterangan")
      .gte("tanggal", `${tahun}-01-01`)
      .lte("tanggal", `${tahun}-12-31`)
      .order("tanggal")
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error) toast.error(`Hari libur gagal dibaca: ${error.message}`);
        setDaftar((data ?? []) as Libur[]);
      });
    return () => { hidup = false; };
  }, [tahun, toast]);

  const tambah = async () => {
    setSibuk(true);
    const baru = { tanggal: tgl, keterangan: ket.trim() };
    const { error } = await supabaseBrowser.from("hari_libur").upsert({ ...baru, oleh });
    setSibuk(false);
    if (error) return toast.error(error.message);
    setDaftar((d) => [...(d ?? []).filter((x) => x.tanggal !== tgl), baru].sort((a, b) => a.tanggal.localeCompare(b.tanggal)));
    setTgl("");
    setKet("");
    onBerubah();
  };

  const hapus = async (tanggal: string) => {
    const { error } = await supabaseBrowser.from("hari_libur").delete().eq("tanggal", tanggal);
    if (error) return toast.error(error.message);
    setDaftar((d) => (d ?? []).filter((x) => x.tanggal !== tanggal));
    onBerubah();
  };

  return (
    <ModalShell
      title={`Hari Libur ${tahun}`}
      subtitle="Tidak dihitung sebagai hari efektif di lampiran WO. Sabtu dan Minggu sudah otomatis."
      maxWidth="max-w-lg"
      onClose={onTutup}
      footer={<button onClick={onTutup} className={`${BTN_GHOST} ml-auto`}>Tutup</button>}
    >
      <div className="flex flex-wrap items-end gap-2">
        <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} className={`${FIELD} w-[160px]`} aria-label="Tanggal" />
        <input
          value={ket}
          onChange={(e) => setKet(e.target.value)}
          placeholder="Keterangan, mis. HUT RI"
          className={`${FIELD} flex-1 min-w-[160px]`}
        />
        <button onClick={() => void tambah()} className={BTN_PRIMARY} disabled={sibuk || !tgl || !ket.trim()}>
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Tambah
        </button>
      </div>

      {daftar === null ? (
        <p className="text-xs text-ink-muted">memuat…</p>
      ) : daftar.length === 0 ? (
        <p className="text-xs text-ink-muted">Belum ada hari libur untuk {tahun}.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {daftar.map((l) => (
            <li key={l.tanggal} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="w-[130px] font-semibold text-ink">{labelTanggal(l.tanggal)}</span>
              <span className="flex-1 text-ink-soft">{l.keterangan}</span>
              <button onClick={() => void hapus(l.tanggal)} aria-label="Hapus" className="text-red-600 hover:bg-red-50 rounded-lg p-1">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}
