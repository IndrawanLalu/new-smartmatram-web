"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { RincianTiang } from "../_hooks/useObjekPeta";
import type { Penanda } from "../_hooks/usePenandaJtm";
import { INPUT, JUDUL_BAGIAN } from "../_ui";
import { Baris, TOMBOL_PANEL } from "./InfoTiang";
import PilihKodeGardu from "./PilihKodeGardu";

/**
 * Penanda tiang JTM — jenis peralatannya (Recloser, LBSM, FCO, gardu …) dan
 * NAMANYA (SAMPOERNA) atau kode gardunya. Bagian sendiri, bukan terselip di
 * "Ubah atribut": koreksi user 6 Okt 2026, penanda tak ketemu di sana.
 * Daftar jenisnya = "Penanda tiang" di Pengaturan JTM.
 */

interface Props {
  t: RincianTiang;
  penanda: Map<string, Penanda>;
  boleh: boolean;
  onUbahAtribut: (isi: Record<string, string>) => Promise<boolean>;
}

export default function PenandaTiang({ t, penanda, boleh, onUbahAtribut }: Props) {
  const [sunting, setSunting] = useState(false);
  const [isi, setIsi] = useState({ penanda: "", nama_peralatan: "", gardu_di_tiang: "" });
  const [sibuk, setSibuk] = useState(false);
  const gardu = isi.penanda === "gardu";

  const mulai = () => {
    setIsi({ penanda: t.penanda ?? "", nama_peralatan: t.nama_peralatan ?? "", gardu_di_tiang: t.gardu_di_tiang ?? "" });
    setSunting(true);
  };

  const simpan = async () => {
    setSibuk(true);
    // Nama peralatan hanya untuk peralatan; gardu memakai kode gardunya.
    const ok = await onUbahAtribut(
      gardu
        ? { penanda: isi.penanda, gardu_di_tiang: isi.gardu_di_tiang }
        : { penanda: isi.penanda, nama_peralatan: isi.penanda ? isi.nama_peralatan : "" },
    );
    setSibuk(false);
    if (ok) setSunting(false);
  };

  const label = t.penanda ? (penanda.get(t.penanda)?.label ?? t.penanda) : null;

  if (!sunting) {
    return (
      <div>
        <Baris label="Penanda" nilai={label} />
        {t.penanda && t.penanda !== "gardu" && <Baris label="Nama peralatan" nilai={t.nama_peralatan ?? "belum diisi"} />}
        {(t.penanda === "gardu" || t.gardu_di_tiang) && (
          <Baris
            label="Kode gardu"
            nilai={t.gardu_di_tiang ? `${t.gardu_di_tiang} — ${t.garduNama ?? "belum ada di Master Gardu"}` : "belum diisi"}
          />
        )}
        {boleh && (
          <button onClick={mulai} className={`${TOMBOL_PANEL} mt-1.5`}>
            <Pencil size={13} /> Ubah penanda
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-[#1e3552] p-3">
      <p className={JUDUL_BAGIAN}>Ubah penanda</p>
      <label className="block text-xs">
        <span className="text-gray-500">Jenis</span>
        <select value={isi.penanda} onChange={(e) => setIsi({ ...isi, penanda: e.target.value })} className={`${INPUT} mt-1`}>
          <option value="">— tanpa penanda —</option>
          {[...penanda.values()].map((p) => <option key={p.kode} value={p.kode}>{p.label}</option>)}
        </select>
      </label>
      {gardu ? (
        <PilihKodeGardu
          ulp={t.ulp}
          lat={t.lat}
          lng={t.lng}
          nilai={isi.gardu_di_tiang}
          onUbah={(v) => setIsi({ ...isi, gardu_di_tiang: v })}
        />
      ) : isi.penanda ? (
        <label className="block text-xs">
          <span className="text-gray-500">Nama peralatan</span>
          <input
            value={isi.nama_peralatan}
            onChange={(e) => setIsi({ ...isi, nama_peralatan: e.target.value })}
            placeholder="mis. SAMPOERNA"
            className={`${INPUT} mt-1 uppercase`}
          />
        </label>
      ) : null}
      <div className="flex gap-2 pt-1">
        <button onClick={() => void simpan()} disabled={sibuk} className={`${TOMBOL_PANEL} border-[#00897B] text-[#5eead4]`}>
          Simpan
        </button>
        <button onClick={() => setSunting(false)} disabled={sibuk} className={TOMBOL_PANEL}>
          Batal
        </button>
      </div>
    </div>
  );
}
