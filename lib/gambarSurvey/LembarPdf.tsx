// Potongan PDF gambar survey yang dipakai bersama (usulan perbaikan JTR,
// Survey Jaringan Baru). Hanya dimuat lewat import() — @react-pdf/renderer
// besar & tanpa SSR.
//
// Tata letak A3 mendatar: bidang gambar (kiri atas) + kolom data & material
// (kanan atas) + BLOK JUDUL selebar kertas di bawah, mengikuti format gambar
// teknik unit (contohAset/Legenda.png): skala & pengesah dengan tanggal/parap,
// kotak keterangan simbol, judul rencana, kop PLN, nomor lembar & nomor.
/* eslint-disable jsx-a11y/alt-text -- <Image> di sini milik react-pdf (PDF), bukan <img> HTML */

import type { ReactNode } from "react";
import { Circle, Document, Image, Line, Page, Polygon, Rect, StyleSheet, Svg, Text, View, type Styles } from "@react-pdf/renderer";
import { GAMBAR_H, GAMBAR_W, skalaGrafis, type Label } from "./kertas";
import type { LogoLembar } from "./latar";

export const MERAH = "#DC2626";
export const TEAL = "#00897B";
const HITAM = "#111827";
const KOLOM_W = 270;
/** Lebar isi halaman (A3 mendatar 1190,55 pt − 2×18 tepi). */
const ISI_W = GAMBAR_W + 6 + KOLOM_W;
/** Lebar bagian pengesah di blok judul (label · : · nama · tanggal · parap). */
const KIRI_W = 470;
const GARIS = { borderColor: HITAM, borderWidth: 0.8 } as const;

export const S = StyleSheet.create({
  hal: { fontFamily: "Helvetica", fontSize: 7, padding: 18, color: HITAM },
  atas: { flexDirection: "row" },
  gambar: { width: GAMBAR_W, height: GAMBAR_H, ...GARIS, position: "relative" },
  kolom: { width: KOLOM_W, height: GAMBAR_H, marginLeft: 6, ...GARIS },
  blok: { paddingHorizontal: 7, paddingVertical: 5, borderBottomWidth: 0.6, borderColor: "#4B5563" },
  eyebrow: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#4B5563", marginBottom: 3 },
  baris: { flexDirection: "row", marginBottom: 1.5 },
  lbl: { width: 74, color: "#4B5563" },
  isi: { flex: 1 },
  tr: { flexDirection: "row", borderLeftWidth: 0.5, borderColor: "#9CA3AF" },
  sel: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: "#9CA3AF", paddingHorizontal: 2.5, paddingVertical: 1.8 },
  th: { backgroundColor: "#E0F2F1", fontFamily: "Helvetica-Bold" },
  legenda: { flexDirection: "row", alignItems: "center", width: 205, marginBottom: 2.5 },
  kecil: { fontSize: 6, color: "#6B7280" },
  // Blok judul
  judulBlok: { width: ISI_W, marginTop: 6, ...GARIS },
  bjAtas: { flexDirection: "row", borderBottomWidth: 0.8, borderColor: HITAM },
  bjKiri: { width: KIRI_W, borderRightWidth: 0.8, borderColor: HITAM },
  bjBaris: { flexDirection: "row", height: 13, borderBottomWidth: 0.5, borderColor: HITAM, alignItems: "center" },
  bjSel: { height: "100%", justifyContent: "center", paddingHorizontal: 3, borderRightWidth: 0.5, borderColor: HITAM },
  bjKet: { flex: 1, padding: 4 },
  bjJudul: { height: 34, justifyContent: "center", paddingHorizontal: 8, borderBottomWidth: 0.8, borderColor: HITAM },
  bjBawah: { flexDirection: "row", height: 40 },
});

export const angka = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("id-ID"));
export const tgl = (d: Date | string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
const tglPendek = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "2-digit", year: "numeric" }) : "");
/** Belah ketupat. */
export const wajik = (x: number, y: number, r: number) => `${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`;

