"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import Paginasi from "./Paginasi";

/**
 * Laporan satu petugas di Realisasi PS4 + verifikasi Masuk PS4 / Tidak masuk
 * (apkt_ps4_tetapkan: UP3 semua ULP, admin ULP sendiri). Klik pilihan yang
 * sedang aktif = batalkan verifikasinya.
 *
 * Daftar "belum diambil fotonya": tombol mengantrekan laporan di halaman yang
 * tampil (apkt_foto_minta, sama dengan tombol Ambil foto di form koreksi) —
 * dicicil per halaman, pekerja homelab mengambilnya satu per satu berjeda
 * 10 detik (20 laporan ± 4–5 menit).
 */

interface Laporan {
  no_laporan: string;
  waktu_lapor: string | null;
  alamat_pelapor: string | null;
  keterangan_pelapor: string | null;
  penyebab: string | null;
  status_foto: string | null;
  ps4: "ya" | "tidak" | null;
  ps4_oleh: string | null;
  foto: { tahap: "pengerjaan" | "selesai"; path: string | null }[];
}

interface Props {
  dari: string;
  sampai: string;
  ulp: string;
  /** null = laporan yang belum diambil pekerja. */
  petugas: string | null;
  onBerubah: () => void;
}

const PER_HALAMAN = 20;
const TAHAP = [
  { kunci: "pengerjaan", label: "Dalam Pengerjaan" },
  { kunci: "selesai", label: "Selesai" },
] as const;
const PILIHAN = [
  { nilai: "ya", label: "Masuk PS4", aktif: "border-green-300 bg-green-50 text-green-700" },
  { nilai: "tidak", label: "Tidak masuk", aktif: "border-red-300 bg-red-50 text-red-700" },
] as const;

const urlFoto = (path: string) => supabaseBrowser.storage.from("apkt-foto").getPublicUrl(path).data.publicUrl;

