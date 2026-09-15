"use client";

import { useMemo, useState } from "react";
import { GitBranch, Loader2, Search } from "lucide-react";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useTiangDaftar, type TiangBaris } from "../_hooks/useTiangDaftar";

/**
 * Tabel tiang JTM.
 *
 * Sampai sekarang tidak ada satu pun layar yang memperlihatkan tiang JTM, jadi
 * regu menitik sepanjang hari tanpa ada cara memeriksa hasilnya dari kantor.
 *
 * Kolom INDUK bisa diubah di sini, dan itu bukan kemewahan: bentuk jaringan
 * ditentukan saat regu menitik, dan sekali salah sambung seluruh cabang di
 * bawahnya ikut salah. Membetulkannya dari lapangan berarti mendatangi tiangnya
 * lagi.
 */

const PER_HALAMAN = 50;

const tanggal = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short" }) : null;

export default function DaftarTiang({ user }: { user: CurrentUser }) {
  const [penyulang, setPenyulang] = useState("");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);

  const { baris, penyulangList, loading, ubahInduk } = useTiangDaftar(
    canSeeAllUnits(user.role) ? null : (user.unit ?? null),
  );

  const tersaring = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return baris.filter(
      (b) =>
        (!penyulang || b.penyulang === penyulang) &&
        (!q ||
          b.kode.toUpperCase().includes(q) ||
          (b.nomorLama ?? "").toUpperCase().includes(q) ||
          (b.segmen ?? "").toUpperCase().includes(q)),
    );
  }, [baris, penyulang, cari]);

  const halamanMaks = Math.max(1, Math.ceil(tersaring.length / PER_HALAMAN));
  const kini = Math.min(halaman, halamanMaks);
  const tampil = tersaring.slice((kini - 1) * PER_HALAMAN, kini * PER_HALAMAN);

  /** Calon induk = tiang penyulang yang sama. Penjaga di database tetap yang
   *  menolak lingkaran; daftar ini cuma mencegah pilihan yang jelas keliru. */
  const calonInduk = useMemo(() => {
    const m = new Map<string, TiangBaris[]>();
    for (const b of baris) {
      const d = m.get(b.penyulang) ?? [];
      d.push(b);
      m.set(b.penyulang, d);
    }
    return m;
  }, [baris]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat tiang…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
            />
            <input
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setHalaman(1);
              }}
              placeholder="Cari kode, nomor lama, atau segmen"
              className={`${FIELD} pl-9 w-[280px]`}
            />
          </div>
          <select
            value={penyulang}
            onChange={(e) => {
              setPenyulang(e.target.value);
              setHalaman(1);
            }}
            className={`${FIELD} w-[200px]`}
          >
            <option value="">Semua penyulang</option>
            {penyulangList.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <span className="text-xs text-ink-muted ml-auto tabular-nums">
            {tersaring.length} tiang
          </span>
        </div>

        <p className="text-[11px] text-ink-muted mt-3 max-w-3xl">
          Kolom <b>Induk</b> menentukan bentuk jaringannya — ke mana garis ditarik, dan dari
          mana penomoran cabang dihitung. Mengubahnya di sini tercatat di jejak audit dan{" "}
          <b>tidak menamai ulang tiangnya</b>: kode yang sudah tertulis di lembar kerja dan
          disebut lewat radio tidak boleh berubah diam-diam.
        </p>
      </div>

      <div className={`${CARD} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-ink-soft">
                <th className="text-left font-semibold px-4 py-2.5">Kode</th>
                <th className="text-left font-semibold px-3 py-2.5">Penyulang</th>
                <th className="text-left font-semibold px-3 py-2.5">Induk</th>
                <th className="text-left font-semibold px-3 py-2.5">Segmen</th>
                <th className="text-left font-semibold px-3 py-2.5">Jenis</th>
                <th className="text-left font-semibold px-3 py-2.5">Keadaan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tampil.map((b) => (
                <tr key={b.id} className="hover:bg-surface/60">
                  <td className="px-4 py-2">
                    <span className="font-semibold text-ink">{b.kode}</span>
                    {b.jumlahAnak > 1 && (
                      <span
                        className="inline-flex items-center gap-0.5 text-[10px] text-navy-600 ml-1.5"
                        title={`${b.jumlahAnak} tiang menyambung ke sini`}
                      >
                        <GitBranch size={10} />
                        {b.jumlahAnak}
                      </span>
                    )}
                    {b.nomorLama && (
                      <span className="block text-[10px] text-ink-muted">
                        lama: {b.nomorLama}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-ink-soft text-xs">{b.penyulang}</td>
                  <td className="px-3 py-2">
                    <select
                      value={b.indukId ?? ""}
                      onChange={(e) =>
                        void ubahInduk(b.id, e.target.value || null, user.name || user.email)
                      }
                      className={`${FIELD} h-8 text-xs w-[150px]`}
                      aria-label={`Induk ${b.kode}`}
                    >
                      <option value="">— pangkal —</option>
                      {(calonInduk.get(b.penyulang) ?? [])
                        .filter((x) => x.id !== b.id)
                        .map((x) => (
                          <option key={x.id} value={x.id}>
                            {x.kode}
                          </option>
                        ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft max-w-[260px] truncate">
                    {b.segmen ?? <span className="text-ink-muted">belum masuk segmen</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-ink-soft">
                    {b.jenis ?? "—"}
                    {b.penanda && (
                      <span className="block text-[10px] text-navy-600">{b.penanda}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {b.dikonfirmasiAt ? (
                      <span className="text-green-700">terkonfirmasi</span>
                    ) : (
                      <span className="text-ink-muted">belum dikonfirmasi</span>
                    )}
                    {b.terakhirDinilai && (
                      <span className="block text-[10px] text-ink-muted">
                        dinilai {tanggal(b.terakhirDinilai)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {tampil.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-muted">
                    Tidak ada tiang yang cocok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {halamanMaks > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-line">
            <span className="text-xs text-ink-muted">
              Halaman {kini} dari {halamanMaks}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setHalaman((h) => Math.max(1, h - 1))}
                disabled={kini === 1}
                className="text-xs font-semibold text-navy-600 disabled:text-ink-muted px-2"
              >
                Sebelumnya
              </button>
              <button
                onClick={() => setHalaman((h) => Math.min(halamanMaks, h + 1))}
                disabled={kini === halamanMaks}
                className="text-xs font-semibold text-navy-600 disabled:text-ink-muted px-2"
              >
                Berikutnya
              </button>
            </div>
          </div>
        )}
      </div>

      <p className={`${EYEBROW} text-center`}>
        Tiang yang belum dikonfirmasi lapangan berasal dari impor Excel, bukan dari kunjungan.
      </p>
    </div>
  );
}
