"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import type { PratinjauBatalJtm } from "@/app/admin/jtm/_hooks/useDaftarJtm";
import type { SegmenBaris } from "../_hooks/useMasterSegmen";

/**
 * Hapus segmen yatim — fungsi yang sama dengan tombol 🗑 di HP
 * (`batalkan_jtm_hp`). Pratinjaunya dibaca dulu dari database: segmen lanjutan
 * yang disambung dari segmen ini IKUT terhapus, dan itu harus terbaca sebelum
 * tombolnya ditekan, bukan sesudahnya.
 */

interface Props {
  segmen: SegmenBaris;
  onPratinjau: () => Promise<PratinjauBatalJtm | null>;
  onHapus: (alasan: string) => Promise<boolean>;
  onTutup: () => void;
}

export default function HapusSegmenYatim({ segmen, onPratinjau, onHapus, onTutup }: Props) {
  const [p, setP] = useState<PratinjauBatalJtm | null | undefined>(undefined);

  useEffect(() => {
    let hidup = true;
    void onPratinjau().then((h) => hidup && setP(h));
    return () => { hidup = false; };
    // Sekali per segmen yang dibuka — onPratinjau dibuat ulang tiap render induk.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmen.segmen_id]);

  if (p === undefined) {
    return (
      <div className="fixed inset-0 z-[2050] flex items-center justify-center bg-black/30">
        <Loader2 size={22} className="animate-spin text-white" />
      </div>
    );
  }

  if (!p || p.mode !== "segmen" || !p.boleh) {
    const halangan = (p?.segmen ?? []).filter((s) => s.halangan).map((s) => `${s.nama}: ${s.halangan}`);
    return (
      <ConfirmDialog
        title="Segmen ini tidak bisa dihapus"
        message={[p?.tolak ?? "Pratinjau gagal dibaca.", ...halangan].join(" · ")}
        confirmLabel="Tutup"
        tone="primary"
        onClose={onTutup}
        onConfirm={onTutup}
      />
    );
  }

  const daftar = p.segmen ?? [];
  const rantai = daftar.length > 1;
  return (
    <BatalkanModal
      judul={rantai ? `Hapus ${segmen.nama} + ${daftar.length - 1} segmen lanjutannya?` : `Hapus segmen ${segmen.nama}?`}
      keterangan={`Yang dihapus: ${daftar.map((s) => `${s.nama} (${s.tiang} tiang)`).join(" · ")}. Tiangnya ditandai batal — nomornya tidak dipakai lagi dan tidak muncul di peta. Segmennya dinonaktifkan, jejaknya tersimpan di riwayat master.`}
      peringatan={
        rantai
          ? "Segmen lanjutan yang disambung dari segmen ini ikut terhapus. Tidak bisa dikembalikan."
          : "Tidak bisa dikembalikan."
      }
      labelTombol={`Hapus ${p.tiang ?? 0} tiang`}
      placeholder="Alasan — mis. inspeksinya sudah dibatalkan, salah penyulang, uji coba"
      onTutup={onTutup}
      onBatalkan={onHapus}
    />
  );
}
