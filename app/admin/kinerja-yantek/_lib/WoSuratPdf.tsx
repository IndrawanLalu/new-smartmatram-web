// Surat WO bulanan Yantek — hanya dimuat lewat import() saat PDF dibuat;
// @react-pdf/renderer tidak mendukung SSR dan berukuran besar.
/* eslint-disable jsx-a11y/alt-text -- <Image> di sini milik react-pdf (PDF), bukan <img> HTML */

import { Document, Image, Page, StyleSheet, Text, View, type Styles } from "@react-pdf/renderer";
import {
  fmtAngka, HARI_SINGKAT, isiSel, jumlahHari, kolomLampiran, labelBulan, labelTanggal, ringkasLampiran,
  type Lampiran, type PaketSurat,
} from "./woSurat";

const MERAH = "#E53935";
const HIJAU = "#43A047";
const GARIS = "#9E9E9E";
/** Lebar kolom nomor (pt). */
const NO = 16;

const S = StyleSheet.create({
  surat: { fontFamily: "Times-Roman", fontSize: 11, paddingHorizontal: 50, paddingVertical: 36, color: "#000" },
  kop: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  kopKiri: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  logo: { width: 84, height: 30, objectFit: "contain" },
  kopTeks: { fontSize: 8, fontFamily: "Times-Bold" },
  kopKanan: { fontSize: 8, fontFamily: "Times-Bold", textAlign: "right" },
  kepala: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  lbl: { width: 60 },
  baris: { flexDirection: "row" },
  isi: { marginBottom: 10 },
  wo: { flexDirection: "row", marginBottom: 2.5, fontFamily: "Times-BoldItalic" },
  woNama: { width: 290 },
  woNilai: { width: 70, textAlign: "right", fontFamily: "Times-Bold" },
  woSatuan: { marginLeft: 8, fontFamily: "Times-BoldItalic" },
  ttdBlok: { alignItems: "center", width: 200 },
  ttd: { height: 50, width: 120, objectFit: "contain", marginVertical: 4 },
  ttdKosong: { height: 58 },
  // Lampiran
  lamp: { fontFamily: "Helvetica", fontSize: 6.5, paddingHorizontal: 18, paddingVertical: 18, color: "#000" },
  lampJudul: { flex: 1, alignItems: "center" },
  judul: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  tr: { flexDirection: "row", borderLeftWidth: 0.5, borderColor: GARIS },
  sel: { borderRightWidth: 0.5, borderBottomWidth: 0.5, borderColor: GARIS, paddingHorizontal: 2, paddingVertical: 1.5, justifyContent: "center" },
  th: { backgroundColor: "#FFD966", fontFamily: "Helvetica-Bold", textAlign: "center" },
});

function Kop({ p }: { p: PaketSurat }) {
  return (
    <View style={S.kopKiri}>
      {p.logo && <Image src={p.logo} style={S.logo} />}
      <View>
        <Text style={S.kopTeks}>PT PLN (PERSERO) UIW NTB</Text>
        <Text style={S.kopTeks}>UP3 MATARAM</Text>
        <Text style={S.kopTeks}>ULP {p.ulp}</Text>
      </View>
    </View>
  );
}

function Ttd({ jabatan, nama, gambar }: { jabatan: string; nama: string | null; gambar: string | null }) {
  return (
    <View style={S.ttdBlok}>
      <Text>{jabatan}</Text>
      {gambar ? <Image src={gambar} style={S.ttd} /> : <View style={S.ttdKosong} />}
      <Text style={{ fontFamily: "Times-Bold", textDecoration: "underline" }}>{nama ?? "(............................)"}</Text>
    </View>
  );
}

function Surat({ p }: { p: PaketSurat }) {
  const s = p.set;
  const periode = labelBulan(p.tahun, p.bulan);
  const tembusan = (s.tembusan ?? "").split("\n").map((t) => t.trim()).filter(Boolean);
  return (
    <Page size="A4" style={S.surat}>
      <View style={S.kop}>
        <Kop p={p} />
        <View>
          {s.alamat && <Text style={S.kopKanan}>{s.alamat}</Text>}
          {s.telepon && <Text style={S.kopKanan}>Tlp. {s.telepon}</Text>}
          {s.kotak_pos && <Text style={S.kopKanan}>Kotak Pos : {s.kotak_pos}</Text>}
        </View>
      </View>

      <View style={S.kepala}>
        <View>
          <View style={S.baris}><Text style={S.lbl}>Nomor</Text><Text>: {p.nomor}</Text></View>
          <View style={S.baris}><Text style={S.lbl}>Lampiran</Text><Text>: 1 Berkas</Text></View>
          <View style={S.baris}><Text style={S.lbl}>Perihal</Text><Text>: Work Order YANTEK {periode}</Text></View>
        </View>
        <View style={{ width: 170 }}>
          <Text>{s.kota ?? p.ulp}, {labelTanggal(p.tglSurat)}</Text>
          <Text>Kepada Yth.</Text>
          <Text>{s.penerima ?? "............................"}</Text>
          <Text>di</Text>
          <Text style={{ marginLeft: 20 }}>{s.penerima_kota ?? "Tempat"}</Text>
        </View>
      </View>

      <Text style={S.isi}>
        Sehubungan dengan pekerjaan (Pemeliharaan Preventif dan Korektif) Pelayanan Teknik dengan pelaksana{" "}
        {s.mitra ?? "............................"}, maka kami mengirimkan Work Order pekerjaan untuk bulan {periode}{" "}
        sebagai berikut :
      </Text>

      <View style={{ marginBottom: 12 }}>
        {p.baris.map(({ jenis, nilai }, i) => (
          <View key={jenis.kunci} style={S.wo}>
            <Text style={S.woNama}>{i + 1}. {jenis.nama}</Text>
            <Text>:</Text>
            <Text style={S.woNilai}>{fmtAngka(nilai, jenis.km)}</Text>
            <Text style={S.woSatuan}>{jenis.satuan}</Text>
          </View>
        ))}
      </View>

      <Text style={S.isi}>
        Demikian kami sampaikan agar dapat dilaksanakan SLA dalam kontrak YANTEK.{"\n"}
        Untuk bon material dan pemadaman tetap berkoordinasi dengan pihak PLN ULP {p.ulp}
        {s.cq ? `\nCq. ${s.cq}` : ""}
      </Text>

      <View style={{ alignItems: "flex-end", marginTop: 6 }}>
        <Ttd jabatan={`Manager ULP ${p.ulp}`} nama={s.nama_manager} gambar={p.ttdManager} />
      </View>

      {tembusan.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text>Tembusan</Text>
          {tembusan.map((t, i) => <Text key={i}>{i + 1}. {t}</Text>)}
        </View>
      )}
    </Page>
  );
}

