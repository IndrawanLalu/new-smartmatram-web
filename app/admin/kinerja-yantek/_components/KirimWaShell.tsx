"use client";

import type { ReactNode } from "react";
import { Copy, MessageCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";

/**
 * Kerangka "kirim ke WA": pratinjau selebar HP + Salin teks + Buka WhatsApp
 * (penerima dipilih sendiri di WhatsApp). Dipakai realisasi harian & bulanan.
 */

interface Props {
  title: string;
  subtitle: string;
  teks: string;
  /** Kalimat toast setelah tersalin. */
  pesanSalin: string;
  onTutup: () => void;
  /** Pilihan di atas pratinjau (mis. ULP). */
  children?: ReactNode;
}

export default function KirimWaShell({ title, subtitle, teks, pesanSalin, onTutup, children }: Props) {
  const toast = useToast();

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(teks);
      toast.success(pesanSalin);
    } catch {
      toast.error("Peramban menolak menyalin. Blok teksnya lalu salin manual.");
    }
  };

  return (
    <ModalShell
      title={title}
      subtitle={subtitle}
      maxWidth="max-w-xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={() => void salin()} className={BTN_GHOST}>
            <Copy size={14} /> Salin teks
          </button>
          <a href={`https://wa.me/?text=${encodeURIComponent(teks)}`} target="_blank" rel="noreferrer" className={BTN_PRIMARY}>
            <MessageCircle size={15} /> Buka WhatsApp
          </a>
        </>
      }
    >
      {children}
      {/* Lebar ±HP: yang terbaca di sini sama dengan yang terbaca di grup. */}
      <div className="mx-auto max-w-[360px] rounded-2xl bg-[#E7FFDB] border border-[#C8E6B5] px-3.5 py-3 shadow-sm">
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-snug text-[#111B21]">{teks}</pre>
      </div>
    </ModalShell>
  );
}