/** Gardu: segitiga dengan tiangnya (lingkaran) di tengah, berjarak dari sisinya. */
export function SimbolGardu({ x, y, r, warna = TEAL }: { x: number; y: number; r: number; warna?: string }) {
  return (
    <>
      <Polygon points={`${x},${y - r} ${x + r * 0.95},${y + r * 0.6} ${x - r * 0.95},${y + r * 0.6}`} fill={warna} stroke="#fff" strokeWidth={0.6} />
      <Circle cx={x} cy={y + r * 0.08} r={r * 0.2} fill="#fff" />
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
      <Text style={{ marginLeft: 5, flex: 1 }}>{teks}</Text>
    </View>
  );
}

export const ContohGaris = ({ warna, tebal, putus }: { warna: string; tebal: number; putus?: boolean }) => (
  <Line x1={1} y1={5} x2={25} y2={5} stroke={warna} strokeWidth={tebal} strokeDasharray={putus ? "4 2.5" : undefined} />
);

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

export function CatatanPdf({ isi }: { isi: string | null }) {
  if (!isi) return null;
  return (
    <View style={S.blok}>
      <Text style={S.eyebrow}>CATATAN</Text>
      <Text>{isi}</Text>
    </View>
  );
}

const PENUH = { position: "absolute", left: 0, top: 0, width: GAMBAR_W, height: GAMBAR_H } as const;

/**
 * Bidang gambar: latar peta, isi SVG (children), label (teks absolut — alas
 * putih di atas latar), garis penunjuk label, atribusi latar, dan pesan
 * peringatan di pojok bawah.
 */
export function BidangGambar<J extends string>({
  latar, atribusi = "Latar © kontributor OpenStreetMap", label, warnaLabel, tebal, peringatan, children,
}: {
  latar: string | null;
  /** Sumber ubin latar (peta jalan / citra satelit). */
  atribusi?: string;
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
          {atribusi}
        </Text>
      )}
      {peringatan && (
        <Text style={{ position: "absolute", left: 8, bottom: 6, fontSize: 7, color: MERAH }}>{peringatan}</Text>
      )}
    </View>
  );
}

/** Skala angka saat dicetak A3 100% (1 pt = 0,3528 mm), dibulatkan ke 50. */
const skalaCetak = (skalaM: number) => Math.max(50, Math.round(1000 / (skalaM * 0.35278) / 50) * 50);

export interface Pengesah {
  label: string;
  nama: string | null;
  tanggal?: string | null;
}

interface BlokJudulProps {
  skalaM: number;
  judul: string;
  logo: LogoLembar;
  ulp: string;
  pengesah: Pengesah[];
  /** Baris-baris <Contoh> — disusun berkolom di kotak Keterangan. */
  keterangan: ReactNode;
  nomor?: string | null;
  lembar?: string;
}