type Gaya = Styles[string];

function Sel({ w, children, gaya }: { w: number; children?: React.ReactNode; gaya?: Gaya }) {
  return <View style={[S.sel, { width: w }, gaya ?? {}]}><Text>{children}</Text></View>;
}

function HalamanLampiran({ p, l }: { p: PaketSurat; l: Lampiran }) {
  const n = jumlahHari(p.tahun, p.bulan);
  const hari = Array.from({ length: n }, (_, i) => i + 1);
  const kolom = kolomLampiran(l.jenis);
  // Lebar tetap untuk kolom identitas; sisanya dibagi rata ke kolom tanggal.
  const lebarTetap = NO + kolom.reduce((a, k) => a + k.pdf, 0);
  const wHari = (842 - 36 - lebarTetap) / n;
  const judul = l.jenis.nama.replace(/^WO /, "").toUpperCase();

  return (
    <Page size="A4" orientation="landscape" style={S.lamp}>
      <View style={{ flexDirection: "row", marginBottom: 8 }} fixed>
        <View style={{ width: 160 }}><Kop p={p} /></View>
        <View style={S.lampJudul}>
          <Text style={S.judul}>RENCANA KERJA {judul}</Text>
          <Text style={S.judul}>ULP {p.ulp}</Text>
          <Text style={S.judul}>BULAN {labelBulan(p.tahun, p.bulan).toUpperCase().replace(" ", " TAHUN ")}</Text>
        </View>
        <View style={{ width: 160 }} />
      </View>

      <View fixed>
        <View style={[S.tr, { borderTopWidth: 0.5 }]}>
          <Sel w={NO} gaya={S.th}>NO</Sel>
          {kolom.map((k) => <Sel key={k.isi} w={k.pdf} gaya={S.th}>{k.label}</Sel>)}
          {hari.map((d) => {
            const libur = p.libur.has(d);
            return (
              <View key={d} style={[S.sel, S.th, { width: wHari, paddingHorizontal: 0 }]}>
                <Text>{d}</Text>
                <Text style={{ fontSize: 4.5, color: libur ? MERAH : "#000" }}>
                  {HARI_SINGKAT[new Date(p.tahun, p.bulan - 1, d).getDay()]}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {l.objek.map((o, i) => (
        <View key={i} style={S.tr} wrap={false}>
          <Sel w={NO} gaya={{ alignItems: "center" }}>{i + 1}</Sel>
          {kolom.map((k) => (
            <Sel key={k.isi} w={k.pdf} gaya={k.kanan ? { alignItems: "flex-end" } : undefined}>{isiSel(o, k.isi)}</Sel>
          ))}
          {hari.map((d) => (
            <View
              key={d}
              style={[S.sel, { width: wHari, backgroundColor: l.hari[i] === d ? HIJAU : p.libur.has(d) ? MERAH : "#fff" }]}
            />
          ))}
        </View>
      ))}

      <View wrap={false}>
        <View style={{ flexDirection: "row", marginTop: 3 }}>
          <Text style={{ width: lebarTetap - 120, textAlign: "right", paddingRight: 4, fontFamily: "Helvetica-Bold" }}>
            Jumlah
          </Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>
            {ringkasLampiran(l)}
          </Text>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-around", marginTop: 14, fontFamily: "Times-Roman", fontSize: 9 }}>
          <View style={S.ttdBlok}>
            <Text> </Text>
            <Text>Mengetahui</Text>
            <Ttd jabatan="Manajer" nama={p.set.nama_manager} gambar={p.ttdManager} />
          </View>
          <View style={S.ttdBlok}>
            <Text>{p.set.kota ?? p.ulp}, {labelTanggal(p.tglSurat)}</Text>
            <Text>Dibuat Oleh</Text>
            <Ttd jabatan={p.set.jabatan_tl} nama={p.set.nama_tl} gambar={p.ttdTl} />
          </View>
        </View>
      </View>
    </Page>
  );
}

export default function WoSuratPdf({ paket }: { paket: PaketSurat }) {
  return (
    <Document title={`WO Yantek ${paket.ulp} ${labelBulan(paket.tahun, paket.bulan)}`} author="SMART Mataram">
      <Surat p={paket} />
      {paket.lampiran.map((l) => <HalamanLampiran key={l.jenis.kunci} p={paket} l={l} />)}
    </Document>
  );
}
