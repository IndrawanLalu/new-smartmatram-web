"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, PlusCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { WoItem, WoRingkas } from "../_hooks/useWoPerabasan";
import { statusTampil } from "../_hooks/useDaftarPerabasan";
import { NADA_STATUS, tanggal } from "../_lib/tampilan";

/**
 * Isi & ubah satu WO perabasan. Yang bisa diubah di sini: nama, target, dan
 * tanggal WO (selama masih Terbit). Isi segmennya lewat jalan yang sudah ada:
 * "Tambah segmen" membuka Susun WO pada WO ini; mengeluarkan satu segmen dari
 * modal segmen di Daftar Segmen — keduanya menjaga aturannya sendiri.
 */

const kms = (v: number | null | undefined) => (v === null || v === undefined ? "—" : Number(v).toFixed(2).replace(".", ","));

interface Props {
  w: WoRingkas;
  bolehUbah: boolean;
  ambilItem: (woId: string) => Promise<WoItem[]>;
  onUbah: (v: { woId: string; nama: string; targetKm: number; tglWo: string }) => Promise<boolean>;
  onTambahSegmen: () => void;
  onTutup: () => void;
}

export default function DetailWoModal({ w, bolehUbah, ambilItem, onUbah, onTambahSegmen, onTutup }: Props) {
  const [item, setItem] = useState<WoItem[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [nama, setNama] = useState(w.nama);
  const [target, setTarget] = useState(String(w.target_km).replace(".", ","));
  const [tgl, setTgl] = useState(w.tgl_wo);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    ambilItem(w.wo_id).then(
      (r) => { if (hidup) setItem(r); },
      (e: Error) => { if (hidup) setGalat(e.message); },
    );
    return () => { hidup = false; };
  }, [w.wo_id, ambilItem]);

  const terbit = w.status === "Terbit";
  const bisa = bolehUbah && terbit;
  const targetNum = Number(target.replace(",", "."));
  const berubah = nama.trim() !== w.nama || targetNum !== Number(w.target_km) || tgl !== w.tgl_wo;
  const sah = nama.trim().length > 2 && targetNum > 0 && !!tgl;

  const simpan = async () => {
    setSibuk(true);
    await onUbah({ woId: w.wo_id, nama: nama.trim(), targetKm: targetNum, tglWo: tgl });
    setSibuk(false);
  };

  const footer = (
    <>
      {bisa ? (
        <button onClick={onTambahSegmen} className={BTN_GHOST}>
          <PlusCircle size={14} /> Tambah segmen ke WO ini
        </button>
      ) : <span />}
      {bisa ? (
        <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={!berubah || !sah || sibuk}>
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan perubahan
        </button>
      ) : (
        <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
      )}
    </>
  );

  return (
    <ModalShell
      title={`WO · ${w.nama}`}
      subtitle={`${w.ulp} · ${tanggal(w.tgl_wo)} · ${w.status}`}
      maxWidth="max-w-4xl"
      onClose={onTutup}
      footer={footer}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><p className="text-[11px] text-ink-muted">Target</p><p className="font-semibold tabular-nums">KMS {kms(w.target_km)}</p></div>
        <div><p className="text-[11px] text-ink-muted">Rencana (isi WO)</p><p className="font-semibold tabular-nums">KMS {kms(w.rencana_km)}</p></div>
        <div><p className="text-[11px] text-ink-muted">Capaian</p><p className="font-semibold tabular-nums text-emerald-700">KMS {kms(w.capaian_km)}{w.capaian_persen !== null ? ` · ${w.capaian_persen}%` : ""}</p></div>
        <div><p className="text-[11px] text-ink-muted">Pohon dirabas</p><p className="font-semibold tabular-nums">{w.pohon_dirabas}</p></div>
      </div>

      {bisa ? (
        <div>
          <p className={`${EYEBROW} mb-1.5`}>Ubah WO</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-ink-soft">
              Nama WO
              <input value={nama} onChange={(e) => setNama(e.target.value)} className={`${FIELD} mt-1 block w-[260px]`} />
            </label>
            <label className="text-xs text-ink-soft">
              Target (KMS)
              <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" className={`${FIELD} mt-1 block w-[110px] text-right tabular-nums`} />
            </label>
            <label className="text-xs text-ink-soft">
              Tanggal WO
              <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} className={`${FIELD} mt-1 block w-[160px]`} />
            </label>
          </div>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">
          {terbit ? "Hanya UP3 atau admin ULP ini yang bisa mengubah WO." : `WO ini sudah ${w.status.toLowerCase()} — hanya bisa dilihat.`}
        </p>
      )}

      <div>
        <p className={`${EYEBROW} mb-1.5`}>Segmen dalam WO{item ? ` · ${item.length}` : ""}</p>
        {galat ? (
          <p className="text-xs text-amber-700">Segmen gagal dimuat: {galat}</p>
        ) : item === null ? (
          <p className="text-xs text-ink-muted flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Memuat…</p>
        ) : (
          <div className="rounded-xl border border-line overflow-hidden">
            <table className="w-full border-collapse text-xs">
              <thead className="bg-surface">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-ink-soft border-b border-line">Regu</th>
                  <th className="px-3 py-2 text-left font-semibold text-ink-soft border-b border-line">Penyulang</th>
                  <th className="px-3 py-2 text-left font-semibold text-ink-soft border-b border-line">Segmen</th>
                  <th className="px-3 py-2 text-right font-semibold text-ink-soft border-b border-line">KMS</th>
                  <th className="px-3 py-2 text-left font-semibold text-ink-soft border-b border-line">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...item]
                  .sort((a, b) => (a.regu ?? "").localeCompare(b.regu ?? "") || a.penyulang.localeCompare(b.penyulang))
                  .map((x) => {
                    const st = statusTampil(x.status, x.regu);
                    return (
                      <tr key={x.id} className="border-b border-line last:border-0">
                        <td className={`px-3 py-2 ${x.regu ? "text-ink-soft" : "text-red-700 font-semibold"}`}>{x.regu ?? "belum dibagi"}</td>
                        <td className="px-3 py-2 text-ink-soft">{x.penyulang}</td>
                        <td className="px-3 py-2 text-ink">{x.segmen_nama}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{kms(x.panjang_km)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_STATUS[st]}`}>{st}</span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
