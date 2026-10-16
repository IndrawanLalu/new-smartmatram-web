/* eslint-disable @next/next/no-img-element -- dirender next/og jadi PNG, bukan halaman; next/image tidak berlaku di sini. */
import type React from "react";
import type { GambarBingkai } from "./aset";
import { C, G_LEBAR, G_TINGGI, HURUF, HURUF_JUDUL, HURUF_TANGAN } from "./gaya";
import { Ikon, type NamaIkon } from "./ikon";

/**
 * Bingkai tetap semua gambar laporan: header, pita keterangan, footer.
 * Yang berubah per laporan hanya props-nya (Promt.md, Instruksi Final).
 *
 * Aturan `next/og` (Satori) yang berlaku di semua berkas lib/gambar:
 * elemen dengan lebih dari satu anak WAJIB `display: flex`, tidak ada grid,
 * `<br>`, mask, clip-path, atau filter. Posisi absolut dihitung dari induk
 * langsungnya.
 */

export const TINGGI_HEADER = 140;
export const ATAS_ISI = 205;
export const TINGGI_FOOTER = 112;

interface Meta {
  ikon: NamaIkon;
  teks: string;
}

interface BingkaiProps {
  gambar: GambarBingkai;
  /** Nama unit di blok PLN, mis. "ULP AMPENAN". */
  unit: string;
  judul: string;
  /** Bagian judul berwarna kuning, di belakang `judul`. */
  judulAksen?: string;
  meta: Meta[];
  /** Isi pita putih di bawah header — cara membaca laporan. */
  keterangan: React.ReactNode;
  children: React.ReactNode;
}

export function Bingkai({ gambar, unit, judul, judulAksen, meta, keterangan, children }: BingkaiProps) {
  return (
    <div
      style={{
        width: G_LEBAR, height: G_TINGGI, display: "flex", position: "relative", fontFamily: HURUF, color: C.tinta,
        background: `linear-gradient(180deg, ${C.biruLangit} 0%, #EEF5FC 45%, #F4F8FC 100%)`,
      }}
    >
      <Header gambar={gambar} unit={unit} judul={judul} judulAksen={judulAksen} meta={meta} />
      <div
        style={{
          position: "absolute", top: 150, left: 28, height: 46, display: "flex", alignItems: "center", gap: 14,
          padding: "0 30px 0 16px", borderRadius: 23, background: C.putih, border: "1px solid #C6DBF3",
          fontSize: 22, fontWeight: 700, color: C.navy,
        }}
      >
        <Ikon nama="sasaran" ukuran={30} warna={C.navy} />
        {keterangan}
      </div>
      {children}
      <Footer logoSmart={gambar.logoSmart} />
    </div>
  );
}

