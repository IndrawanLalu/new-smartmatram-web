"use client";

import { useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { CARD, FIELD, BTN_PRIMARY, BTN_GHOST, EYEBROW } from "@/app/admin/_ui";
import { useToast } from "@/app/admin/_components/Toast";
import type { KategoriRef } from "../_hooks/usePemeliharaanJaringan";

/**
 * Pengaturan kategori pemeliharaan.
 *
 * ── KODE TIDAK BISA DIUBAH, LABEL BISA ──────────────────────────────────────
 * Kode inilah yang tersimpan di tiap catatan pemeliharaan. Mengubahnya berarti
 * memutus catatan lama dari kategorinya — dan yang terputus tidak berteriak,
 * dia cuma muncul sebagai kategori kosong di rekap setahun kemudian.
 *
 * Jadi kode dikunci sesudah dibuat, dan yang disunting labelnya. Label boleh
 * berubah kapan saja: daftar web membacanya dari acuan, bukan menyalinnya,
 * sehingga catatan lama langsung ikut terbaca dengan nama barunya.
 *
 * ── DINONAKTIFKAN, BUKAN DIHAPUS ────────────────────────────────────────────
 * Kategori yang tidak dipakai lagi dimatikan — hilang dari daftar pilihan di
 * HP, tapi catatan lamanya tetap punya nama. Menghapusnya akan ditolak
 * database (ada FK), dan itu memang yang benar.
 */

const JENIS: KategoriRef["jenis"][] = ["SEMUA", "JTM", "JTR"];

const kodeDari = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);

interface Props {
  kategori: KategoriRef[];
  onSimpan: (k: KategoriRef, baru: boolean) => Promise<void>;
}

export default function PengaturanKategori({ kategori, onSimpan }: Props) {
  const toast = useToast();
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [draf, setDraf] = useState<Record<string, string>>({});
  const [tambah, setTambah] = useState(false);
  const [labelBaru, setLabelBaru] = useState("");
  const [jenisBaru, setJenisBaru] = useState<KategoriRef["jenis"]>("SEMUA");

  const simpan = async (k: KategoriRef, baru = false) => {
    setSibuk(k.kode);
    try {
      await onSimpan(k, baru);
      setDraf((p) => {
        const n = { ...p };
        delete n[k.kode];
        return n;
      });
      toast.success(baru ? `Kategori "${k.label}" ditambahkan.` : "Tersimpan.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSibuk(null);
    }
  };

  const tambahBaru = async () => {
    const label = labelBaru.trim();
    if (!label) return;
    const kode = kodeDari(label);
    if (!kode) {
      toast.error("Nama kategori harus mengandung huruf atau angka.");
      return;
    }
    if (kategori.some((k) => k.kode === kode)) {
      toast.error(`Kategori dengan kode "${kode}" sudah ada.`);
      return;
    }
    const urutan = Math.max(0, ...kategori.filter((k) => k.urutan < 900).map((k) => k.urutan)) + 10;
    await simpan({ kode, label, jenis: jenisBaru, urutan, aktif: true }, true);
    setLabelBaru("");
    setTambah(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Kategori pemeliharaan</p>
        <p className="text-xs text-ink-soft mt-1.5 max-w-3xl">
          Daftar ini yang muncul sebagai pilihan di HP. Berlaku seketika — tidak perlu OTA.
          Kategori <b>JTM</b> hanya muncul saat regu memilih JTM, <b>JTR</b> sebaliknya, dan{" "}
          <b>SEMUA</b> muncul di keduanya.
        </p>
        <p className="text-[11px] text-ink-muted mt-1.5 max-w-3xl">
          Kodenya terkunci sesudah dibuat — kode itulah yang tersimpan di tiap catatan, dan
          mengubahnya memutus catatan lama dari kategorinya. Yang tidak dipakai lagi{" "}
          <b>dinonaktifkan</b>, bukan dihapus, supaya catatan lamanya tetap punya nama.
        </p>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full border-collapse">
          <thead className="bg-surface">
            <tr>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line">
                Nama yang tampil di HP
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line w-[120px]">
                Berlaku di
              </th>
              <th className="px-4 py-2 text-left text-[11px] font-semibold text-ink-soft border-b border-line w-[150px]">
                Kode
              </th>
              <th className="px-4 py-2 text-center text-[11px] font-semibold text-ink-soft border-b border-line w-[110px]">
                Aktif
              </th>
              <th className="px-4 py-2 border-b border-line w-[100px]" />
            </tr>
          </thead>
          <tbody>
            {kategori.map((k) => {
              const label = draf[k.kode] ?? k.label;
              const berubah = label !== k.label;
              return (
                <tr key={k.kode} className={k.aktif ? "" : "bg-surface/60"}>
                  <td className="px-4 py-2 border-b border-line">
                    <input
                      value={label}
                      onChange={(e) => setDraf((p) => ({ ...p, [k.kode]: e.target.value }))}
                      onKeyDown={(e) =>
                        e.key === "Enter" && berubah && void simpan({ ...k, label })
                      }
                      className={`${FIELD} w-full`}
                      aria-label={`Nama kategori ${k.kode}`}
                    />
                  </td>
                  <td className="px-4 py-2 border-b border-line">
                    <select
                      value={k.jenis}
                      onChange={(e) =>
                        void simpan({ ...k, jenis: e.target.value as KategoriRef["jenis"] })
                      }
                      className={`${FIELD} w-full`}
                      aria-label={`Berlaku di ${k.kode}`}
                    >
                      {JENIS.map((j) => (
                        <option key={j} value={j}>{j}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-2 border-b border-line">
                    <span className="text-xs font-mono text-ink-muted">{k.kode}</span>
                  </td>
                  <td className="px-4 py-2 border-b border-line text-center">
                    <button
                      onClick={() => void simpan({ ...k, aktif: !k.aktif })}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                        k.aktif
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-gray-100 text-gray-500 border-gray-200"
                      }`}
                    >
                      {k.aktif ? "aktif" : "nonaktif"}
                    </button>
                  </td>
                  <td className="px-4 py-2 border-b border-line text-right">
                    {berubah && (
                      <button
                        onClick={() => void simpan({ ...k, label })}
                        disabled={sibuk === k.kode}
                        className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold bg-navy-600 text-white disabled:opacity-40"
                      >
                        {sibuk === k.kode ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Check size={12} />
                        )}
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
          {tambah ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={labelBaru}
                onChange={(e) => setLabelBaru(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void tambahBaru()}
                placeholder="Nama kategori baru"
                autoFocus
                className={`${FIELD} flex-1 min-w-[220px]`}
              />
              <select
                value={jenisBaru}
                onChange={(e) => setJenisBaru(e.target.value as KategoriRef["jenis"])}
                className={`${FIELD} w-[120px]`}
              >
                {JENIS.map((j) => (
                  <option key={j} value={j}>{j}</option>
                ))}
              </select>
              <button onClick={() => void tambahBaru()} className={BTN_PRIMARY} disabled={!labelBaru.trim()}>
                <Plus size={14} /> Tambah
              </button>
              <button onClick={() => setTambah(false)} className={BTN_GHOST}>
                <X size={14} /> Batal
              </button>
              {labelBaru.trim() && (
                <span className="text-[11px] text-ink-muted w-full">
                  kodenya nanti: <span className="font-mono">{kodeDari(labelBaru) || "—"}</span>
                </span>
              )}
            </div>
          ) : (
            <button onClick={() => setTambah(true)} className={BTN_GHOST}>
              <Plus size={14} /> Tambah kategori
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
