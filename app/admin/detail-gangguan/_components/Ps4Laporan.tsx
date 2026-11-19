"use client";

import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import Paginasi from "./Paginasi";
import Ps4Penampil, {
  PILIHAN_PS4 as PILIHAN, TAHAP_PS4 as TAHAP, urlFotoPs4 as urlFoto, type LaporanPs4 as Laporan, type NilaiPs4,
} from "./Ps4Penampil";

/**
 * Laporan satu petugas di Realisasi PS4 + verifikasi Masuk PS4 / Tidak masuk
 * (apkt_ps4_tetapkan: UP3 semua ULP, admin ULP sendiri). Klik pilihan yang
 * sedang aktif = batalkan verifikasinya.
 *
 * Daftar "belum diambil fotonya": tombol mengantrekan laporan di halaman yang
 * tampil (apkt_foto_minta, sama dengan tombol Ambil foto di form koreksi) —
 * dicicil per halaman, pekerja homelab mengambilnya satu per satu berjeda
 * 10 detik (20 laporan ± 4–5 menit). Status antrean & kemajuannya dibaca dari
 * server oleh RealisasiPs4Tab, jadi tetap terlihat sesudah halaman dimuat ulang.
 *
 * Daftar "Belum diverifikasi" langsung membuka penampil foto besar; klik foto
 * di daftar mana pun membukanya di laporan itu.
 */


interface Props {
  dari: string;
  sampai: string;
  ulp: string;
  /** null = laporan yang belum diambil pekerja, "*" = semua petugas. */
  petugas: string | null;
  /** Daftar "Belum diverifikasi" semua petugas: saringan belum-verifikasi selalu aktif. */
  semuaBelumVerifikasi?: boolean;
  /** Laporan yang sedang di antrean pekerja (dibaca dari server, tahan reload). */
  antre: Set<string>;
  /** Naik tiap kali daftar perlu dibaca ulang (diperbarui otomatis selama ada antrean). */
  versi: number;
  onBerubah: () => void;
}

const PER_HALAMAN = 20;
const adaFoto = (l: Laporan) => l.foto.some((f) => f.path);