function Header({ gambar, unit, judul, judulAksen, meta }: Omit<BingkaiProps, "keterangan" | "children">) {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, width: G_LEBAR, height: 200, display: "flex" }}>
      {/* Foto teknisi — sudah dipotong & dipudarkan di berkasnya. */}
      <img src={gambar.foto} width={440} height={198} style={{ position: "absolute", top: 0, right: 0 }} alt="" />
      <div
        style={{
          position: "absolute", top: 0, left: 0, width: 1560, height: TINGGI_HEADER,
          background: `linear-gradient(90deg, ${C.navyTua} 0%, ${C.navy} 78%, rgba(11,58,134,0) 100%)`,
        }}
      />
      {/* Blok PLN — biru lebih terang, ujung kanan miring (badan + segitiga miring). */}
      <div style={{ position: "absolute", top: 0, left: 0, width: 575, height: TINGGI_HEADER, display: "flex", overflow: "hidden" }}>
        <div
          style={{
            position: "absolute", top: -20, bottom: -20, left: -60, width: 640,
            background: `linear-gradient(180deg, ${C.biru} 0%, ${C.navy} 100%)`,
            transform: "skewX(-16deg)", transformOrigin: "top left",
          }}
        />
      </div>
      <div style={{ position: "absolute", top: 0, left: 536, width: 8, height: TINGGI_HEADER, background: C.biruTerang, transform: "skewX(-15deg)", transformOrigin: "top" }} />
      <div style={{ position: "absolute", top: 34, left: 40, display: "flex", alignItems: "center", color: C.putih }}>
        <img src={gambar.logoPln} width={70} height={70} alt="" />
        <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: 9, marginLeft: 18 }}>PLN</div>
        <div style={{ width: 2, height: 60, background: "rgba(255,255,255,.55)", margin: "0 22px 0 14px" }} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: HURUF_JUDUL, fontSize: 36, fontWeight: 700, lineHeight: 1 }}>{unit}</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6, opacity: 0.9 }}>Bersama untuk Listrik yang Lebih Baik</div>
        </div>
      </div>

      <div style={{ position: "absolute", top: 14, left: 590, display: "flex", flexDirection: "column", color: C.putih }}>
        <div style={{ display: "flex", fontFamily: HURUF_JUDUL, fontSize: 64, fontWeight: 800, lineHeight: 1, letterSpacing: 0.5 }}>
          {judul}
          {judulAksen && <span style={{ color: C.kuning, marginLeft: 14 }}>{judulAksen}</span>}
        </div>
        <div style={{ display: "flex", gap: 30, marginTop: 16, fontSize: 21, fontWeight: 600 }}>
          {meta.map((m) => (
            <div key={m.teks} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <Ikon nama={m.ikon} ukuran={25} warna={C.putih} />
              {m.teks}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute", top: 20, right: 22, display: "flex", flexDirection: "column",
          transform: "rotate(-9deg)", transformOrigin: "right top",
          fontFamily: HURUF_TANGAN, fontWeight: 700, fontSize: 27, lineHeight: 1.08, color: C.putih,
          textShadow: "0 2px 0 rgba(7,31,78,.6)",
        }}
      >
        <span>Kerja Aman</span>
        <span>Listrik Andal</span>
        <span>Pelayanan Prima</span>
        <div style={{ height: 5, width: 190, marginTop: 4, marginLeft: 20, borderRadius: 3, background: C.kuning, transform: "rotate(-3deg)" }} />
      </div>
    </div>
  );
}

const NILAI: [NamaIkon, string, string][] = [
  ["petir", "Profesional", "Dalam setiap tindakan"],
  ["gir", "Integritas", "Dalam setiap keputusan"],
  ["hati", "Pelayanan Prima", "Untuk pelanggan"],
];

function Footer({ logoSmart }: { logoSmart: string }) {
  return (
    <div
      style={{
        position: "absolute", left: 0, bottom: 0, width: G_LEBAR, height: TINGGI_FOOTER, display: "flex", overflow: "hidden",
        background: `linear-gradient(90deg, ${C.navyTua} 0%, ${C.navy} 60%, ${C.navyTua} 100%)`,
      }}
    >
      <div style={{ position: "absolute", left: 56, top: 0, height: TINGGI_FOOTER, display: "flex", alignItems: "center", color: C.putih }}>
        {NILAI.map(([ikon, judul, sub], i) => (
          <div
            key={judul}
            style={{ display: "flex", alignItems: "center", gap: 20, padding: "0 46px", borderLeft: i ? "2px solid rgba(255,255,255,.35)" : "none" }}
          >
            <Ikon nama={ikon} ukuran={50} warna={C.putih} />
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ fontSize: 23, fontWeight: 700 }}>{judul}</div>
              <div style={{ fontSize: 18, fontWeight: 500, opacity: 0.85, marginTop: 2 }}>{sub}</div>
            </div>
          </div>
        ))}
      </div>
      {/* Aksen diagonal kanan: biru terang + kuning. */}
      <div style={{ position: "absolute", top: -10, height: TINGGI_FOOTER + 20, left: 1420, width: 26, background: C.biruTerang, transform: "skewX(-38deg)" }} />
      <div style={{ position: "absolute", top: -10, height: TINGGI_FOOTER + 20, left: 1454, width: 20, background: C.kuning, transform: "skewX(-38deg)" }} />
      <div style={{ position: "absolute", top: -10, height: TINGGI_FOOTER + 20, left: 1482, width: 560, background: C.navy, transform: "skewX(-38deg)" }} />
      <div style={{ position: "absolute", right: 46, top: 0, height: TINGGI_FOOTER, display: "flex", alignItems: "center", gap: 14, color: C.putih }}>
        <img src={logoSmart} width={66} height={66} alt="" />
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 0.3 }}>SMART Mataram</div>
      </div>
    </div>
  );
}
