"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { CARD, FIELD, BTN_PRIMARY, BTN_GHOST, EYEBROW } from "@/app/admin/_ui";
import { useToast } from "@/app/admin/_components/Toast";
import type { AlasanRef } from "../_hooks/useOptimasiTrafo";

/**
 * Daftar alasan optimasi — sepola Pengaturan Kategori Pemeliharaan Jaringan.
 * Kode terkunci sesudah dibuat (tersimpan di tiap catatan); yang disunting
 * labelnya. Yang tidak dipakai dinonaktifkan, bukan dihapus.
 */

const kodeDari = (label: string) =>
  label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

interface Props {
  alasan: AlasanRef[];
  onSimpan: (a: AlasanRef, baru: boolean) => Promise<void>;
}

export default function PengaturanAlasan({ alasan, onSimpan }: Props) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [draf, setDraf] = useState<Record<string, string>>({});
  const [labelBaru, setLabelBaru] = useState<string | null>(null);

  const simpan = async (a: AlasanRef, baru = false) => {
    setSibuk(a.kode);
    try {
      await onSimpan(a, baru);
      setDraf((p) => {
        const sisa = { ...p };
        delete sisa[a.kode];
        return sisa;
      });
      toast.success(baru ? `Alasan "${a.label}" ditambahkan.` : "Tersimpan.");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan.");
      return false;
    } finally {
      setSibuk(null);
    }
  };

  const tambah = async () => {
    const label = (labelBaru ?? "").trim();
    const kode = kodeDari(label);
    if (!kode) return toast.error("Nama alasan harus mengandung huruf atau angka.");
    if (alasan.some((a) => a.kode === kode)) return toast.error(`Alasan dengan kode "${kode}" sudah ada.`);
    const urutan = Math.max(0, ...alasan.filter((a) => a.urutan < 900).map((a) => a.urutan)) + 10;
    if (await simpan({ kode, label, urutan, aktif: true }, true)) setLabelBaru(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Alasan optimasi</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-3xl">
          Daftar ini yang muncul sebagai pilihan di HP. Berlaku seketika — tidak perlu OTA. Kodenya
          terkunci sesudah dibuat; yang tidak dipakai lagi <b>dinonaktifkan</b>, bukan dihapus,
          supaya catatan lamanya tetap punya nama.
        </p>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full border-collapse">
          <thead className="bg-surface">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line">Nama yang tampil di HP</th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line w-[150px]">Kode</th>
              <th className="px-4 py-2 text-center text-[11px] font-semibold text-ink-soft border-b border-line w-[110px]">Aktif</th>
              <th className="px-4 py-2 border-b border-line w-[100px]" />
            </tr>
          </thead>
          <tbody>
            {alasan.map((a) => {
              const label = draf[a.kode] ?? a.label;
              const berubah = label !== a.label;
              return (
                <tr key={a.kode} className={a.aktif ? "" : "bg-surface/60"}>
                  <td className="px-4 py-2 border-b border-line">
                    <input
                      value={label}
                      onChange={(e) => setDraf((p) => ({ ...p, [a.kode]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && berubah && void simpan({ ...a, label })}
                      className={`${FIELD} w-full`}
                      aria-label={`Nama alasan ${a.kode}`}
                    />
                  </td>
                  <td className="px-4 py-2 border-b border-line">
                    <span className="text-xs font-mono text-ink-muted">{a.kode}</span>
                  </td>
                  <td className="px-4 py-2 border-b border-line text-center">
                    <button
                      onClick={() => void simpan({ ...a, aktif: !a.aktif })}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                        a.aktif ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                    >
                      {a.aktif ? "aktif" : "nonaktif"}
                    </button>
                  </td>
                  <td className="px-4 py-2 border-b border-line text-right">
                    {berubah && (
                      <button
                        onClick={() => void simpan({ ...a, label })}
                        disabled={sibuk === a.kode}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold bg-navy-600 text-white disabled:opacity-40"
                      >
                        {sibuk === a.kode ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        Simpan
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="p-4 border-t border-line bg-surface/40">
          {labelBaru === null ? (
            <button onClick={() => setLabelBaru("")} className={BTN_GHOST}>
              <Plus size={14} /> Tambah alasan
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={labelBaru}
                onChange={(e) => setLabelBaru(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void tambah()}
                placeholder="Nama alasan baru"
                autoFocus
                className={`${FIELD} flex-1 min-w-[220px]`}
              />
              <button onClick={() => void tambah()} className={BTN_PRIMARY} disabled={!labelBaru.trim()}>
                <Plus size={14} /> Tambah
              </button>
              <button onClick={() => setLabelBaru(null)} className={BTN_GHOST}>
                <X size={14} /> Batal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
