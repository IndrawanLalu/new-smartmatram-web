// Gambar survey usulan perbaikan JTR — hanya dimuat lewat import() saat PDF
// dibuat (@react-pdf/renderer besar & tanpa SSR). Hitungan gambar di gambarSurvey.ts.
/* eslint-disable jsx-a11y/alt-text -- <Image> di sini milik react-pdf (PDF), bukan <img> HTML */

import { Circle, Document, Image, Line, Page, Polygon, Polyline, Rect, StyleSheet, Svg, Text, View, type Styles } from "@react-pdf/renderer";
import type { UsulanJtr } from "../_hooks/useUsulanJtr";
import { GAMBAR_H, GAMBAR_W, skalaGrafis, type Gambar, type JenisLabel } from "./gambarSurvey";
import { LABEL_RENCANA } from "./rencanaJtr";

const GARIS = { lain: "#B0B8C4", utama: "#1F2937", pindah: "#7C3AED" } as const;
const TEBAL = { lain: 0.7, utama: 1.3, pindah: 1.6 } as const;
const MERAH = "#DC2626";
const TEAL = "#00897B";
const BINGKAI = "#4B5563";
const WARNA_LABEL: Record<JenisLabel, string> = {
  kabel: MERAH,
  pecah: MERAH,
  sisip: MERAH,
  gardu: TEAL,
  jurusan: "#111827",
  tiang: "#1F2937",
  "tiang-lain": "#9CA3AF",
};
const LABEL_TEBAL: JenisLabel[] = ["kabel", "pecah", "sisip", "gardu", "jurusan"];
const KOLOM_W = 270;

