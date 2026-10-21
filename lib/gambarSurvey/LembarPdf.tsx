// Potongan PDF gambar survey yang dipakai bersama (usulan perbaikan JTR,
// Survey Jaringan Baru). Hanya dimuat lewat import() — @react-pdf/renderer
// besar & tanpa SSR.
/* eslint-disable jsx-a11y/alt-text -- <Image> di sini milik react-pdf (PDF), bukan <img> HTML */

import type { ReactNode } from "react";
import { Circle, Document, Image, Line, Page, Polygon, Rect, StyleSheet, Svg, Text, View, type Styles } from "@react-pdf/renderer";
import { GAMBAR_H, GAMBAR_W, skalaGrafis, type Label } from "./kertas";

export const MERAH = "#DC2626";
export const TEAL = "#00897B";
const BINGKAI = "#4B5563";
const KOLOM_W = 270;

export const S = StyleSheet.create({
  hal: { fontFamily: "Helvetica", fontSize: 7, padding: 18, color: "#111827", flexDirection: "row" },
  gambar: { width: GAMBAR_W, height: GAMBAR_H, borderWidth: 0.8, borderColor: BINGKAI, position: "relative" },
  kolom: { width: KOLOM_W, height: GAMBAR_H, marginLeft: 6, borderWidth: 0.8, borderColor: BINGKAI },
  blok: { paddingHorizontal: 7, paddingVertical: 5, borderBottomWidth: 0.6, borderColor: BINGKAI },
  kop: { flexDirection: "row", gap: 6, alignItems: "center" },
  logo: { width: 60, height: 22, objectFit: "contain" },
  kopTeks: { fontSize: 7, fontFamily: "Helvetica-Bold" },
  judul: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center" },
  subjudul: { fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "center", color: TEAL, marginTop: 1 },
  eyebrow: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#4B5563", marginBottom: 3 },
  baris: { flexDirection: "row", marginBottom: 1.5 },
  lbl: { width: 74, color: "#4B5563" },
  isi: { flex: 1 },
  tr: { flexDirection: "row", borderLeftWidth: 0.5, borderColor: "#9CA3AF" },
  sel: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: "#9CA3AF", paddingHorizontal: 2.5, paddingVertical: 1.8 },
  th: { backgroundColor: "#E0F2F1", fontFamily: "Helvetica-Bold" },
  legenda: { flexDirection: "row", alignItems: "center", marginBottom: 2.5 },
  ttd: { flexDirection: "row", justifyContent: "space-between" },
  ttdKotak: { width: 80, alignItems: "center" },
  kecil: { fontSize: 6, color: "#6B7280" },
});

