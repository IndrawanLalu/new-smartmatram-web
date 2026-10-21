"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { JurusanJtr } from "../_hooks/useAnalisisJtr";
import { susunDasar, TUJUAN_WO, type PekerjaanUsulan, type SimpanUsulan } from "../_hooks/useUsulanJtr";
import { materialAwal, type BarisMaterial, type MaterialRef } from "../_lib/materialJtr";
import { LABEL_RENCANA, ringkasOpsi, rinciOpsi, type OpsiPecah, type Rencana } from "../_lib/rencanaJtr";
import TabelMaterial from "@/app/admin/_components/TabelMaterial";

/**
 * Simpan rencana sebagai USULAN: angka dibekukan, material diperkirakan dari
 * daftar bawaan lalu diperiksa user. Titik pecah terpilih ikut tersimpan —
 * memilih pecah di rencana "sisip" berarti user memilih tambah jurusan.
 */

interface Props {
  r: JurusanJtr;
  rencana: Rencana;
  opsi: OpsiPecah | null;
  materialRef: MaterialRef[];
  onSimpan: (u: SimpanUsulan) => Promise<void>;
  onKembali: () => void;
  onTutup: () => void;
}

export default function FormUsulanJtr({ r, rencana, opsi, materialRef, onSimpan, onKembali, onTutup }: Props) {
  const toast = useToast();
  const pekerjaan = (opsi ? "tambah-jurusan" : rencana.jenis) as PekerjaanUsulan;
  const ringkas = opsi ? ringkasOpsi(opsi) : rencana.ringkas;
  const rinci = opsi ? rinciOpsi(opsi, Number(r.jumlah_sr ?? 0)) : rencana.rinci;
  const [material, setMaterial] = useState<BarisMaterial[]>(() => materialAwal(materialRef, r, rencana, opsi));
  const [catatan, setCatatan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  const simpan = async () => {
    if (material.some((x) => !x.nama.trim())) {
      toast.error("Nama material tidak boleh kosong — hapus barisnya bila tidak dipakai.");
      return;
    }
    setSibuk(true);
    try {
      await onSimpan({
        gardu_kode: r.gardu_kode,
        jurusan: r.jurusan,
        penyulang: r.penyulang,
        pekerjaan,
        ringkas,
        dasar: susunDasar(r, rencana.alasan, rinci),
        opsi,
        titik_tiang_id: opsi?.titikId ?? rencana.titik?.[0]?.tiang_id ?? null,
        material: material.map((x) => ({ ...x, nama: x.nama.trim() })),
        catatan,
      });
      toast.success("Usulan tersimpan.");
    } catch (e) {
      toast.error((e as Error).message);
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title={`Simpan usulan — ${r.gardu_kode} jurusan ${r.jurusan}`}
      subtitle={LABEL_RENCANA[pekerjaan]}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-between gap-2">
          <button onClick={onKembali} className={BTN_GHOST}><ArrowLeft size={14} /> Kembali</button>
          <button onClick={() => void simpan()} disabled={sibuk} className={BTN_PRIMARY}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan usulan
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-base font-semibold text-ink">{ringkas}</p>
          <ul className="list-disc pl-5 mt-1.5 space-y-0.5 text-sm text-ink-soft">
            {rinci.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </div>
        <TabelMaterial isi={material} onUbah={setMaterial} />
        {pekerjaan !== "sisip" && pekerjaan !== "naik-daya" && (
          <p className="text-xs text-ink-muted">Jumlah dihitung dari daftar material bawaan di Pengaturan — perkiraan, bukan hasil survei.</p>
        )}
        <label className="block space-y-1.5">
          <span className={EYEBROW}>Catatan</span>
          <textarea
            value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2}
            placeholder="mis. perlu pemadaman, akses jalan, koordinasi warga"
            className={`${FIELD} w-full h-auto py-2`}
          />
        </label>
        <p className="text-xs text-ink-soft border-t border-line pt-3">
          Sesudah disimpan, usulan ada di daftar <b>Usulan</b>. Jadikan WO → {TUJUAN_WO[pekerjaan]}.
        </p>
      </div>
    </ModalShell>
  );
}
