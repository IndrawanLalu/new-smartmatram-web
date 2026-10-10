"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { MilikPenanda } from "@/lib/milikPenanda";
import { INPUT } from "../_ui";
import { Baris } from "./InfoTiang";

/**
 * Tiang dipakai beberapa penyulang dan berperalatan/bergardu: milik penyulang
 * mana (10 Okt 2026). Peralatan dipilih admin; gardu ikut master gardu; titik
 * pertemuan tampil di semua penyulangnya tapi dihitung sekali.
 */

interface Props {
  milik: MilikPenanda;
  penyulang: string[];
  boleh: boolean;
  onPilih: (penyulang: string | null) => Promise<boolean>;
}

export default function PemilikPeralatan({ milik, penyulang, boleh, onPilih }: Props) {
  const [sibuk, setSibuk] = useState(false);
  const label = "Peralatan milik penyulang";

  if (milik.status === "gardu") return <Baris label={label} nilai={`${milik.pemilik} (ikut master gardu)`} />;
  if (milik.status === "pertemuan") {
    return <Baris label={label} nilai={`titik pertemuan — tampil di semua penyulangnya, dihitung di ${milik.pemilik}`} />;
  }

  const belum = milik.status === "belum";
  if (!boleh) return <Baris label={label} nilai={belum ? `belum dipilih (sementara ${milik.pemilik})` : milik.pemilik} />;

  return (
    <div className="py-1 text-xs space-y-1">
      <label className="flex items-center gap-3">
        <span className="w-[110px] shrink-0 text-gray-500">{label}</span>
        <select
          value={belum ? "" : milik.pemilik}
          disabled={sibuk}
          onChange={async (e) => {
            setSibuk(true);
            await onPilih(e.target.value || null);
            setSibuk(false);
          }}
          className={`${INPUT} !py-1 flex-1 ${belum ? "!border-amber-400/70" : ""}`}
        >
          <option value="">— belum dipilih —</option>
          {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {sibuk && <Loader2 size={13} className="animate-spin text-gray-400" />}
      </label>
      {belum && (
        <p className="pl-[122px] text-[11px] text-amber-300">
          Belum dipilih — tampil di semua penyulangnya dengan tanda ?, sementara dihitung di {milik.pemilik}.
        </p>
      )}
    </div>
  );
}