export const angka = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("id-ID"));
export const tgl = (d: Date | string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
/** Belah ketupat. */
export const wajik = (x: number, y: number, r: number) => `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;

/** Gardu: segitiga dengan tiangnya (lingkaran) di tengah. */
export function SimbolGardu({ x, y, r, warna = TEAL }: { x: number; y: number; r: number; warna?: string }) {
  return (
    <>
      <Polygon points={`${x},${y - r} ${x + r * 0.95},${y + r * 0.6} ${x - r * 0.95},${y + r * 0.6}`} fill={warna} stroke="#fff" strokeWidth={0.8} />
      <Circle cx={x} cy={y + r * 0.1} r={r * 0.28} fill="#fff" stroke="#004D40" strokeWidth={0.6} />
    </>
  );
}

export function Baris({ l, v }: { l: string; v: string }) {
  return (
    <View style={S.baris}>
      <Text style={S.lbl}>{l}</Text>
      <Text style={S.isi}>{v}</Text>
    </View>
  );
}

/** Satu baris keterangan: contoh simbol 26×10 + teks. */
export function Contoh({ children, teks }: { children: ReactNode; teks: string }) {
  return (
    <View style={S.legenda}>
      <Svg width={26} height={10} viewBox="0 0 26 10">{children}</Svg>
      <Text style={{ marginLeft: 5 }}>{teks}</Text>
    </View>
  );
}

export const ContohGaris = ({ warna, tebal, putus }: { warna: string; tebal: number; putus?: boolean }) => (
  <Line x1={1} y1={5} x2={25} y2={5} stroke={warna} strokeWidth={tebal} strokeDasharray={putus ? "4 2.5" : undefined} />
);

/** Blok KETERANGAN: baris-baris Contoh + skala grafis & panah utara. */
export function Keterangan({ skalaM, children }: { skalaM: number; children: ReactNode }) {
  const sk = skalaGrafis(skalaM);
  return (
    <View style={S.blok}>
      <Text style={S.eyebrow}>KETERANGAN</Text>
      {children}
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 4, gap: 14 }}>
        <View>
          <Text style={S.kecil}>Skala grafis</Text>
          <Svg width={sk.pt + 2} height={8} viewBox={`0 0 ${sk.pt + 2} 8`}>
            <Rect x={1} y={2} width={sk.pt / 2} height={4} fill="#111827" />
            <Rect x={1 + sk.pt / 2} y={2} width={sk.pt / 2} height={4} fill="#fff" stroke="#111827" strokeWidth={0.5} />
          </Svg>
          <Text style={S.kecil}>0 — {sk.meter.toLocaleString("id-ID")} m</Text>
        </View>
        <View style={{ alignItems: "center" }}>
          <Svg width={12} height={16} viewBox="0 0 12 16"><Polygon points="6,0 11,16 6,12 1,16" fill="#111827" /></Svg>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>U</Text>
        </View>
      </View>
    </View>
  );
}

export function TabelMaterialPdf({ material }: { material: { nama: string; satuan: string; jumlah: number }[] }) {
  const kol = [16, 0, 30, 34];
  const sel = (i: number, extra: Styles[string] = {}) => [S.sel, i === 1 ? { flex: 1 } : { width: kol[i] }, extra];
  return (
    <View style={S.blok}>
      <Text style={S.eyebrow}>KEBUTUHAN MATERIAL</Text>
      <View style={[S.tr, { borderTopWidth: 0.5 }]}>
        {["No", "Material", "Sat", "Jumlah"].map((h, i) => (
          <Text key={h} style={sel(i, { ...S.th, textAlign: i === 1 ? "left" : "center" })}>{h}</Text>
        ))}
      </View>
      {material.length === 0 && (
        <View style={S.tr}><Text style={sel(1, { color: "#6B7280" })}>Belum ada material.</Text></View>
      )}
      {material.map((m, i) => (
        <View key={i} style={S.tr} wrap={false}>
          <Text style={sel(0, { textAlign: "center" })}>{i + 1}</Text>
          <Text style={sel(1)}>{m.nama}</Text>
          <Text style={sel(2, { textAlign: "center" })}>{m.satuan}</Text>
          <Text style={sel(3, { textAlign: "right" })}>{angka(m.jumlah)}</Text>
        </View>
      ))}
    </View>
  );
}

/** Kop + judul lembar. */
export function KepalaLembar({ logo, ulp, sub }: { logo: string | null; ulp: string; sub: string }) {
  return (
    <>
      <View style={S.blok}>
        <View style={S.kop}>
          {logo && <Image src={logo} style={S.logo} />}
          <View>
            <Text style={S.kopTeks}>PT PLN (PERSERO) UIW NTB</Text>
            <Text style={S.kopTeks}>UP3 MATARAM · ULP {ulp}</Text>
          </View>
        </View>
      </View>
      <View style={S.blok}>
        <Text style={S.judul}>GAMBAR SURVEY</Text>
        <Text style={S.subjudul}>{sub.toUpperCase()}</Text>
      </View>
    </>
  );
}

export function CatatanPdf({ isi }: { isi: string | null }) {
  if (!isi) return null;
  return (
    <View style={S.blok}>
      <Text style={S.eyebrow}>CATATAN</Text>
      <Text>{isi}</Text>
    </View>
  );
}

/** Tanda tangan di dasar kolom + kalimat sumber data. */
export function TandaTangan({ kaki }: { kaki: string }) {
  return (
    <View style={[S.blok, { borderBottomWidth: 0, marginTop: "auto" }]}>
      <View style={S.ttd}>
        {["Dibuat", "Diperiksa", "Disetujui"].map((x) => (
          <View key={x} style={S.ttdKotak}>
            <Text>{x}</Text>
            <View style={{ height: 34 }} />
            <Text>(.........................)</Text>
          </View>
        ))}
      </View>
      <Text style={[S.kecil, { marginTop: 5 }]}>{kaki}</Text>
    </View>
  );
}

const PENUH = { position: "absolute", left: 0, top: 0, width: GAMBAR_W, height: GAMBAR_H } as const;

/**
 * Bidang gambar: latar peta jalan, isi SVG (children), label (teks absolut —
 * alas putih di atas latar), garis penunjuk label, atribusi OSM, dan pesan
 * peringatan di pojok bawah.
 */
export function BidangGambar<J extends string>({ latar, label, warnaLabel, tebal, peringatan, children }: {
  latar: string | null;
  label: Label<J>[];
  warnaLabel: (j: J) => string;
  tebal: (j: J) => boolean;
  peringatan?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={S.gambar}>
      {latar && <Image src={latar} style={PENUH} />}
      <Svg width={GAMBAR_W} height={GAMBAR_H} viewBox={`0 0 ${GAMBAR_W} ${GAMBAR_H}`} style={PENUH}>
        {children}
        {label.map((l, i) =>
          l.tarik ? (
            <Line key={`t${i}`} x1={l.tarik.a.x} y1={l.tarik.a.y} x2={l.tarik.b.x} y2={l.tarik.b.y} stroke={warnaLabel(l.jenis)} strokeWidth={0.5} />
          ) : null,
        )}
      </Svg>
      {label.map((l, i) => (
        <Text
          key={i}
          style={{
            position: "absolute", left: l.x, top: l.y, fontSize: l.ukuran, lineHeight: 1,
            color: warnaLabel(l.jenis), fontFamily: tebal(l.jenis) ? "Helvetica-Bold" : "Helvetica",
            ...(latar ? { backgroundColor: "rgba(255,255,255,0.8)" } : {}),
          }}
        >
          {l.teks}
        </Text>
      ))}
      {latar && (
        <Text style={{ position: "absolute", right: 4, bottom: 3, fontSize: 5.5, color: "#4B5563", backgroundColor: "rgba(255,255,255,0.8)" }}>
          Latar © kontributor OpenStreetMap
        </Text>
      )}
      {peringatan && (
        <Text style={{ position: "absolute", left: 8, bottom: 6, fontSize: 7, color: MERAH }}>{peringatan}</Text>
      )}
    </View>
  );
}

/** Satu halaman A3 mendatar: bidang gambar kiri, kolom kanan. */
export function Lembar({ judul, gambar, kolom }: { judul: string; gambar: ReactNode; kolom: ReactNode }) {
  return (
    <Document title={judul}>
      <Page size="A3" orientation="landscape" style={S.hal}>
        {gambar}
        <View style={S.kolom}>{kolom}</View>
      </Page>
    </Document>
  );
}
