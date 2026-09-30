"use client";

import { useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { labelBulanWo, pilihanBulanWo } from "../_utils/bulanWo";

/**
 * Pindahkan WO anomali yang BELUM dikerjakan ke bulan lain — misalnya WO
 * September yang belum tersentuh dijadikan WO Oktober supaya terbaca di Rekap
 * Kinerja Oktober. Tidak terbawa otomatis: admin yang memilih.
 *
 * Penjaga sebenarnya ada di `pindah_bulan_wo_anomali`: yang sudah dikerjakan
 * atau dibatalkan dilewati dan disebut alasannya.
 */

interface Hasil {
  dipindah: string[];
  dilewati: { gardu: string; sebab: string }[];
}

interface Props {
  ids: string[];
  onDipindah: (ids: string[], bulan: string) => void;
  onBatal: () => void;
}

export default function PindahBulanWo({ ids, onDipindah, onBatal }: Props) {
  const toast = useToast();
  const pilihan = pilihanBulanWo();
  const [bulan, setBulan] = useState(pilihan[pilihan.length - 1].nilai);
  const [sibuk, setSibuk] = useState(false);

  async function pindahkan() {
    setSibuk(true);
    const [tahun, bln] = bulan.split("-").map(Number);
    const { data, error } = await supabaseBrowser.rpc("pindah_bulan_wo_anomali", {
      p_id: ids, p_tahun: tahun, p_bulan: bln,
    });
    setSibuk(false);
    if (error) {
      toast.error(`Gagal memindah bulan WO: ${error.message}`);
      return;
    }
    const h = data as Hasil;
    if (h.dipindah.length > 0) {
      onDipindah(h.dipindah, bulan);
      toast.success(`${h.dipindah.length} WO dipindah ke ${labelBulanWo(bulan)}.`);
    }
    if (h.dilewati.length > 0) {
      toast.info(`${h.dilewati.length} dilewati — ${h.dilewati.map((x) => `${x.gardu}: ${x.sebab}`).join(" · ")}`);
    }
  }

  return (
    <div className="px-5 py-2.5 border-b border-navy-200 bg-white flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <CalendarClock size={14} className="text-navy-600" />
      <span className="text-xs text-ink">{ids.length} WO dipilih — pindah ke</span>
      <select
        value={bulan}
        onChange={(e) => setBulan(e.target.value)}
        className="border border-line rounded-lg px-2 py-1 text-xs text-ink bg-white focus:outline-none focus:border-navy-500"
        aria-label="Bulan WO tujuan"
      >
        {pilihan.map((p) => <option key={p.nilai} value={p.nilai}>{p.label}</option>)}
      </select>
      <button
        onClick={pindahkan}
        disabled={sibuk}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-navy-600 text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
      >
        {sibuk && <Loader2 size={12} className="animate-spin" />}
        Pindahkan
      </button>
      <button onClick={onBatal} className="text-xs text-ink-soft hover:text-ink px-2 py-1">
        Batal pilih
      </button>
      <span className="text-[11px] text-ink-muted ml-auto">
        Hanya WO yang belum dikerjakan. Rekap Kinerja & surat WO mengikuti Bulan WO.
      </span>
    </div>
  );
}
