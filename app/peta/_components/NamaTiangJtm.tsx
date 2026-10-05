"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { GitFork, Tag } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST } from "@/app/admin/_ui";
import PratinjauNamaModal from "@/app/admin/jtm/_components/PratinjauNamaModal";
import type { PermintaanNama } from "@/lib/jtmNama";
import type { RincianTiang } from "../_hooks/useObjekPeta";
import { TOMBOL_PANEL } from "./InfoTiang";
import { INPUT } from "../_ui";

/**
 * Ganti nama tiang JTM dari peta — sekali di satu tiang, hilirnya ikut — dan
 * menjadikan tiang ini lanjutan jalur utama dari induknya. Keduanya lewat
 * pratinjau yang sama dengan tab Tiang JTM; tak ada yang tertulis sebelum
 * Terapkan.
 */

interface Props {
  t: RincianTiang;
  oleh: string;
  onBerubah: () => void;
}

export default function NamaTiangJtm({ t, oleh, onBerubah }: Props) {
  const daftar = t.nama.length > 0 ? t.nama : [{ penyulang: t.penyulang ?? "", kode: t.kode, utama: true }];
  const [penyulang, setPenyulang] = useState(daftar.find((n) => n.utama)?.penyulang ?? daftar[0].penyulang);
  const [ketik, setKetik] = useState<string | null>(null);
  const [buka, setBuka] = useState<{ judul: string; permintaan: PermintaanNama; kosong?: string } | null>(null);
  const toast = useToast();

  const kode = daftar.find((n) => n.penyulang === penyulang)?.kode ?? t.kode;
  const dasar = { penyulang, ulp: t.ulp ?? "" };

  const pratinjauGanti = () => {
    const baru = (ketik ?? "").trim().toUpperCase();
    if (!baru || baru === kode.toUpperCase()) return setKetik(null);
    setBuka({ judul: `Ganti nama ${kode} → ${baru}`, permintaan: { ...dasar, mulai: t.id, namaMulai: baru } });
    setKetik(null);
  };

  /** Koreksi satu tiang tanpa menyentuh hilirnya. */
  const hanyaIni = async (baru: string) => {
    const { error } = await supabaseBrowser.rpc("ubah_kode_tiang_jtm", {
      p_tiang_id: t.id,
      p_penyulang: penyulang,
      p_kode: baru,
      p_oleh: oleh,
    });
    if (error) return toast.error(error.message);
    toast.success(`${kode} kini bernama ${baru} — tiang lain tidak berubah.`);
    setBuka(null);
    onBerubah();
  };

  return (
    <div className="space-y-2">
      {daftar.length > 1 && (
        <select value={penyulang} onChange={(e) => setPenyulang(e.target.value)} className={INPUT} aria-label="Nama di penyulang">
          {daftar.map((n) => (
            <option key={n.penyulang} value={n.penyulang}>
              {n.kode} — {n.penyulang}
            </option>
          ))}
        </select>
      )}

      {ketik !== null ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={ketik}
            onChange={(e) => setKetik(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") pratinjauGanti();
              if (e.key === "Escape") setKetik(null);
            }}
            placeholder="Nama baru, mis. PRM-020"
            className={INPUT}
          />
          <button onClick={pratinjauGanti} className={TOMBOL_PANEL}>Pratinjau</button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setKetik(kode)} className={TOMBOL_PANEL}>
            <Tag size={13} /> Ganti nama (hilir ikut)
          </button>
          {t.induk_id && (
            <button
              onClick={() =>
                setBuka({
                  judul: `Jadikan ${kode} jalur utama`,
                  permintaan: { ...dasar, mulai: t.induk_id, utamaPaksa: t.id },
                  kosong: `${kode} sudah jalur utama dari ${t.induk ?? "induknya"} — tidak ada nama yang berubah.`,
                })
              }
              className={TOMBOL_PANEL}
            >
              <GitFork size={13} /> Jadikan jalur utama
            </button>
          )}
        </div>
      )}

      {buka && (
        <PratinjauNamaModal
          judul={buka.judul}
          subjudul={`Penyulang ${penyulang}`}
          permintaan={buka.permintaan}
          kosong={buka.kosong}
          aksiLain={
            buka.permintaan.namaMulai && (
              <button
                onClick={() => void hanyaIni(buka.permintaan.namaMulai!)}
                className={BTN_GHOST}
              >
                Hanya tiang ini
              </button>
            )
          }
          keterangan={
            <p className="text-sm text-ink-soft">
              {buka.permintaan.utamaPaksa
                ? "Saudara tiang ini menjadi cabang (lewat FCO). Nama di hilir kedua jalur ikut berubah."
                : "Tiang di hilirnya ikut berganti mengikuti nama baru ini."}
            </p>
          }
          oleh={oleh}
          onTutup={() => setBuka(null)}
          onSelesai={onBerubah}
        />
      )}
    </div>
  );
}
