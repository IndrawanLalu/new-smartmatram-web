import type React from "react";
import { ATAS_ISI, TINGGI_FOOTER } from "./Bingkai";
import { C, G_LEBAR, G_TINGGI, HURUF_JUDUL, HURUF_TANGAN } from "./gaya";
import { Ikon, type NamaIkon } from "./ikon";

/**
 * Tata letak isi + kartu panel kanan, dipakai semua gambar laporan:
 * area utama (kiri, putih) dan kolom kartu (kanan) — Promt.md bagian 2B/2C.
 */

const BAWAH_ISI = G_TINGGI - TINGGI_FOOTER - 12;
const KIRI_UTAMA = 24;
const LEBAR_UTAMA = 1432;
const KIRI_PANEL = KIRI_UTAMA + LEBAR_UTAMA + 20;
const LEBAR_PANEL = G_LEBAR - KIRI_PANEL - 24;

/** Kartu putih besar tempat tabel/grafik utama. Padding 14/16. */
export function AreaUtama({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute", top: ATAS_ISI, left: KIRI_UTAMA, width: LEBAR_UTAMA, height: BAWAH_ISI - ATAS_ISI,
        display: "flex", flexDirection: "column", background: C.putih, borderRadius: 18, border: "1px solid #CFDDF0",
        padding: "14px 16px",
      }}
    >
      {children}
    </div>
  );
}

/** Kolom kartu ringkasan di kanan. Kartu tanpa `tinggi` mengisi sisa ruang. */
export function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", top: ATAS_ISI, left: KIRI_PANEL, width: LEBAR_PANEL, height: BAWAH_ISI - ATAS_ISI, display: "flex", flexDirection: "column", gap: 13 }}>
      {children}
    </div>
  );
}

interface KartuProps {
  latar: string;
  tepi: string;
  tinggi?: number;
  children: React.ReactNode;
}

export function Kartu({ latar, tepi, tinggi, children }: KartuProps) {
  return (
    <div
      style={{
        ...(tinggi ? { height: tinggi, flexShrink: 0 } : { flexGrow: 1, minHeight: 0 }),
        display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
        background: latar, border: `2px solid ${tepi}`, borderRadius: 16, padding: "14px 22px",
      }}
    >
      {children}
    </div>
  );
}

export function JudulKartu({ ikon, warna, teks, terang }: { ikon: NamaIkon; warna: string; teks: string; terang?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 23, fontWeight: 700, color: terang ? C.putih : C.navy }}>
      <Ikon nama={ikon} ukuran={30} warna={warna} />
      {teks}
    </div>
  );
}

/** Kartu navy paling atas — angka terpenting laporan, dengan hiasan batang. */
export function KartuUtama({ ikon, judul, nilai, keterangan }: { ikon: NamaIkon; judul: string; nilai: string; keterangan: string }) {
  return (
    <div
      style={{
        height: 140, flexShrink: 0, display: "flex", flexDirection: "column", position: "relative", overflow: "hidden",
        borderRadius: 16, padding: "14px 24px", color: C.putih,
        background: `linear-gradient(135deg, ${C.navy} 0%, ${C.navyTua} 100%)`,
      }}
    >
      <JudulKartu ikon={ikon} warna={C.kuning} teks={judul} terang />
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 2 }}>
        <div style={{ fontFamily: HURUF_JUDUL, fontSize: 82, fontWeight: 800, lineHeight: 1 }}>{nilai}</div>
        <div style={{ fontSize: 20, fontWeight: 600, opacity: 0.9 }}>{keterangan}</div>
      </div>
      <svg width={74} height={64} viewBox="0 0 74 64" style={{ position: "absolute", right: 26, bottom: 24 }}>
        {[16, 30, 46, 62].map((t, i) => (
          <rect key={t} x={i * 19} y={64 - t} width={12} height={t} rx={6} fill={C.biruTerang} opacity={0.55 + i * 0.15} />
        ))}
      </svg>
    </div>
  );
}

interface KartuAngkaProps {
  ikon: NamaIkon;
  ikonWarna: string;
  judul: string;
  nilai: string;
  keterangan: string;
  warna: string;
  latar: string;
  tepi: string;
  /** 0–1; null = tanpa bilah porsi. */
  porsi: number | null;
}

/** Angka besar + keterangan + bilah porsi. */
export function KartuAngka({ ikon, ikonWarna, judul, nilai, keterangan, warna, latar, tepi, porsi }: KartuAngkaProps) {
  return (
    <Kartu latar={latar} tepi={tepi} tinggi={130}>
      <JudulKartu ikon={ikon} warna={ikonWarna} teks={judul} />
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 2 }}>
        <div style={{ fontFamily: HURUF_JUDUL, fontSize: 60, fontWeight: 800, color: warna, lineHeight: 1 }}>{nilai}</div>
        <div style={{ fontSize: 19, fontWeight: 700, color: warna }}>{keterangan}</div>
      </div>
      {porsi !== null && (
        <div style={{ display: "flex", height: 12, borderRadius: 6, background: "rgba(13,35,80,.08)", marginTop: 8, overflow: "hidden" }}>
          <div style={{ height: 12, width: `${Math.min(porsi, 1) * 100}%`, minWidth: 12, borderRadius: 6, background: ikonWarna }} />
        </div>
      )}
    </Kartu>
  );
}

/** Kartu terakhir: poin tindak lanjut + "Satu Tim, Satu Tujuan". */
export function KartuFokus({ poin }: { poin: string[] }) {
  return (
    <Kartu latar={C.putih} tepi="#C6DBF3">
      <JudulKartu ikon="sasaran" warna={C.navy} teks="Fokus Kita" />
      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
        {poin.map((t) => (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 17.5, fontWeight: 600, color: C.tintaLembut }}>
            <Ikon nama="centang" ukuran={21} warna={C.hijau} />
            {t}
          </div>
        ))}
      </div>
      <div
        style={{
          position: "absolute", right: 20, bottom: 14, display: "flex", flexDirection: "column", transform: "rotate(-10deg)",
          fontFamily: HURUF_TANGAN, fontWeight: 700, fontSize: 22, lineHeight: 1.05, color: C.navy,
        }}
      >
        <span>Satu Tim,</span>
        <span>Satu Tujuan</span>
        <div style={{ height: 3, width: 90, marginLeft: 20, borderRadius: 2, background: C.kuning }} />
      </div>
    </Kartu>
  );
}
