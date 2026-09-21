"use client";

import { useMemo, useState } from "react";
import { Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";
import { BTN_GHOST, BTN_PRIMARY, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { UNITS, type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import { usePenyulangRef, type HasilPrefiks, type PenyulangBaris } from "../_hooks/usePenyulangRef";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Master penyulang JTM.
 *
 * Dua hal yang diurus di sini, dan yang kedua jauh lebih berat akibatnya:
 *
 *   1. DAFTAR PENYULANG per ULP — inilah yang muncul di HP saat regu merintis
 *      segmen baru. Penyulang yang tidak ada di sini tidak bisa dirintis, dan
 *      tidak ada pesan yang menerangkan kenapa.
 *
 *   2. PREFIKS NAMA TIANG. Mengubahnya menomori ulang SELURUH tiang penyulang
 *      itu — nama yang sudah dipegang regu di lapangan ikut berubah. Karena itu
 *      jumlah tiang yang terpengaruh ditampilkan sebelum tombolnya ditekan,
 *      bukan sesudahnya.
 */

export default function PengaturanPenyulang({ user }: { user: CurrentUser }) {
  const { baris, daftarUlp, loading, simpan, hapus } = usePenyulangRef();
  const bolehSemua = canSeeAllUnits(user.role);
  const [saring, setSaring] = useState<string>(bolehSemua ? "" : (user.unit ?? ""));

  const tampil = useMemo(
    () => baris.filter((b) => !saring || (b.ulp ?? "—") === saring),
    [baris, saring],
  );

  const belumBerprefiks = tampil.filter((b) => !b.kode_singkat).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat master penyulang…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Master penyulang</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Daftar ini yang muncul di HP petugas saat merintis segmen baru — penyulang yang tidak
          terdaftar di sini <b>tidak bisa dirintis</b>, dan aplikasi tidak menerangkan kenapa.
          Pastikan tiap ULP sudah lengkap.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
          <b>Prefiks</b> adalah awalan nama tiang JTM: penyulang MATARAM berprefiks{" "}
          <span className="font-mono">MTR</span> menghasilkan tiang{" "}
          <span className="font-mono">MTR-001</span>. Dibuat sistem sendiri saat tiang pertama
          dinamai, dan boleh Anda betulkan di sini.
        </p>
        <p className="text-[11px] text-amber-700 mt-2 max-w-3xl">
          Mengganti prefiks <b>menomori ulang seluruh tiang penyulang itu seketika</b> — termasuk
          nama yang sudah dicatat regu di lapangan. Jumlah tiang yang terpengaruh tertulis di tiap
          baris; periksa dulu sebelum menggantinya.
        </p>
      </div>

      <div className={`${CARD} p-5`}>
        <div className="flex flex-wrap items-center gap-2">
          {bolehSemua && (
            <>
              <button
                onClick={() => setSaring("")}
                className={`${CHIP} ${saring === "" ? CHIP_ON : CHIP_OFF}`}
              >
                Semua ULP
              </button>
              {daftarUlp.map((u) => (
                <button
                  key={u}
                  onClick={() => setSaring(u)}
                  className={`${CHIP} ${saring === u ? CHIP_ON : CHIP_OFF}`}
                >
                  {u}
                </button>
              ))}
            </>
          )}
          <span className="text-[11px] text-ink-muted ml-auto">
            {tampil.length} penyulang
            {belumBerprefiks > 0 && ` · ${belumBerprefiks} belum berprefiks`}
          </span>
        </div>
      </div>

      <Tambah
        ulpAwal={saring || user.unit || ""}
        bolehSemua={bolehSemua}
        onSimpan={(v) => simpan({ ...v, oleh: user.name ?? user.email })}
      />

      <div className={`${CARD} p-5`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-ink-soft border-b border-line bg-surface">
                {["Penyulang", "ULP", "Prefiks", "Tiang", "Nama di penyulang ini", "Segmen", ""].map(
                  (h) => (
                    <th key={h} className="px-3 py-2.5 font-semibold">
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {tampil.map((b) => (
                <Baris
                  key={b.penyulang}
                  b={b}
                  onSimpan={simpan}
                  onHapus={hapus}
                  oleh={user.name ?? user.email}
                />
              ))}
              {tampil.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-ink-muted text-xs">
                    Belum ada penyulang di sini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Tambah({
  ulpAwal,
  bolehSemua,
  onSimpan,
}: {
  ulpAwal: string;
  bolehSemua: boolean;
  onSimpan: (v: { penyulang: string; ulp: string }) => Promise<unknown>;
}) {
  const [nama, setNama] = useState("");
  const [ulp, setUlp] = useState(ulpAwal);
  const [sibuk, setSibuk] = useState(false);

  const kirim = async () => {
    setSibuk(true);
    await onSimpan({ penyulang: nama.trim(), ulp });
    setSibuk(false);
    setNama("");
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className={EYEBROW}>Tambah penyulang</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">
        Prefiksnya tidak perlu diisi sekarang — sistem membuatnya sendiri dari nama penyulang
        saat tiang pertama dinamai, dan bisa dibetulkan setelahnya.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={nama}
          onChange={(e) => setNama(e.target.value.toUpperCase())}
          placeholder="Nama penyulang"
          className={`${FIELD} w-[260px]`}
        />
        <select
          value={ulp}
          onChange={(e) => setUlp(e.target.value)}
          disabled={!bolehSemua}
          className={`${FIELD} w-[180px] disabled:opacity-60`}
        >
          <option value="">— pilih ULP —</option>
          {UNITS.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => void kirim()}
          disabled={!nama.trim() || !ulp || sibuk}
          className={BTN_PRIMARY}
        >
          <Plus size={15} /> Tambah
        </button>
      </div>
    </div>
  );
}

function Baris({
  b,
  onSimpan,
  onHapus,
  oleh,
}: {
  b: PenyulangBaris;
  onSimpan: (v: {
    penyulang: string;
    ulp: string;
    kodeSingkat?: string | null;
    oleh?: string;
  }) => Promise<HasilPrefiks | null>;
  onHapus: (penyulang: string, oleh?: string) => Promise<boolean>;
  oleh?: string;
}) {
  const toast = useToast();
  const [kode, setKode] = useState(b.kode_singkat ?? "");
  const [sibuk, setSibuk] = useState(false);
  const dipakai = b.tiang_dimiliki > 0 || b.tiang_bernama > 0 || b.segmen > 0;

  const simpanPrefiks = async () => {
    const baru = kode.trim().toUpperCase();
    if (!baru || baru === (b.kode_singkat ?? "")) return;

    // Konfirmasi HANYA kalau memang ada yang akan berganti nama. Menanyai admin
    // untuk penyulang yang belum punya satu tiang pun cuma melatihnya menekan
    // "OK" tanpa membaca — dan saat pertanyaannya benar-benar penting, dia
    // sudah terbiasa melewatinya.
    if (b.tiang_bernama > 0) {
      const ya = confirm(
        `Ganti prefiks ${b.penyulang} dari "${b.kode_singkat ?? "—"}" jadi "${baru}"?\n\n` +
          `${b.tiang_bernama} nama tiang akan langsung berubah, termasuk yang sudah dicatat regu di lapangan.`,
      );
      if (!ya) {
        setKode(b.kode_singkat ?? "");
        return;
      }
    }

    setSibuk(true);
    const hasil = await onSimpan({
      penyulang: b.penyulang,
      ulp: b.ulp ?? "",
      kodeSingkat: baru,
      oleh,
    });
    setSibuk(false);

    // Ditolak database — kembalikan kotaknya ke keadaan sebenarnya. Membiarkan
    // nilai yang gagal tersimpan tetap terbaca di layar akan membuat admin
    // mengira perubahannya berhasil.
    if (!hasil) {
      setKode(b.kode_singkat ?? "");
      return;
    }

    // Jumlahnya disebutkan apa adanya: penomoran ulang tidak terlihat dari
    // halaman ini, dan yang tidak terlihat tidak akan pernah diperiksa.
    toast.success(
      hasil.nama > 0
        ? `Prefiks ${b.penyulang} jadi ${hasil.kode_baru} · ${hasil.nama} nama tiang dinomori ulang.`
        : `Prefiks ${b.penyulang} jadi ${hasil.kode_baru}.`,
    );
  };

  return (
    <tr className="border-b border-line last:border-0 hover:bg-surface/60">
      <td className="px-3 py-2 font-semibold text-ink">{b.penyulang}</td>
      <td className="px-3 py-2 text-ink-soft">{b.ulp ?? "—"}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <input
            value={kode}
            onChange={(e) => setKode(e.target.value.toUpperCase())}
            onBlur={() => void simpanPrefiks()}
            placeholder="belum ada"
            disabled={sibuk}
            className={`${FIELD} font-mono w-[104px] ${b.kode_singkat ? "" : "border-amber-300"}`}
            aria-label={`Prefiks ${b.penyulang}`}
          />
          {b.tiang_bernama > 0 && (
            <span title={`${b.tiang_bernama} nama tiang ikut berubah`}>
              <TriangleAlert size={14} className="text-amber-600" />
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2 text-ink-soft tabular-nums">{b.tiang_dimiliki}</td>
      <td className="px-3 py-2 text-ink-soft tabular-nums">{b.tiang_bernama}</td>
      <td className="px-3 py-2 text-ink-soft tabular-nums">{b.segmen}</td>
      <td className="px-3 py-2">
        <button
          onClick={() => {
            if (confirm(`Hapus penyulang "${b.penyulang}"?`)) void onHapus(b.penyulang, oleh);
          }}
          disabled={dipakai}
          className={`${BTN_GHOST} h-8 px-2 disabled:opacity-30`}
          title={
            dipakai
              ? "Sudah dipakai — penyulang yang punya tiang atau segmen tidak bisa dihapus"
              : "Hapus"
          }
          aria-label={`Hapus ${b.penyulang}`}
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