export default function Ps4Laporan({ dari, sampai, ulp, petugas, semuaBelumVerifikasi = false, antre, versi, onBerubah }: Props) {
  const user = useCurrentUser();
  const boleh = user.role === "UP3" || user.role === "admin";
  const [isi, setIsi] = useState<Laporan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [belumSaja, setBelumSaja] = useState(semuaBelumVerifikasi);
  const [halaman, setHalaman] = useState(1);
  const [simpan, setSimpan] = useState<string | null>(null);
  const [mengantre, setMengantre] = useState(false);
  const [penampil, setPenampil] = useState<{ daftar: Laporan[]; mulai: number } | null>(null);
  const sudahBuka = useRef(false);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .rpc("realisasi_ps4_laporan", {
        p_dari: dari, p_sampai: sampai, p_ulp: ulp || null, p_petugas: petugas, p_belum_verifikasi: belumSaja,
      })
      .then(({ data, error }) => {
        if (!hidup) return;
        setGalat(error ? error.message : null);
        const d = (data ?? []) as Laporan[];
        setIsi(d);
        if (semuaBelumVerifikasi && !error && !sudahBuka.current) {
          sudahBuka.current = true;
          const berfoto = d.filter(adaFoto);
          if (berfoto.length) setPenampil({ daftar: berfoto, mulai: 0 });
        }
      });
    return () => { hidup = false; };
  }, [dari, sampai, ulp, petugas, belumSaja, versi, semuaBelumVerifikasi]);

  const tetapkan = async (no: string, nilai: NilaiPs4 | null): Promise<string | null> => {
    setSimpan(no);
    const { error } = await supabaseBrowser.rpc("apkt_ps4_tetapkan", { p_no_laporan: no, p_ps4: nilai });
    setSimpan(null);
    if (error) {
      setGalat(error.message);
      return error.message;
    }
    setGalat(null);
    setIsi((v) => v?.map((l) => (l.no_laporan === no ? { ...l, ps4: nilai, ps4_oleh: nilai ? user.name || user.email : null } : l)) ?? v);
    onBerubah();
    return null;
  };

  const buka = (no: string) => {
    const daftar = semua.filter(adaFoto);
    setPenampil({ daftar, mulai: Math.max(0, daftar.findIndex((x) => x.no_laporan === no)) });
  };

  const antrekan = async (daftar: string[]) => {
    setMengantre(true);
    const gagal: string[] = [];
    for (const no of daftar) {
      const { error } = await supabaseBrowser.rpc("apkt_foto_minta", { p_no_laporan: no });
      if (error) gagal.push(`${no}: ${error.message}`);
    }
    setMengantre(false);
    setGalat(gagal.length ? `Gagal masuk antrean — ${gagal.join("; ")}` : null);
    onBerubah();
  };

  const semua = isi ?? [];
  const jumlahHalaman = Math.max(1, Math.ceil(semua.length / PER_HALAMAN));
  const hal = Math.min(halaman, jumlahHalaman);
  const tampil = semua.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN);
  const belumAntre = tampil.map((l) => l.no_laporan).filter((no) => !antre.has(no));

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex items-center gap-3 flex-wrap">
        <p className={`${EYEBROW} flex-1`}>
          {semuaBelumVerifikasi ? "Foto semua petugas yang belum diverifikasi"
            : petugas ? `Laporan ${petugas}` : "Laporan yang belum diambil fotonya"}
        </p>
        {!petugas && tampil.length > 0 && (
          <button onClick={() => void antrekan(belumAntre)} disabled={mengantre || belumAntre.length === 0}
            className="px-2.5 py-1 rounded-lg border border-navy-300 bg-white text-xs font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60">
            {mengantre
              ? "Memasukkan antrean…"
              : belumAntre.length === 0
                ? "Semua di halaman ini sudah di antrean"
                : `Ambil foto ${belumAntre.length} laporan di halaman ini`}
          </button>
        )}
        {semuaBelumVerifikasi && semua.some(adaFoto) && (
          <button onClick={() => setPenampil({ daftar: semua.filter(adaFoto), mulai: 0 })}
            className="px-2.5 py-1 rounded-lg border border-navy-300 bg-white text-xs font-semibold text-navy-700 hover:bg-navy-50">
            Tampilkan foto besar
          </button>
        )}
        {petugas && !semuaBelumVerifikasi && (
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
          const berfoto = adaFoto(l);
          return (
            <div key={l.no_laporan} className="py-3 flex gap-3 flex-wrap md:flex-nowrap">
              <div className="flex gap-2 shrink-0">
                {TAHAP.map((t) => {
                  const f = l.foto.find((x) => x.tahap === t.kunci);
                  return f?.path ? (
                    <button key={t.kunci} onClick={() => buka(l.no_laporan)} title={`${t.label} — klik untuk foto besar`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- berkas Storage kecil, klik = foto besar */}
                      <img src={urlFoto(f.path)} alt={t.label} loading="lazy"
                        className="w-20 h-28 object-cover rounded-lg border border-line" />
                    </button>
                  ) : (
                    <div key={t.kunci} title={t.label}
                      className="w-20 h-28 rounded-lg border border-dashed border-line flex items-center justify-center text-[10px] text-ink-muted text-center px-1">
                      {f ? "Berkas dihapus" : `Tanpa foto ${t.label}`}
                    </div>
                  );
                })}
              </div>
              <div className="flex-1 min-w-0 text-xs space-y-0.5">
                <p className="font-semibold text-ink text-sm">
                  {l.no_laporan}
                  {semuaBelumVerifikasi && <span className="font-normal text-ink-soft"> · {l.petugas}</span>}
                </p>
                <p className="text-ink-soft">{l.waktu_lapor} · {l.penyebab || "—"}</p>
                <p className="text-ink truncate">{l.keterangan_pelapor || "—"}</p>
                <p className="text-ink-soft truncate">{l.alamat_pelapor || ""}</p>
                {l.status_foto === "tidak_ada_foto" && <p className="text-amber-700">Tidak ada foto di APKT.</p>}
                {l.ps4_oleh && <p className="text-ink-muted">Diverifikasi {l.ps4_oleh}</p>}
                {antre.has(l.no_laporan) && <p className="text-navy-700 font-semibold">Di antrean pekerja — pindah ke petugasnya begitu fotonya diambil.</p>}
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

      {penampil && (
        <Ps4Penampil daftar={penampil.daftar} mulai={penampil.mulai} boleh={boleh}
          onTetapkan={tetapkan} onTutup={() => setPenampil(null)} />
      )}
    </div>
  );
}
