"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { CARD } from "@/app/admin/_ui";
import { useToast } from "@/app/admin/_components/Toast";
import type { BarisOptimasi } from "../_hooks/useOptimasiTrafo";
import KartuOptimasi from "./KartuOptimasi";

interface Props {
  baris: BarisOptimasi[];
  loading: boolean;
  oleh: string;
  onVerifikasi: (id: string, oleh: string) => Promise<number>;
  onBatalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
  onPastikan: (id: string, oleh: string) => Promise<void>;
}

export default function DaftarOptimasi({
  baris, loading, oleh, onVerifikasi, onBatalkan, onPastikan,
}: Props) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState<string | null>(null);

  const jalankan = async (id: string, kerja: () => Promise<string>) => {
    setSibuk(id);
    try {
      toast.success(await kerja());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    } finally {
      setSibuk(null);
    }
  };

  const verifikasi = (b: BarisOptimasi) => {
    const ok = window.confirm(
      `Verifikasi optimasi ${b.kodeGardu}?\n\n` +
        `Master gardu akan berubah: ${b.kvaLama} → ${b.kvaBaru} kVA, nomor seri → ${b.noSeriBaru}.`,
    );
    if (!ok) return;
    void jalankan(b.id, async () => {
      const n = await onVerifikasi(b.id, oleh);
      return n > 0 ? `Diverifikasi — ${n} isian master diperbarui.` : "Diverifikasi. Master sudah sesuai.";
    });
  };

  const batalkan = (b: BarisOptimasi) => {
    const alasan = window.prompt(
      "Alasan pembatalan — dibaca orang lain enam bulan lagi, jadi sebutkan apa yang keliru:",
    );
    if (!alasan?.trim()) return;
    void jalankan(b.id, async () => {
      await onBatalkan(b.id, alasan.trim(), oleh);
      return "Dibatalkan. Usulan masternya ikut ditolak.";
    });
  };

  const pastikan = (b: BarisOptimasi) => {
    const ok = window.confirm(
      "Nyatakan gardu seberang sudah dipastikan?\n\n" +
        "Pakai ini hanya kalau isian master gardu asal/tujuan sudah diperiksa. " +
        "Jejak yang bersambung sendiri lewat nomor seri tidak perlu dipastikan.",
    );
    if (!ok) return;
    void jalankan(b.id, async () => {
      await onPastikan(b.id, oleh);
      return "Jejak dipastikan.";
    });
  };

  if (loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat catatan…
      </div>
    );
  }

  if (baris.length === 0) {
    return (
      <div className={`${CARD} p-10 text-center`}>
        <p className="text-sm font-semibold text-ink">Belum ada optimasi trafo</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-md mx-auto">
          Optimasi dicatat dari HP oleh regu yang mengganti trafonya — lengkap dengan foto papan nama
          trafo lama dan baru. WO-nya terbit dari tab Tindak Lanjut Anomali di Pengukuran Gardu.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {baris.map((b) => (
        <KartuOptimasi
          key={b.id}
          b={b}
          sibuk={sibuk === b.id}
          onVerifikasi={() => verifikasi(b)}
          onBatalkan={() => batalkan(b)}
          onPastikan={() => pastikan(b)}
        />
      ))}
    </div>
  );
}
