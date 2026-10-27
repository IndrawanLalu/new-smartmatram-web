"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import type { SectionPeta } from "../_hooks/useSectionPeta";
import { INPUT } from "../_ui";

/**
 * Nama section di panel Section + ubah nama (27 Okt 2026,
 * `scripts/jtm-section-nama.sql`). Nama otomatis = hulu - keypoint hilir;
 * nama ubahan admin tidak ditimpa saat section disusun ulang, dan
 * "Pakai nama otomatis" mengembalikannya.
 */

interface Props {
  s: SectionPeta;
  boleh: boolean;
  oleh: string;
  onBerubah: () => void;
}

export default function NamaSection({ s, boleh, oleh, onBerubah }: Props) {
  const toast = useToast();
  const [ubah, setUbah] = useState(false);
  const [nama, setNama] = useState(s.nama);
  const [sibuk, setSibuk] = useState(false);
  const otomatisBeda = s.nama_bebas && s.nama_otomatis && s.nama_otomatis !== s.nama;

  const simpan = async (v: string) => {
    setSibuk(true);
    const { error } = await supabaseBrowser.rpc("ubah_nama_section", { p_section: s.id, p_nama: v, p_oleh: oleh });
    setSibuk(false);
    if (error) {
      toast.error(error.message.includes("Could not find the function")
        ? "Ubah nama section belum terpasang — jalankan scripts/jtm-section-nama.sql di Supabase."
        : error.message);
      return;
    }
    toast.success(v.trim() ? "Nama section diubah." : "Nama section kembali otomatis.");
    setUbah(false);
    onBerubah();
  };

  if (ubah) {
    return (
      <div className="mt-1 space-y-1.5">
        <input className={INPUT} value={nama} onChange={(e) => setNama(e.target.value)} autoFocus />
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => void simpan(nama)}
            disabled={sibuk || !nama.trim()}
            className="rounded-lg bg-linear-to-r from-[#004D40] to-[#00897B] px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
          >
            {sibuk ? "Menyimpan…" : "Simpan"}
          </button>
          {s.nama_bebas && (
            <button onClick={() => void simpan("")} disabled={sibuk} className="rounded-lg border border-white/15 px-2.5 py-1 text-xs text-gray-300 hover:bg-white/5">
              Pakai nama otomatis
            </button>
          )}
          <button onClick={() => setUbah(false)} className="rounded-lg px-2.5 py-1 text-xs text-gray-400 hover:text-white">
            Batal
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <p className="text-sm font-semibold break-words">
        {s.nama}
        {boleh && (
          <button
            onClick={() => { setNama(s.nama); setUbah(true); }}
            className="ml-1.5 align-middle text-gray-500 hover:text-white"
            title="Ubah nama section"
          >
            <Pencil size={12} />
          </button>
        )}
      </p>
      {otomatisBeda && <p className="text-[11px] text-gray-500 break-words">Otomatis: {s.nama_otomatis}</p>}
    </>
  );
}
