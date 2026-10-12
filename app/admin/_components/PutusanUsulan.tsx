"use client";

import { useState } from "react";
import { BadgeCheck, Loader2, Undo2 } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";

/**
 * Tombol putusan usulan koreksi master — alasan WAJIB saat menolak. Dipakai
 * Persetujuan Pengukuran dan Detail Pemeliharaan Gardu.
 */
export default function PutusanUsulan({
  labelTolak,
  onPutuskan,
}: {
  labelTolak: string;
  onPutuskan: (setuju: boolean, alasan: string) => Promise<unknown>;
}) {
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState<"ya" | "tidak" | null>(null);

  const tekan = async (setuju: boolean) => {
    setSibuk(setuju ? "ya" : "tidak");
    try {
      await onPutuskan(setuju, alasan.trim());
    } finally {
      setSibuk(null);
    }
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <input
        value={alasan}
        onChange={(e) => setAlasan(e.target.value)}
        placeholder="Catatan — wajib kalau ditolak"
        className={`${FIELD} flex-1 min-w-[220px]`}
      />
      <button
        onClick={() => void tekan(false)}
        disabled={sibuk !== null || !alasan.trim()}
        title={alasan.trim() ? labelTolak : "Tulis alasannya dulu"}
        className={`${BTN_GHOST} border-red-200 text-red-700 hover:bg-red-50`}
      >
        {sibuk === "tidak" ? <Loader2 size={15} className="animate-spin" /> : <Undo2 size={15} />}
        {labelTolak}
      </button>
      <button onClick={() => void tekan(true)} disabled={sibuk !== null} className={BTN_PRIMARY}>
        {sibuk === "ya" ? <Loader2 size={15} className="animate-spin" /> : <BadgeCheck size={15} />}
        Setujui
      </button>
    </div>
  );
}
