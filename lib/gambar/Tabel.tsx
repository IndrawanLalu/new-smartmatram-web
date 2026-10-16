import type React from "react";
import { C } from "./gaya";
import { Ikon, type NamaIkon } from "./ikon";

/**
 * Tabel gambar laporan: satu daftar kolom → kepala berwarna + baris zebra.
 * Laporan baru cukup menyusun `Kolom[]`; tampilan tabelnya tidak ditulis ulang.
 */

export interface Kolom<T> {
  kepala: string;
  ikon?: NamaIkon;
  /** Warna latar sel kepala. */
  latar: string;
  lebar: number;
  rata?: "kiri" | "tengah" | "kanan";
  /** Angka harus sudah jadi teks — Satori menolak anak berupa number. */
  isi: (baris: T, urutan: number) => React.ReactNode;
  /** Gaya tambahan sel isi (warna, tebal). */
  gaya?: (baris: T) => React.CSSProperties;
}

interface TabelProps<T> {
  kolom: Kolom<T>[];
  baris: T[];
  kunci: (baris: T) => string;
  tinggiKepala: number;
  tinggiBaris: number;
  ukuranHuruf: number;
  /** Baris yang perlu perhatian berlatar merah muda. */
  merah?: (baris: T) => boolean;
  /** Ukuran ikon kepala. */
  ikonKepala?: number;
}

const RATA = { kiri: "flex-start", tengah: "center", kanan: "flex-end" } as const;
const PADDING = { kiri: "0 0 0 16px", tengah: "0", kanan: "0 20px 0 0" } as const;

export function Sel<T>({ k, children, style }: { k: Pick<Kolom<T>, "lebar" | "rata">; children: React.ReactNode; style?: React.CSSProperties }) {
  const rata = k.rata ?? "tengah";
  return (
    <div style={{ width: k.lebar, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: RATA[rata], padding: PADDING[rata], ...style }}>
      {children}
    </div>
  );
}

export function Tabel<T>({ kolom, baris, kunci, tinggiKepala, tinggiBaris, ukuranHuruf, merah, ikonKepala = 21 }: TabelProps<T>) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", height: tinggiKepala, flexShrink: 0, color: C.putih, fontSize: 19, fontWeight: 700, borderRadius: 8, overflow: "hidden" }}>
        {kolom.map((k, i) => (
          <Sel key={k.kepala} k={k} style={{ background: k.latar, gap: 9, borderRight: i < kolom.length - 1 ? "1px solid rgba(255,255,255,.25)" : "none" }}>
            {k.ikon && <Ikon nama={k.ikon} ukuran={ikonKepala} warna={C.putih} />}
            <span>{k.kepala}</span>
          </Sel>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
        {baris.map((b, i) => (
          <div
            key={kunci(b)}
            style={{
              display: "flex", height: tinggiBaris, flexShrink: 0, fontSize: ukuranHuruf, fontWeight: 600,
              background: merah?.(b) ? C.merahMuda : i % 2 ? C.zebra : C.putih, borderBottom: `1px solid ${C.garis}`,
            }}
          >
            {kolom.map((k) => (
              <Sel key={k.kepala} k={k} style={k.gaya?.(b)}>
                {k.isi(b, i)}
              </Sel>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
