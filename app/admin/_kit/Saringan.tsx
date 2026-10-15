"use client";

import { CalendarDays, MapPin } from "lucide-react";
import { PilihField } from "./Field";

/**
 * Pemilih saringan yang berulang di hampir setiap halaman (ULP · Periode ·
 * Tahun) — satu rupa, satu urutan, satu cara menulis "Semua ULP". Dipasang di
 * topbar lewat `IsiTopbar`.
 */

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface UlpProps {
  nilai: string;
  onUbah: (ulp: string) => void;
  /** "SEMUA" di daftar = pengguna boleh melihat semua ULP. */
  daftar: string[];
}

export function PilihUlp({ nilai, onUbah, daftar }: UlpProps) {
  return (
    <PilihField ikon={MapPin} label="ULP" lebar="w-[155px]" nilai={nilai} onUbah={onUbah} disabled={daftar.length <= 1}>
      {daftar.map((u) => <option key={u} value={u}>{u === "SEMUA" ? "Semua ULP" : u}</option>)}
    </PilihField>
  );
}

interface PeriodeProps {
  tahun: number;
  /** 0 = sepanjang tahun. */
  bulan: number;
  daftarTahun: number[];
  onTahun: (t: number) => void;
  onBulan: (b: number) => void;
  disabled?: boolean;
}

/** Bulan + tahun dalam SATU pilihan ("Oktober 2026", "Sepanjang tahun 2026"). */
export function PilihPeriode({ tahun, bulan, daftarTahun, onTahun, onBulan, disabled }: PeriodeProps) {
  return (
    <PilihField
      ikon={CalendarDays}
      label="Periode"
      lebar="w-[185px]"
      nilai={`${tahun}-${bulan}`}
      disabled={disabled}
      onUbah={(v) => {
        const [t, b] = v.split("-").map(Number);
        if (t !== tahun) onTahun(t);
        if (b !== bulan) onBulan(b);
      }}
    >
      {daftarTahun.map((t) => (
        <optgroup key={t} label={String(t)}>
          {NAMA_BULAN.map((b, i) => <option key={b} value={`${t}-${i + 1}`}>{b} {t}</option>)}
          <option value={`${t}-0`}>Sepanjang tahun {t}</option>
        </optgroup>
      ))}
    </PilihField>
  );
}

interface TahunProps {
  tahun: number;
  daftarTahun: number[];
  onTahun: (t: number) => void;
  disabled?: boolean;
}

export function PilihTahun({ tahun, daftarTahun, onTahun, disabled }: TahunProps) {
  return (
    <PilihField ikon={CalendarDays} label="Tahun" lebar="w-[130px]" nilai={tahun} onUbah={(v) => onTahun(Number(v))} disabled={disabled}>
      {daftarTahun.map((t) => <option key={t} value={t}>{t}</option>)}
    </PilihField>
  );
}
