"use client";

import { useEffect, useState } from "react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Lepas penyulang yang SALAH dinyatakan menumpang di tiang ini
 * (`scripts/jtm-lepas-tumpang.sql`). Pratinjau dulu — yang dihapus tidak
 * bisa dikembalikan dari layar, hanya terbaca di master_audit.
 */

interface Pratinjau {
  kode: string;
  /** Tiang sesudahnya di penyulang ini & ke mana ia menyambung (null = jadi pangkal). */
  hilir: { kode: string; ke: string | null }[];
  segmen: number;
  penilaian: number;
  jawaban_kabel: number;
  tugas: number;
}

interface Props {
  tiangId: string;
  /** Nama batang (penyulang pemilik). */
  batang: string;
  penyulang: string;
  onTutup: () => void;
  onLepas: (alasan: string) => Promise<boolean>;
}

export default function LepasTumpangJtm({ tiangId, batang, penyulang, onTutup, onLepas }: Props) {
  const toast = useToast();
  const [p, setP] = useState<Pratinjau | null>(null);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .rpc("pratinjau_lepas_tumpang_jtm", { p_tiang_id: tiangId, p_penyulang: penyulang })
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error) {
          toast.error(
            error.message.includes("Could not find the function")
              ? "Fungsi lepas tumpang belum ada — jalankan scripts/jtm-lepas-tumpang.sql di Supabase."
              : error.message,
          );
          onTutup();
          return;
        }
        setP(data as Pratinjau);
      });
    return () => { hidup = false; };
    // Sekali saat dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p) return null;

  const hapus = [
    `nama ${p.kode}`,
    p.segmen ? `keanggotaan di ${p.segmen} segmen ${penyulang}` : null,
    p.penilaian ? `${p.penilaian} penilaian di inspeksi ${penyulang} (jawaban & foto)` : null,
    p.jawaban_kabel ? `${p.jawaban_kabel} jawaban kabel ${penyulang} di inspeksi penyulang lain` : null,
  ].filter(Boolean).join(", ");

  const sambung = p.hilir
    .map((h) => (h.ke ? `${h.kode} menyambung ke ${h.ke}` : `${h.kode} menjadi PANGKAL ${penyulang}`))
    .join("; ");

  const peringatan = [
    sambung && `Sesudah dilepas: ${sambung}.`,
    "Data yang dihapus tidak bisa dikembalikan dari layar — salinannya hanya di catatan audit.",
    p.tugas ? `Ada ${p.tugas} tugas temuan dari tiang ini di ${penyulang}; batalkan terpisah bila salah juga.` : null,
  ].filter(Boolean).join(" ");

  return (
    <BatalkanModal
      judul={`Lepas ${penyulang} dari tiang ${batang}?`}
      keterangan={`Untuk penyulang ${penyulang} yang ternyata TIDAK lewat tiang ini. Yang dihapus: ${hapus}. Batang ${batang} dan data penyulang pemiliknya tidak berubah.`}
      peringatan={peringatan}
      labelTombol="Lepas & hapus datanya"
      placeholder={`Alasan — mis. ${penyulang} tidak lewat di sini, salah menumpang`}
      onTutup={onTutup}
      onBatalkan={onLepas}
    />
  );
}