function BlokJudul({ skalaM, judul, logo, ulp, pengesah, keterangan, nomor, lembar = "1" }: BlokJudulProps) {
  const sk = skalaGrafis(skalaM);
  const kol = { lbl: 72, titik: 8, nama: 210, tgl: 100 };
  const sel = (w: number | null, isi: ReactNode, extra: Styles[string] = {}) => (
    <View style={[S.bjSel, w === null ? { flex: 1, borderRightWidth: 0 } : { width: w }, extra]}>
      {typeof isi === "string" ? <Text>{isi}</Text> : isi}
    </View>
  );
  return (
    <View style={S.judulBlok}>
      <View style={S.bjAtas}>
        <View style={S.bjKiri}>
          <View style={S.bjBaris}>
            {sel(kol.lbl, "Skala")}
            {sel(kol.titik, ":", { borderRightWidth: 0 })}
            {sel(kol.nama, `1 : ${skalaCetak(skalaM).toLocaleString("id-ID")} (cetak A3)`)}
            {sel(kol.tgl, "Tanggal", { alignItems: "center" })}
            {sel(null, "Parap", { alignItems: "center" })}
          </View>
          {pengesah.map((p, i) => (
            <View key={p.label} style={[S.bjBaris, i === pengesah.length - 1 ? { borderBottomWidth: 0 } : {}]}>
              {sel(kol.lbl, p.label)}
              {sel(kol.titik, ":", { borderRightWidth: 0 })}
              {sel(kol.nama, <Text style={{ fontFamily: "Times-Roman", fontSize: 8 }}>{p.nama ?? ""}</Text>)}
              {sel(kol.tgl, tglPendek(p.tanggal), { alignItems: "center" })}
              {sel(null, "")}
            </View>
          ))}
        </View>
        <View style={S.bjKet}>
          <Text style={{ marginBottom: 3 }}>Keterangan</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {keterangan}
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, width: 205 }}>
              <View>
                <Text style={S.kecil}>Skala grafis</Text>
                <Svg width={sk.pt + 2} height={8} viewBox={`0 0 ${sk.pt + 2} 8`}>
                  <Rect x={1} y={2} width={sk.pt / 2} height={4} fill={HITAM} />
                  <Rect x={1 + sk.pt / 2} y={2} width={sk.pt / 2} height={4} fill="#fff" stroke={HITAM} strokeWidth={0.5} />
                </Svg>
                <Text style={S.kecil}>0 — {sk.meter.toLocaleString("id-ID")} m</Text>
              </View>
              <View style={{ alignItems: "center" }}>
                <Svg width={10} height={13} viewBox="0 0 12 16"><Polygon points="6,0 11,16 6,12 1,16" fill={HITAM} /></Svg>
                <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 6 }}>U</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
      <View style={S.bjJudul}>
        <Text style={{ fontFamily: "Times-Bold", fontSize: 13, textAlign: "center" }}>{judul}</Text>
      </View>
      <View style={S.bjBawah}>
        <View style={{ width: KIRI_W - 60, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 6, borderRightWidth: 0.8, borderColor: HITAM }}>
          {logo.pln && <Image src={logo.pln} style={{ width: 52, height: 30, objectFit: "contain" }} />}
          <View style={{ gap: 2 }}>
            <Text>PT PLN (Persero) UIW NTB</Text>
            <Text>UP3 Mataram</Text>
            <Text>ULP {ulp}</Text>
          </View>
        </View>
        <View style={{ width: 60, alignItems: "center", justifyContent: "center", borderRightWidth: 0.8, borderColor: HITAM }}>
          <Text style={{ fontSize: 12 }}>{lembar}</Text>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 6, paddingVertical: 3, flexDirection: "row", justifyContent: "space-between" }}>
          <Text>Nomor : {nomor ?? ""}</Text>
          {/* SMART = sistem pembuat gambar: kecil di pojok, tidak menyaingi kop PLN. */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            {logo.smart && <Image src={logo.smart} style={{ width: 30, height: 30, objectFit: "contain" }} />}
            <Text style={S.kecil}>Dibuat dengan SMART Mataram</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

/** Satu halaman A3 mendatar: bidang gambar + kolom kanan di atas, blok judul di bawah. */
export function Lembar({ judul, gambar, kolom, blok }: { judul: string; gambar: ReactNode; kolom: ReactNode; blok: BlokJudulProps }) {
  return (
    <Document title={judul}>
      <Page size="A3" orientation="landscape" style={S.hal}>
        <View style={S.atas}>
          {gambar}
          <View style={S.kolom}>{kolom}</View>
        </View>
        <BlokJudul {...blok} />
      </Page>
    </Document>
  );
}

/** Kalimat kecil sumber data, di dasar kolom kanan. */
export function SumberData({ teks }: { teks: string }) {
  return <Text style={[S.kecil, { marginTop: "auto", padding: 6 }]}>{teks}</Text>;
}
