"use client";

import { useMemo, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/app/admin/_ui";
import { META } from "../_hooks/useKinerjaYantek";
import { kelompokkan, teksWa, type ItemHarian } from "../_lib/realisasiHarian";

/**
 * Pratinjau teks WA realisasi harian — SATU pesan per ULP (keputusan user).
 * "Buka WhatsApp" membuka aplikasi dengan teks siap kirim; penerimanya dipilih
 * sendiri. Pratinjau memakai lebar layar HP supaya tampak seperti di sana.
 */

interface Props {
  tgl: string;
  /** ULP terpilih di tab; "SEMUA" = pilih salah satu di sini. */
  ulp: string;
  item: ItemHarian[];
  daftarUlp: string[];
  onTutup: () => void;
}

export default function KirimWaHarianModal({ tgl, ulp, item, daftarUlp, onTutup }: Props) {
  const toast = useToast();
  const semua = ulp === "SEMUA";
  const [pilih, setPilih] = useState(semua ? (item[0]?.ulp ?? daftarUlp[0] ?? "") : ulp);

  const teks = useMemo(
    () => teksWa(pilih, tgl, kelompokkan(item.filter((x) => x.ulp === pilih), META)),
    [pilih, tgl, item],
  );
  const jumlahPer = (u: string) => item.filter((x) => x.ulp === u).length;

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(teks);
      toast.success(`Teks realisasi ${pilih} tersalin — tempel di grup WA.`);
    } catch {
      toast.error("Peramban menolak menyalin. Blok teksnya lalu salin manual.");
    }
  };

  return (
    <ModalShell
      title="Kirim realisasi harian ke WA"
      subtitle="Satu pesan per ULP · penerima dipilih di WhatsApp"
      maxWidth="max-w-xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={() => void salin()} className={BTN_GHOST}>
            <Copy size={14} /> Salin teks
          </button>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(teks)}`}
            target="_blank"
            rel="noreferrer"
            className={BTN_PRIMARY}
          >
            <MessageCircle size={15} /> Buka WhatsApp
          </a>
        </>
      }
    >
      {semua && (
        <div>
          <p className={`${EYEBROW} mb-1.5`}>ULP</p>
          <div className="flex flex-wrap gap-2">
            {daftarUlp.map((u) => (
              <button key={u} onClick={() => setPilih(u)} className={`${CHIP} ${pilih === u ? CHIP_ON : CHIP_OFF}`}>
                {u} <span className="opacity-70">{jumlahPer(u)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Lebar ±HP: yang terbaca di sini sama dengan yang terbaca di grup. */}
      <div className="mx-auto max-w-[360px] rounded-2xl bg-[#E7FFDB] border border-[#C8E6B5] px-3.5 py-3 shadow-sm">
        <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-snug text-[#111B21]">{teks}</pre>
      </div>
    </ModalShell>
  );
}