const S = StyleSheet.create({
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

const angka = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("id-ID"));
const tgl = (d: Date | string) => new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

function Baris({ l, v }: { l: string; v: string }) {
  return (
    <View style={S.baris}>
      <Text style={S.lbl}>{l}</Text>
      <Text style={S.isi}>{v}</Text>
    </View>
  );
}

function Contoh({ children, teks }: { children: React.ReactNode; teks: string }) {
  return (
    <View style={S.legenda}>
      <Svg width={26} height={10} viewBox="0 0 26 10">{children}</Svg>
      <Text style={{ marginLeft: 5 }}>{teks}</Text>
    </View>
  );
}

function Legenda({ g, jurusan, garduKode }: { g: Gambar; jurusan: string; garduKode: string }) {
  const sk = skalaGrafis(g.skala);
  return (
    <View style={S.blok}>
      <Text style={S.eyebrow}>KETERANGAN</Text>
      <Contoh teks={`Kabel jurusan ${jurusan} (yang ada)`}><Line x1={1} y1={5} x2={25} y2={5} stroke={GARIS.utama} strokeWidth={TEBAL.utama} /></Contoh>
      {g.pecah && (
        <Contoh teks="Pindah ke jurusan baru"><Line x1={1} y1={5} x2={25} y2={5} stroke={GARIS.pindah} strokeWidth={TEBAL.pindah} /></Contoh>
      )}
      {g.kabelBaru.length > 1 && (
        <Contoh teks="Jalur kabel baru (rencana)"><Line x1={1} y1={5} x2={25} y2={5} stroke={MERAH} strokeWidth={1.4} strokeDasharray="4 2.5" /></Contoh>
      )}
      <Contoh teks="Kabel jurusan lain"><Line x1={1} y1={5} x2={25} y2={5} stroke={GARIS.lain} strokeWidth={TEBAL.lain} /></Contoh>
      <Contoh teks={`Tiang (kode tanpa awalan ${garduKode}-)`}><Circle cx={13} cy={5} r={2} fill="#fff" stroke={GARIS.utama} strokeWidth={0.7} /></Contoh>
      <Contoh teks="Gardu"><Rect x={9} y={1} width={8} height={8} fill={TEAL} /></Contoh>
      {g.pecah && <Contoh teks="Titik pecah"><Circle cx={13} cy={5} r={4} fill="none" stroke={MERAH} strokeWidth={1.2} /></Contoh>}
      {g.sisip && <Contoh teks="Usulan gardu sisip"><Polygon points="13,1 18,9 8,9" fill={MERAH} /></Contoh>}
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

function Material({ u }: { u: UsulanJtr }) {
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
      {u.material.length === 0 && (
        <View style={S.tr}><Text style={sel(1, { color: "#6B7280" })}>Belum ada material.</Text></View>
      )}
      {u.material.map((m, i) => (
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

function Kolom({ u, g, garduNama, logo }: Props) {
  const o = u.opsi;
  const d = u.dasar;
  return (
    <View style={S.kolom}>
      <View style={S.blok}>
        <View style={S.kop}>
          {logo && <Image src={logo} style={S.logo} />}
          <View>
            <Text style={S.kopTeks}>PT PLN (PERSERO) UIW NTB</Text>
            <Text style={S.kopTeks}>UP3 MATARAM · ULP {u.ulp}</Text>
          </View>
        </View>
      </View>
      <View style={S.blok}>
        <Text style={S.judul}>GAMBAR SURVEY</Text>
        <Text style={S.subjudul}>{LABEL_RENCANA[u.pekerjaan].toUpperCase()}</Text>
      </View>
      <View style={S.blok}>
        <Baris l="Gardu" v={[u.gardu_kode, garduNama].filter(Boolean).join(" — ")} />
        <Baris l="Penyulang" v={u.penyulang ?? "—"} />
        <Baris l="Jurusan" v={u.jurusan} />
        <Baris l="Trafo" v={`${angka(d.kva)} kVA · beban ${angka(d.persen_beban)}%`} />
        <Baris l="Arus R/S/T" v={`${angka(d.a_r)} / ${angka(d.a_s)} / ${angka(d.a_t)} A (ukur ${d.tanggal_pengukuran ?? "—"})`} />
        <Baris l="Kabel" v={`${d.kabel ?? "—"} · terjauh ${angka(d.terjauh_m)} m · ${angka(d.jumlah_sr)} SR`} />
        {o && (
          <>
            <Baris l="Titik pecah" v={`${o.titikKode ?? "—"}, cabang ${o.cabangKode ?? "—"} pindah`} />
            <Baris l="Kabel baru" v={`± ${angka(o.kabelBaru)} m (${angka(o.tiangLintas)} tiang dilalui)`} />
            <Baris l="Arus sesudah" v={`jurusan baru ${angka(o.iBaru)} A · lama ${angka(o.iLama)} A`} />
            <Baris l="Pindah" v={`${angka(o.tiangPindah)} tiang · ${angka(o.srPindah)} SR`} />
            <Baris l="Tegangan" v={`jatuh tegangan terburuk turun ± ${angka(o.turunPct)}%`} />
          </>
        )}
        <Text style={{ marginTop: 2, fontFamily: "Helvetica-Oblique" }}>{u.ringkas}</Text>
      </View>
      <Material u={u} />
      <Legenda g={g} jurusan={u.jurusan} garduKode={u.gardu_kode} />
      {u.catatan && (
        <View style={S.blok}>
          <Text style={S.eyebrow}>CATATAN</Text>
          <Text>{u.catatan}</Text>
        </View>
      )}
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
        <Text style={[S.kecil, { marginTop: 5 }]}>
          Diusulkan {u.dibuat_oleh ?? "—"}, {tgl(u.dibuat_at)} · dicetak {tgl(new Date())}. Posisi tiang menurut koordinat data JTR SMART — pastikan di lapangan.
        </Text>
      </View>
    </View>
  );
}

const PENUH = { position: "absolute", left: 0, top: 0, width: GAMBAR_W, height: GAMBAR_H } as const;

function Jtr({ g, latar }: { g: Gambar; latar: string | null }) {
  return (
    <View style={S.gambar}>
      {latar && <Image src={latar} style={PENUH} />}
      <Svg width={GAMBAR_W} height={GAMBAR_H} viewBox={`0 0 ${GAMBAR_W} ${GAMBAR_H}`} style={PENUH}>
        {g.garis.map((x, i) => (
          <Line key={i} x1={x.a.x} y1={x.a.y} x2={x.b.x} y2={x.b.y} stroke={GARIS[x.jenis]} strokeWidth={TEBAL[x.jenis]} />
        ))}
        {g.kabelBaru.length > 1 && (
          <Polyline points={g.kabelBaru.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={MERAH} strokeWidth={1.4} strokeDasharray="5 3" />
        )}
        {g.tiang.map((t) => (
          <Circle
            key={t.id} cx={t.x} cy={t.y} r={t.jenis === "lain" ? 1.5 : 2}
            fill={t.jenis === "pindah" ? GARIS.pindah : "#fff"} stroke={GARIS[t.jenis]} strokeWidth={0.7}
          />
        ))}
        {g.pecah && <Circle cx={g.pecah.x} cy={g.pecah.y} r={5.5} fill="none" stroke={MERAH} strokeWidth={1.4} />}
        {g.sisip && <Polygon points={`${g.sisip.x},${g.sisip.y - 6} ${g.sisip.x + 6},${g.sisip.y + 5} ${g.sisip.x - 6},${g.sisip.y + 5}`} fill={MERAH} />}
        {g.gardu && <Rect x={g.gardu.x - 5} y={g.gardu.y - 5} width={10} height={10} fill={TEAL} />}
        {g.label.map((l, i) =>
          l.tarik ? (
            <Line key={`t${i}`} x1={l.tarik.a.x} y1={l.tarik.a.y} x2={l.tarik.b.x} y2={l.tarik.b.y} stroke={WARNA_LABEL[l.jenis]} strokeWidth={0.5} />
          ) : null,
        )}
      </Svg>
      {g.label.map((l, i) => (
        <Text
          key={i}
          style={{
            position: "absolute", left: l.x, top: l.y, fontSize: l.ukuran, lineHeight: 1,
            color: WARNA_LABEL[l.jenis], fontFamily: LABEL_TEBAL.includes(l.jenis) ? "Helvetica-Bold" : "Helvetica",
            // Di atas peta jalan, tulisan diberi alas putih supaya tetap terbaca.
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
      {g.hilang && (
        <Text style={{ position: "absolute", left: 8, bottom: 6, fontSize: 7, color: MERAH }}>
          Sebagian tiang usulan sudah tidak ada di data JTR sekarang — JTR berubah sejak usulan disimpan.
        </Text>
      )}
    </View>
  );
}

interface Props {
  u: UsulanJtr;
  g: Gambar;
  garduNama: string | null;
  logo: string | null;
  /** Latar peta jalan (JPEG data URL); null = latar putih. */
  latar: string | null;
}

export default function GambarSurveyPdf(p: Props) {
  return (
    <Document title={`Gambar survey ${p.u.gardu_kode}-${p.u.jurusan}`}>
      <Page size="A3" orientation="landscape" style={S.hal}>
        <Jtr g={p.g} latar={p.latar} />
        <Kolom {...p} />
      </Page>
    </Document>
  );
}
