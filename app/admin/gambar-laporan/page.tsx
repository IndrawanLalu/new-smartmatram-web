"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Download, FileImage, ImagePlus, Loader2, TriangleAlert } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import IsiTopbar from "@/app/admin/_kit/IsiTopbar";
import Tombol from "@/app/admin/_kit/Tombol";
import { PilihField } from "@/app/admin/_kit/Field";
import { PilihUlp } from "@/app/admin/_kit/Saringan";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { JENIS_LAPORAN } from "@/lib/gambar/laporan";
import { useGambarLaporan } from "./_hooks/useGambarLaporan";

/**
 * Gambar Laporan — satu tempat membuat infografis PNG 1920×1080 untuk dibagikan
 * ke grup (keputusan user 16 Okt 2026). Pilih jenis, ULP, bulan → Buat Gambar →
 * pratinjau → Unduh. Desainnya tetap (lib/gambar, patokan smart-video
 * `Prompt/Promt.md`); yang berubah hanya datanya.
 *
 * Gambarnya per ULP per bulan, jadi tidak ada "Semua ULP" atau "sepanjang tahun".
 */

const NAMA_BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
/** Pilihan bulan: bulan ini dan 11 bulan sebelumnya. */
const JUMLAH_BULAN = 12;

function daftarBulan() {
  const kini = new Date();
  return Array.from({ length: JUMLAH_BULAN }, (_, i) => {
    const d = new Date(kini.getFullYear(), kini.getMonth() - i, 1);
    return { nilai: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: `${NAMA_BULAN[d.getMonth()]} ${d.getFullYear()}` };
  });
}

function unduh(url: string, nama: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  a.click();
}

export default function GambarLaporanPage() {
  const user = useCurrentUser();
  const daftarUlp = canSeeAllUnits(user.role) ? UNITS.map((u) => u.value) : [user.unit ?? ""];
  const [pilihanBulan] = useState(daftarBulan);

  const [jenis, setJenis] = useState<string>(JENIS_LAPORAN[0].kunci);
  const [ulp, setUlp] = useState(daftarUlp[0]);
  const [bulan, setBulan] = useState(pilihanBulan[0].nilai);
  const { hasil, membuat, galat, buat, kosongkan } = useGambarLaporan();

  // Saringan berubah → pratinjau lama tidak lagi sesuai pilihan.
  const ganti = <T,>(set: (v: T) => void) => (v: T) => { set(v); kosongkan(); };
  const minta = { jenis, ulp, bulan };
  const info = JENIS_LAPORAN.find((j) => j.kunci === jenis)!;

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiTopbar>
        <PilihField ikon={FileImage} label="Jenis laporan" lebar="w-[290px]" nilai={jenis} onUbah={ganti(setJenis)}>
          {JENIS_LAPORAN.map((j) => <option key={j.kunci} value={j.kunci}>{j.label}</option>)}
        </PilihField>
        <PilihUlp nilai={ulp} onUbah={ganti(setUlp)} daftar={daftarUlp} />
        <PilihField ikon={CalendarDays} label="Bulan" lebar="w-[185px]" nilai={bulan} onUbah={ganti(setBulan)}>
          {pilihanBulan.map((b) => <option key={b.nilai} value={b.nilai}>{b.label}</option>)}
        </PilihField>
      </IsiTopbar>

      <div className="bg-white rounded-xl border border-line shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <p className="font-semibold">{info.label}</p>
          <p className="text-sm text-ink-soft">
            {info.keterangan} ULP {ulp} · {pilihanBulan.find((b) => b.nilai === bulan)?.label}
          </p>
        </div>
        <Tombol ragam="utama" onClick={() => buat(minta)} disabled={membuat} ikon={membuat ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}>
          {membuat ? "Membuat gambar…" : "Buat Gambar"}
        </Tombol>
        {hasil && <Tombol onClick={() => unduh(hasil.url, hasil.nama)} disabled={membuat} ikon={<Download size={15} />}>Unduh PNG</Tombol>}
      </div>

      {galat && (
        <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <TriangleAlert size={17} className="mt-0.5 shrink-0 text-red-600" />
          <p className="text-red-700">{galat}</p>
        </div>
      )}

      {hasil ? (
        <div className="flex flex-col gap-2">
          {/* Blob lokal — next/image tidak berlaku. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={hasil.url} alt={`Pratinjau ${info.label}`} className={`w-full rounded-xl border border-line shadow-sm ${membuat ? "opacity-50" : ""}`} />
          {hasil.jumlahHalaman > 1 && (
            <div className="flex items-center justify-center gap-3 text-sm">
              <Tombol ukuran="sm" disabled={membuat || hasil.halaman <= 1} onClick={() => buat(minta, hasil.halaman - 1)} ikon={<ChevronLeft size={14} />}>Sebelumnya</Tombol>
              <span className="text-ink-soft">Halaman {hasil.halaman} dari {hasil.jumlahHalaman} — tiap halaman diunduh sendiri</span>
              <Tombol ukuran="sm" disabled={membuat || hasil.halaman >= hasil.jumlahHalaman} onClick={() => buat(minta, hasil.halaman + 1)} ikon={<ChevronRight size={14} />}>Berikutnya</Tombol>
            </div>
          )}
        </div>
      ) : (
        !galat && (
          <div className="aspect-video w-full rounded-xl border-2 border-dashed border-line bg-white/60 grid place-items-center text-sm text-ink-muted">
            {membuat ? "Sedang membuat gambar…" : "Pilih jenis laporan, ULP, dan bulan, lalu tekan Buat Gambar."}
          </div>
        )
      )}
    </div>
  );
}
