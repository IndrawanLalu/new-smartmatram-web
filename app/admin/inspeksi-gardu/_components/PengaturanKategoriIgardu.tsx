"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Save } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { KategoriIgardu } from "../_hooks/useInspeksiGardu";

/**
 * Kategori temuan Inspeksi Gardu. Tiap kategori menunjuk SATU item
 * Pemeliharaan Gardu — dari situ temuan masuk Perlu Perbaikan dan bisa
 * dijadikan WO. Kode tetap; tidak ada hapus, nonaktifkan saja.
 */

interface Props {
  kategori: KategoriIgardu[];
  bolehUbah: boolean;
  oleh: string;
  onSimpan: (k: KategoriIgardu, oleh: string) => Promise<void>;
}

const KOSONG: KategoriIgardu = { kode: "", label: "", itemKode: "", urutan: 100, aktif: true };

export default function PengaturanKategoriIgardu({ kategori, bolehUbah, oleh, onSimpan }: Props) {
  const toast = useToast();
  const [item, setItem] = useState<{ kode: string; nama: string; kelompok: string }[]>([]);
  const [sunting, setSunting] = useState<{ k: KategoriIgardu; baru: boolean } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser.from("hargardu_item_ref").select("kode,nama,kelompok").order("urutan").order("kode")
      .then(({ data }) => { if (hidup) setItem((data ?? []) as { kode: string; nama: string; kelompok: string }[]); });
    return () => { hidup = false; };
  }, []);

  const namaItem = (kode: string) => item.find((i) => i.kode === kode)?.nama ?? kode;
  const dipakai = new Map(kategori.map((k) => [k.itemKode, k.kode]));

  const simpan = async () => {
    if (!sunting) return;
    setSibuk(true);
    try {
      await onSimpan({ ...sunting.k, kode: sunting.k.kode.trim().toLowerCase(), label: sunting.k.label.trim() }, oleh);
      toast.success("Kategori tersimpan.");
      setSunting(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className={`${CARD} p-5 flex flex-col gap-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={EYEBROW}>Kategori temuan</p>
          <p className="text-xs text-ink-soft mt-1 max-w-2xl">
            Pilihan kategori yang muncul di HP. Setiap kategori menunjuk satu item Pemeliharaan Gardu — temuan masuk
            Perlu Perbaikan sebagai item itu, dan hilang sendiri begitu pemeliharaan berikutnya mencatatnya normal.
          </p>
        </div>
        {bolehUbah && (
          <button onClick={() => setSunting({ k: KOSONG, baru: true })} className={BTN_GHOST}><Plus size={14} /> Tambah kategori</button>
        )}
      </div>

      <table className="w-full border-collapse text-sm">
        <thead className="kepala-kit bg-surface">
          <tr className="text-left text-[11px] text-ink-soft">
            <th className="px-3 py-2 border-b border-line">Urutan</th><th className="px-3 py-2 border-b border-line">Kategori</th>
            <th className="px-3 py-2 border-b border-line">Item pemeliharaan</th><th className="px-3 py-2 border-b border-line">Status</th>
            <th className="px-3 py-2 border-b border-line" />
          </tr>
        </thead>
        <tbody>
          {kategori.map((k) => (
            <tr key={k.kode} className={k.aktif ? "" : "opacity-50"}>
              <td className="px-3 py-2 border-b border-line text-xs tabular-nums">{k.urutan}</td>
              <td className="px-3 py-2 border-b border-line"><b className="text-ink">{k.label}</b><span className="ml-1.5 text-[11px] text-ink-muted font-mono">{k.kode}</span></td>
              <td className="px-3 py-2 border-b border-line text-xs text-ink-soft">{namaItem(k.itemKode)}</td>
              <td className="px-3 py-2 border-b border-line text-xs">{k.aktif ? "Aktif" : "Nonaktif"}</td>
              <td className="px-3 py-2 border-b border-line text-right">
                {bolehUbah && <button onClick={() => setSunting({ k, baru: false })} className="text-[11px] font-semibold text-navy-600 hover:underline">Ubah</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sunting && (
        <div className="rounded-xl border border-navy-200 bg-navy-50/40 p-4 flex flex-wrap items-end gap-3">
          <label>
            <span className={EYEBROW}>Kode</span>
            <input value={sunting.k.kode} disabled={!sunting.baru} onChange={(e) => setSunting({ ...sunting, k: { ...sunting.k, kode: e.target.value } })}
              placeholder="mis. kabel_inlet" className={`${FIELD} mt-1 block w-[160px] font-mono disabled:opacity-60`} />
          </label>
          <label>
            <span className={EYEBROW}>Nama di HP</span>
            <input value={sunting.k.label} onChange={(e) => setSunting({ ...sunting, k: { ...sunting.k, label: e.target.value } })}
              className={`${FIELD} mt-1 block w-[240px]`} />
          </label>
          <label>
            <span className={EYEBROW}>Item pemeliharaan</span>
            <select value={sunting.k.itemKode} onChange={(e) => setSunting({ ...sunting, k: { ...sunting.k, itemKode: e.target.value } })}
              className={`${FIELD} mt-1 block w-[240px]`}>
              <option value="">— pilih —</option>
              {item.map((i) => {
                const lain = dipakai.get(i.kode);
                return (
                  <option key={i.kode} value={i.kode} disabled={!!lain && lain !== sunting.k.kode}>
                    {i.kelompok} · {i.nama}{lain && lain !== sunting.k.kode ? " (sudah dipakai)" : ""}
                  </option>
                );
              })}
            </select>
          </label>
          <label>
            <span className={EYEBROW}>Urutan</span>
            <input value={sunting.k.urutan} inputMode="numeric"
              onChange={(e) => setSunting({ ...sunting, k: { ...sunting.k, urutan: Number(e.target.value.replace(/\D/g, "")) || 0 } })}
              className={`${FIELD} mt-1 block w-[90px] text-right`} />
          </label>
          <label className="flex items-center gap-2 text-xs pb-2">
            <input type="checkbox" checked={sunting.k.aktif} className="accent-navy-600"
              onChange={(e) => setSunting({ ...sunting, k: { ...sunting.k, aktif: e.target.checked } })} /> Aktif
          </label>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => setSunting(null)} className={BTN_GHOST} disabled={sibuk}>Batal</button>
            <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk || !sunting.k.kode.trim() || !sunting.k.label.trim() || !sunting.k.itemKode}>
              {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
