"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fotoKecil } from "@/lib/fotoKecil";

/**
 * "Pekerjaan yang dikerjakan" satu catatan (scripts/pekerjaan-tindakan.sql):
 * nama, jumlah + satuan, foto. Dipakai detail Pemeliharaan Gardu dan
 * Pemerataan Beban. Kosong = tidak tampil (catatan lama / tidak ada tindakan).
 */

interface Baris {
  tindakan_kode: string;
  jumlah: number;
  foto_url: string;
  tindakan_ref: { nama: string; satuan: string } | null;
}

export default function DaftarTindakan({ modul, sumberId }: { modul: "hargardu" | "penyeimbangan"; sumberId: string }) {
  const [isi, setIsi] = useState<Baris[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .from("pekerjaan_tindakan")
      .select("tindakan_kode,jumlah,foto_url,tindakan_ref(nama,satuan)")
      .eq("modul", modul)
      .eq("sumber_id", sumberId)
      .order("tindakan_kode")
      .then(({ data, error }) => {
        if (!hidup) return;
        setGalat(error ? error.message : null);
        setIsi((data ?? []) as unknown as Baris[]);
      });
    return () => { hidup = false; };
  }, [modul, sumberId]);

  if (galat) return <p className="text-xs text-amber-700">Pekerjaan yang dikerjakan gagal dibaca: {galat}</p>;
  if (!isi || isi.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold text-ink-soft uppercase tracking-wide">Pekerjaan yang dikerjakan</p>
      <div className="flex flex-col divide-y divide-line rounded-xl border border-line">
        {isi.map((t) => (
          <div key={t.tindakan_kode} className="flex items-center gap-3 px-3 py-2">
            <a href={t.foto_url} target="_blank" rel="noreferrer" className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- gambar mini (lib/fotoKecil); klik = asli */}
              <img src={fotoKecil(t.foto_url, 96)} alt="" loading="lazy" className="w-12 h-12 rounded-md object-cover border border-line" />
            </a>
            <span className="flex-1 text-sm text-ink">{t.tindakan_ref?.nama ?? t.tindakan_kode}</span>
            <span className="text-sm font-semibold tabular-nums text-ink">
              {t.jumlah} <span className="text-xs font-normal text-ink-soft">{t.tindakan_ref?.satuan ?? ""}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
