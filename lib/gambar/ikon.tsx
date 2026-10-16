/* eslint-disable @next/next/no-img-element -- dirender next/og jadi PNG, bukan halaman; next/image tidak berlaku di sini. */
import { ImageResponse } from "next/og";
import { isValidElement, type ReactNode } from "react";

/**
 * Ikon gambar laporan (gaya Material), satu warna, viewBox 24.
 *
 * SVG di dalam `next/og` mahal: tiap ikon ~80 ms, dan satu laporan memuat ±60
 * ikon (5–6 detik). Maka tiap pasangan ikon+warna digambar SEKALI jadi PNG
 * (`siapkanIkon`), disimpan selama proses hidup, lalu dipakai sebagai <img> —
 * 80 ikon PNG ±0,2 detik.
 */
const PATH = {
  kalender: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 16H5V9h14v11zM7 11h4v4H7z",
  lokasi: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z",
  grup: "M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  orang: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  bintang: "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  dokumen: "M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  grafik: "M4 13h3v7H4zM10.5 8h3v12h-3zM17 3h3v17h-3z",
  centang: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z",
  petir: "M7 2v11h3v9l7-12h-4l4-8z",
  gir: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z",
  pohon: "M17 12h2L12 2 5.05 12H7l-3.9 6h6.92v4h3.96v-4H21z",
  helm: "M12 4a8 8 0 0 0-8 8v1H2v3h20v-3h-2v-1a8 8 0 0 0-8-8zm-1.2 2.1V11h2.4V6.1A6 6 0 0 1 18 12v1H6v-1a6 6 0 0 1 4.8-5.9z",
  kunciPas: "M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z",
  timbangan: "M11 3h2v2h6l3 7a3 3 0 0 1-6 0l2.4-5.5H13V19h5v2H6v-2h5V6.5H6.6L9 12a3 3 0 0 1-6 0l3-7h5V3zM6 8.6 4.4 12h3.2L6 8.6zm12 0L16.4 12h3.2L18 8.6z",
  tukar: "M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3 5 6.99h3V14h2V6.99h3L9 3z",
  jalur: "M19 15.18V7c0-2.21-1.79-4-4-4s-4 1.79-4 4v10c0 1.1-.9 2-2 2s-2-.9-2-2V8.82C6.16 8.4 7 7.3 7 6c0-1.66-1.34-3-3-3S1 4.34 1 6c0 1.3.84 2.4 2 2.82V17c0 2.21 1.79 4 4 4s4-1.79 4-4V7c0-1.1.9-2 2-2s2 .9 2 2v8.18A3 3 0 1 0 19 15.18z",
  jaringan: "M13 22h8v-7h-3v-4h-5V9h3V2H8v7h3v2H6v4H3v7h8v-7H8v-2h8v2h-3z",
  pindai: "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  meter: "M20.38 8.57l-1.23 1.85a8 8 0 0 1-.22 7.58H5.07A8 8 0 0 1 15.58 6.85l1.85-1.23A10 10 0 0 0 3.35 19a2 2 0 0 0 1.72 1h13.85a2 2 0 0 0 1.74-1 10 10 0 0 0-.27-10.44zm-9.79 6.84a2 2 0 0 0 2.83 0l5.66-8.49-8.49 5.66a2 2 0 0 0 0 2.83z",
  jamPasir: "M6 2v6h.01L6 8.01 10 12l-4 4 .01.01H6V22h12v-5.99h-.01L18 16l-4-4 4-3.99-.01-.01H18V2H6zm10 14.5V20H8v-3.5l4-4 4 4zm-4-5-4-4V4h8v3.5l-4 4z",
  peringatan: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  lapisan: "M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z",
  naik: "M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z",
  hati: "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z",
} as const;

export type NamaIkon = keyof typeof PATH | "sasaran" | "basisdata";

interface IkonProps {
  nama: NamaIkon;
  ukuran?: number;
  warna: string;
  style?: React.CSSProperties;
}

/** Ukuran PNG simpanan — di atas ikon terbesar (50 px), jadi selalu diperkecil. */
const RASTER = 100;
const PNG = new Map<string, string>();
const kunci = (nama: NamaIkon, warna: string) => `${nama}|${warna}`;

export function Ikon({ nama, ukuran = 24, warna, style }: IkonProps) {
  const png = PNG.get(kunci(nama, warna));
  if (png) return <img src={png} width={ukuran} height={ukuran} style={{ flexShrink: 0, ...style }} alt="" />;
  return <Svg nama={nama} ukuran={ukuran} warna={warna} style={style} />;
}

function Svg({ nama, ukuran = 24, warna, style }: IkonProps) {
  return (
    <svg width={ukuran} height={ukuran} viewBox="0 0 24 24" style={{ flexShrink: 0, ...style }}>
      {nama === "sasaran" ? (
        <g fill="none" stroke={warna} strokeWidth={2.4}>
          <circle cx={11} cy={13} r={8.5} />
          <circle cx={11} cy={13} r={4.2} />
          <circle cx={11} cy={13} r={0.6} fill={warna} />
          <path d="M11 13 20.5 3.5M17 3.5h3.5V7" strokeLinecap="round" />
        </g>
      ) : nama === "basisdata" ? (
        <g fill={warna}>
          <ellipse cx={12} cy={5} rx={8} ry={3} />
          <path d="M4 7.6c1.5 1.3 4.6 2.1 8 2.1s6.5-.8 8-2.1V11c0 1.66-3.58 3-8 3s-8-1.34-8-3z" />
          <path d="M4 13.6c1.5 1.3 4.6 2.1 8 2.1s6.5-.8 8-2.1V19c0 1.66-3.58 3-8 3s-8-1.34-8-3z" />
        </g>
      ) : (
        <path d={PATH[nama]} fill={warna} />
      )}
    </svg>
  );
}

/** Kumpulkan pasangan ikon+warna di pohon elemen dengan menjalankan komponen
 *  fungsinya (semua komponen lib/gambar murni, tanpa hook). */
function kumpulkan(node: ReactNode, hasil: Map<string, IkonProps>) {
  if (Array.isArray(node)) return node.forEach((n) => kumpulkan(n, hasil));
  if (!isValidElement(node)) return;
  const props = node.props as Record<string, unknown> & { children?: ReactNode };
  if (node.type === Ikon) {
    const p = props as unknown as IkonProps;
    hasil.set(kunci(p.nama, p.warna), p);
    return;
  }
  if (typeof node.type === "function") return kumpulkan((node.type as (p: unknown) => ReactNode)(props), hasil);
  // Props berisi elemen (mis. `keterangan` Bingkai) ikut ditelusuri.
  for (const v of Object.values(props)) if (Array.isArray(v) || isValidElement(v)) kumpulkan(v as ReactNode, hasil);
}

/** Gambar ikon yang belum punya PNG. Panggil sebelum `new ImageResponse(el)`. */
export async function siapkanIkon(el: ReactNode) {
  const perlu = new Map<string, IkonProps>();
  kumpulkan(el, perlu);
  for (const [k, p] of perlu) {
    if (PNG.has(k)) continue;
    const res = new ImageResponse(
      <div style={{ display: "flex" }}>
        <Svg nama={p.nama} ukuran={RASTER} warna={p.warna} />
      </div>,
      { width: RASTER, height: RASTER },
    );
    PNG.set(k, `data:image/png;base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`);
  }
}
