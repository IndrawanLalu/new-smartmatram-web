"use client";

import { useMemo, useState } from "react";
import { GitBranch, ListOrdered, Loader2, Pencil, Search } from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import ModalShell from "@/app/admin/_components/ModalShell";
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
  const semuaUnit = canSeeAllUnits(user.role);
  const [ulp, setUlp] = useState("");
  const [penyulang, setPenyulang] = useState("");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [nomorUlang, setNomorUlang] = useState(false);

  // UP3 memilih ULP di layar; peran lain terkunci di unitnya dan tidak pernah
  // melihat saringan ini sama sekali.
  // `namaDi` tidak dipakai di sini: dropdown induk sudah menyebut nama versi
  // penyulangnya sendiri lewat `namaPerPenyulang`.
  const { baris, penyulangList, namaPerPenyulang, loading, ubahInduk, ubahKode, nomoriUlang } =
    useTiangDaftar(
    semuaUnit ? (ulp || null) : (user.unit ?? null),
  );
  const oleh = user.name || user.email;

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

  /** Batang menurut id — dipakai menyebut nama asli tiang milik penyulang lain
   *  di daftar calon induk. */
  const perId = useMemo(
    () => new Map(baris.map((b) => [b.id, { kode: b.kode, penyulang: b.penyulang }])),
    [baris],
  );

  const halamanMaks = Math.max(1, Math.ceil(tersaring.length / PER_HALAMAN));
  const kini = Math.min(halaman, halamanMaks);
  const tampil = tersaring.slice((kini - 1) * PER_HALAMAN, kini * PER_HALAMAN);

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
          {semuaUnit && (
            <select
              value={ulp}
              onChange={(e) => {
                setUlp(e.target.value);
                setPenyulang("");
                setHalaman(1);
              }}
              className={`${FIELD} w-[170px]`}
              aria-label="Saring ULP"
            >
              <option value="">Semua ULP</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          )}
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
          {penyulang && (
            <button onClick={() => setNomorUlang(true)} className={BTN_GHOST}>
              <ListOrdered size={15} /> Nomori ulang
            </button>
          )}
        </div>

        <p className="text-[11px] text-ink-muted mt-3 max-w-3xl">
          Tiang yang dipikul dua penyulang punya <b>nama di masing-masing penyulang</b> —
          satu batang beton, dua nama, dan keduanya benar. Jumlah tiang tetap dihitung dari
          batangnya, bukan dari berapa nama yang dia punya.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
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
                    <NamaTiang b={b} oleh={oleh} onSimpan={ubahKode} />
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
                      {/* Calon induk = tiang yang DILEWATI penyulang ini, bukan
                          yang dimiliki. Penyulang yang berpangkal pada batang
                          milik orang harus bisa menunjuk batang itu.
                          Batang milik penyulang lain disebut DUA-DUANYA —
                          nama versi penyulang ini dan nama aslinya — karena
                          nama versi penyulang ini bisa saja nomor sementara
                          yang belum pernah dilihat siapa pun di lapangan. */}
                      {(namaPerPenyulang.get(b.penyulang) ?? [])
                        .filter((x) => x.tiangId !== b.id)
                        .map((x) => {
                          const batang = perId.get(x.tiangId);
                          const asing = batang && batang.kode !== x.kode;
                          return (
                            <option key={x.tiangId} value={x.tiangId}>
                              {x.kode}
                              {asing ? `  ·  ${batang.kode} (${batang.penyulang})` : ""}
                            </option>
                          );
                        })}
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

      {nomorUlang && (
        <ModalShell
          title={`Nomori ulang ${penyulang}`}
          subtitle="Penomoran mengikuti rute, bukan urutan pencatatan"
          maxWidth="max-w-lg"
          onClose={() => setNomorUlang(false)}
        >
          <div className="p-5 space-y-3">
            <p className="text-sm text-ink-soft">
              Seluruh tiang <b>{penyulang}</b> dinomori ulang menurut rutenya — dimulai dari
              tiang paling hulu, walaupun batangnya milik penyulang lain.
            </p>
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <b>Nama tiang yang sudah tercatat akan berganti.</b> Aman selama nama itu belum
              terpasang sebagai papan nomor dan belum pernah disebut di laporan gangguan.
              Sesudah itu, jangan dipakai lagi. Tiap tiang tercatat di jejak audit.
            </p>
            <p className="text-xs text-ink-muted">
              Betulkan dulu kolom <b>Induk</b> kalau ada yang salah sambung — urutan nomor
              mengikuti pohon induk, bukan urutan pencatatan.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setNomorUlang(false)} className={BTN_GHOST}>
                Batal
              </button>
              <button
                onClick={async () => {
                  const u = semuaUnit ? ulp : (user.unit ?? "");
                  if (!u) return;
                  await nomoriUlang(penyulang, u, oleh);
                  setNomorUlang(false);
                }}
                disabled={semuaUnit && !ulp}
                className="inline-flex items-center justify-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold bg-amber-600 text-white hover:bg-amber-500 disabled:opacity-40 transition-colors"
              >
                <ListOrdered size={15} /> Nomori ulang
              </button>
            </div>
            {semuaUnit && !ulp && (
              <p className="text-xs text-amber-700">Pilih ULP dulu — penomoran per unit.</p>
            )}
          </div>
        </ModalShell>
      )}

      <p className={`${EYEBROW} text-center`}>
        Tiang yang belum dikonfirmasi lapangan berasal dari impor Excel, bukan dari kunjungan.
      </p>
    </div>
  );
}

/** Nama tiang di kolom pertama.
 *
 *  Menampilkan SEMUA namanya — 'GNN-001 / PRM-001' — karena tabel ini tidak
 *  punya konteks penyulang, dan menyebut salah satu saja berarti menebak. Yang
 *  bisa diganti adalah nama di penyulang pemiliknya; nama di penyulang lain
 *  diganti dari daftar penyulang itu sendiri. */
function NamaTiang({
  b,
  oleh,
  onSimpan,
}: {
  b: TiangBaris;
  oleh: string;
  onSimpan: (tiangId: string, penyulang: string, kode: string, oleh: string) => Promise<boolean>;
}) {
  const [ubah, setUbah] = useState(false);
  const [nilai, setNilai] = useState(b.kode);

  if (ubah) {
    return (
      <input
        autoFocus
        value={nilai}
        onChange={(e) => setNilai(e.target.value)}
        onBlur={async () => {
          if (nilai.trim() && nilai.trim().toUpperCase() !== b.kode.toUpperCase()) {
            await onSimpan(b.id, b.penyulang, nilai.trim(), oleh);
          }
          setUbah(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setNilai(b.kode);
            setUbah(false);
          }
        }}
        className={`${FIELD} h-8 text-xs w-[140px] font-semibold`}
        aria-label={`Ganti nama ${b.kode}`}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setNilai(b.kode);
        setUbah(true);
      }}
      className="group inline-flex items-center gap-1 text-left"
      title="Ketuk untuk mengganti nama"
    >
      <span className="font-semibold text-ink">{b.semuaKode}</span>
      <Pencil
        size={11}
        className="text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      />
    </button>
  );
}