export default function Ps4Laporan({ dari, sampai, ulp, petugas, onBerubah }: Props) {
  const user = useCurrentUser();
  const boleh = user.role === "UP3" || user.role === "admin";
  const [isi, setIsi] = useState<Laporan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [belumSaja, setBelumSaja] = useState(false);
  const [halaman, setHalaman] = useState(1);
  const [simpan, setSimpan] = useState<string | null>(null);
  const [diminta, setDiminta] = useState<Set<string>>(new Set());
  const [mengantre, setMengantre] = useState(false);
  const [muatUlang, setMuatUlang] = useState(0);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .rpc("realisasi_ps4_laporan", {
        p_dari: dari, p_sampai: sampai, p_ulp: ulp || null, p_petugas: petugas, p_belum_verifikasi: belumSaja,
      })
      .then(({ data, error }) => {
        if (!hidup) return;
        setGalat(error ? error.message : null);
        setIsi((data ?? []) as Laporan[]);
      });
    return () => { hidup = false; };
  }, [dari, sampai, ulp, petugas, belumSaja, muatUlang]);

  const tetapkan = async (no: string, nilai: "ya" | "tidak" | null) => {
    setSimpan(no);
    const { error } = await supabaseBrowser.rpc("apkt_ps4_tetapkan", { p_no_laporan: no, p_ps4: nilai });
    setSimpan(null);
    if (error) return setGalat(error.message);
    setGalat(null);
    setIsi((v) => v?.map((l) => (l.no_laporan === no ? { ...l, ps4: nilai, ps4_oleh: nilai ? user.name || user.email : null } : l)) ?? v);
    onBerubah();
  };

  const antrekan = async (daftar: string[]) => {
    setMengantre(true);
    const gagal: string[] = [];
    for (const no of daftar) {
      const { error } = await supabaseBrowser.rpc("apkt_foto_minta", { p_no_laporan: no });
      if (error) gagal.push(`${no}: ${error.message}`);
      else setDiminta((v) => new Set(v).add(no));
    }
    setMengantre(false);
    setGalat(gagal.length ? `Gagal masuk antrean — ${gagal.join("; ")}` : null);
  };

  const segarkan = () => { setMuatUlang((v) => v + 1); onBerubah(); };

  const semua = isi ?? [];
  const jumlahHalaman = Math.max(1, Math.ceil(semua.length / PER_HALAMAN));
  const hal = Math.min(halaman, jumlahHalaman);
  const tampil = semua.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN);

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-center gap-3 flex-wrap">
        <p className={`${EYEBROW} flex-1`}>{petugas ? `Laporan ${petugas}` : "Laporan yang belum diambil fotonya"}</p>
        {!petugas && tampil.length > 0 && (
          <>
            <button onClick={segarkan} className="px-2.5 py-1 rounded-lg border border-line bg-white text-xs font-semibold text-ink-soft hover:bg-surface">
              Muat ulang
            </button>
            <button onClick={() => void antrekan(tampil.map((l) => l.no_laporan).filter((no) => !diminta.has(no)))}
              disabled={mengantre || tampil.every((l) => diminta.has(l.no_laporan))}
              className="px-2.5 py-1 rounded-lg border border-navy-300 bg-white text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60">
              {mengantre ? "Memasukkan antrean…" : `Ambil foto ${tampil.length} laporan di halaman ini`}
            </button>
          </>
        )}
        {petugas && (
          <label className="flex items-center gap-1.5 text-xs text-ink-soft">
            <input type="checkbox" checked={belumSaja} onChange={(e) => { setBelumSaja(e.target.checked); setHalaman(1); }} />
            Hanya yang belum diverifikasi
          </label>
        )}
      </div>
      {galat && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{galat}</p>}
      {!isi && <p className="text-sm text-ink-soft">Memuat laporan…</p>}
      {isi && semua.length === 0 && <p className="text-sm text-ink-soft">Tidak ada laporan.</p>}

      <div className="divide-y divide-line">
        {tampil.map((l) => {
          const berfoto = l.foto.some((f) => f.path);
          return (
            <div key={l.no_laporan} className="py-3 flex gap-3 flex-wrap md:flex-nowrap">
              <div className="flex gap-2 shrink-0">
                {TAHAP.map((t) => {
                  const f = l.foto.find((x) => x.tahap === t.kunci);
                  return f?.path ? (
                    <a key={t.kunci} href={urlFoto(f.path)} target="_blank" rel="noreferrer" title={t.label}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- berkas Storage kecil, klik = ukuran asli */}
                      <img src={urlFoto(f.path)} alt={t.label} loading="lazy"
                        className="w-20 h-28 object-cover rounded-lg border border-line" />
                    </a>
                  ) : (
                    <div key={t.kunci} title={t.label}
                      className="w-20 h-28 rounded-lg border border-dashed border-line flex items-center justify-center text-[10px] text-ink-muted text-center px-1">
                      {f ? "Berkas dihapus" : `Tanpa foto ${t.label}`}
                    </div>
                  );
                })}
              </div>
              <div className="flex-1 min-w-0 text-xs space-y-0.5">
                <p className="font-semibold text-ink text-sm">{l.no_laporan}</p>
                <p className="text-ink-soft">{l.waktu_lapor} · {l.penyebab || "—"}</p>
                <p className="text-ink truncate">{l.keterangan_pelapor || "—"}</p>
                <p className="text-ink-soft truncate">{l.alamat_pelapor || ""}</p>
                {l.status_foto === "tidak_ada_foto" && <p className="text-amber-700">Tidak ada foto di APKT.</p>}
                {l.ps4_oleh && <p className="text-ink-muted">Diverifikasi {l.ps4_oleh}</p>}
                {diminta.has(l.no_laporan) && <p className="text-navy-700">Masuk antrean pekerja (± 15 detik per laporan) — tekan Muat ulang beberapa saat lagi.</p>}
              </div>
              {berfoto && (
                <div className="flex md:flex-col gap-1.5 shrink-0">
                  {PILIHAN.map((p) => {
                    const aktif = l.ps4 === p.nilai;
                    return (
                      <button key={p.nilai} disabled={!boleh || simpan === l.no_laporan}
                        onClick={() => void tetapkan(l.no_laporan, aktif ? null : p.nilai)}
                        title={aktif ? "Klik lagi untuk membatalkan" : undefined}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-60 ${
                          aktif ? p.aktif : "border-line bg-white text-ink-soft hover:bg-surface"
                        }`}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {semua.length > PER_HALAMAN && (
        <Paginasi total={semua.length} halaman={hal} perHalaman={PER_HALAMAN} onGanti={setHalaman} satuan="laporan" />
      )}
    </div>
  );
}
