"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import type { JurusanJtr, PengaturanJtr } from "../_hooks/useAnalisisJtr";
import { susunDasar, type UbahPecah, type UsulanJtr } from "../_hooks/useUsulanJtr";
import { materialAwal, type BarisMaterial, type MaterialRef } from "../_lib/materialJtr";
import { namaOpsi, ringkasOpsi, rinciOpsi, type GawangJtr, type OpsiPecah, type Rencana } from "../_lib/rencanaJtr";
import PilihanPecah from "./PilihanPecah";
import TabelMaterial from "./TabelMaterial";

/**
 * Ganti titik pecah usulan yang belum di-WO-kan (salah klik tiang / berubah
 * pikiran). Angka dihitung dari analisis SAAT INI, material diperkirakan
 * ulang dari daftar bawaan — material lama ditampilkan sebagai pembanding.
 */

/** Bahan hitung titik pecah satu jurusan, dari tab Analisis. */
export interface BahanPecah {
  r: JurusanJtr;
  rencana: Rencana | null;
  gawang: GawangJtr[];
  pengaturan: PengaturanJtr;
}

interface Props {
  u: UsulanJtr;
  bahan: BahanPecah;
  materialRef: MaterialRef[];
  onSimpan: (isi: UbahPecah) => Promise<void>;
  onKembali: () => void;
}

export default function UbahPecahUsulan({ u, bahan, materialRef, onSimpan, onKembali }: Props) {
  const toast = useToast();
  const { r, rencana } = bahan;
  const [opsi, setOpsi] = useState<OpsiPecah | null>(null);
  const [material, setMaterial] = useState<BarisMaterial[]>([]);
  const [sibuk, setSibuk] = useState(false);

  const pilih = (o: OpsiPecah) => {
    setOpsi(o);
    setMaterial(materialAwal(materialRef, r, rencana, o));
  };

  const simpan = async () => {
    if (!opsi) return;
    if (material.some((x) => !x.nama.trim())) {
      toast.error("Nama material tidak boleh kosong — hapus barisnya bila tidak dipakai.");
      return;
    }
    setSibuk(true);
    try {
      await onSimpan({
        ringkas: ringkasOpsi(opsi),
        dasar: susunDasar(r, rencana?.alasan ?? u.dasar.alasan, rinciOpsi(opsi, opsi.srTotal ?? Number(r.jumlah_sr ?? 0))),
        opsi,
        titik_tiang_id: opsi.titikId,
        material: material.map((x) => ({ ...x, nama: x.nama.trim() })),
        catatan: u.catatan ?? "",
      });
      toast.success("Titik pecah diperbarui.");
      onKembali();
    } catch (e) {
      toast.error((e as Error).message);
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title={`Ubah titik pecah — ${u.gardu_kode} jurusan ${u.jurusan}`}
      subtitle={`Sekarang: ${u.opsi ? namaOpsi(u.opsi) : u.ringkas}`}
      maxWidth="max-w-5xl"
      onClose={onKembali}
      footer={
        <div className="flex justify-between gap-2">
          <button onClick={onKembali} className={BTN_GHOST}><ArrowLeft size={14} /> Kembali</button>
          <button onClick={() => void simpan()} disabled={!opsi || sibuk} className={BTN_PRIMARY}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan titik pecah baru
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-ink-soft">
          Angka dihitung dari pengukuran terakhir ({r.tanggal_pengukuran ?? "—"}) dan JTR saat ini. Sesudah disimpan, angka dasar, titik
          lokasi, gambar survey dan material usulan ikut berganti.
        </p>
        <PilihanPecah r={r} gawang={bahan.gawang} pengaturan={bahan.pengaturan} pilihan={rencana?.pilihan ?? []} terpilih={opsi?.kunci ?? ""} onPilih={pilih} />
        {opsi && (
          <div className="grid md:grid-cols-2 gap-4">
            <TabelMaterial isi={material} onUbah={setMaterial} judul="Material baru — perkiraan, periksa dan sesuaikan" />
            <TabelMaterial isi={u.material} judul="Material lama (pembanding)" />
          </div>
        )}
      </div>
    </ModalShell>
  );
}
