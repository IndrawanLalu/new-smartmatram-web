// Gambar survey Rekonduktor JTR — hanya dimuat lewat import().
// Hitungan di gambarRekonduktor.ts; lembar & potongan bersama di lib/gambarSurvey.
/* eslint-disable jsx-a11y/alt-text -- <Image> di sini milik react-pdf (PDF), bukan <img> HTML */

import { Circle, Image, Line, Polyline, Text, View, type Styles } from "@react-pdf/renderer";
import {
  angka, Baris, BidangGambar, CatatanPdf, Contoh, ContohGaris, Lembar, S, SimbolGardu, SumberData, TabelMaterialPdf, TEAL, tgl,
} from "@/lib/gambarSurvey/LembarPdf";
import type { LogoLembar } from "@/lib/gambarSurvey/latar";
import { ITEM_TIANG, jumlahItem, LABEL_ITEM, namaKabel, panjangRuas, ujungRuas } from "@/lib/rekonduktorJtr";
import type { SurveyJaringan } from "@/lib/surveyJaringan";
import { FOTO_PDF_W, ukuranFotoPdf, type FotoPdf } from "./fotoPdf";
import type { GambarRekon, JenisLabelRekon } from "./gambarRekonduktor";

const LAMA = "#94A3B8";
const MERAH = "#DC2626";
const WARNA_LABEL: Record<JenisLabelRekon, string> = { gardu: TEAL, ruas: MERAH, kode: "#991B1B", panjang: "#B91C1C", lain: LAMA };
const TIPIS: JenisLabelRekon[] = ["panjang", "lain"];

function Bidang({ g, latar, citra }: { g: GambarRekon; latar: string | null; citra: boolean }) {
  return (
    <BidangGambar
      latar={latar} label={g.label} warnaLabel={(j) => WARNA_LABEL[j]} tebal={(j) => !TIPIS.includes(j)}
      atribusi={citra ? "Latar © Esri, Maxar, Earthstar Geographics" : undefined}
    >
      {g.lama.map((x, i) => <Line key={`l${i}`} x1={x.a.x} y1={x.a.y} x2={x.b.x} y2={x.b.y} stroke={LAMA} strokeWidth={0.9} />)}
      {g.tiangLama.map((t) => <Circle key={t.id} cx={t.x} cy={t.y} r={2} fill="#fff" stroke={LAMA} strokeWidth={0.7} />)}
      {g.ruas.map((gs, i) => (
        <Polyline key={`r${i}`} points={gs.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={MERAH} strokeWidth={2} strokeDasharray="6 3" />
      ))}
      {g.tiangRuas.map((t) => <Circle key={t.id} cx={t.x} cy={t.y} r={2.8} fill="#fff" stroke={MERAH} strokeWidth={1} />)}
      {g.gardu && <SimbolGardu x={g.gardu.x} y={g.gardu.y} r={6} />}
    </BidangGambar>
  );
}

function Foto({ foto }: { foto: FotoPdf[] }) {
  if (!foto.length) return null;
  return (
    <View style={S.blok}>
      <Text style={S.eyebrow}>FOTO KONDISI LAPANGAN</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
        {foto.map((f) => (
          <View key={f.nomor} style={{ width: FOTO_PDF_W }}>
            <Image src={f.src} style={ukuranFotoPdf(f.rasio)} />
            <Text style={[S.kecil, { marginTop: 1 }]}>{`Foto ${f.nomor}${f.ket ? ` — ${f.ket}` : ""}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Halaman 2: isian per tiang setiap ruas — dasar material. */
function RincianTiang({ s }: { s: SurveyJaringan }) {
  const kol = [24, 110, 60, ...ITEM_TIANG.map(() => 46)];
  const sel = (i: number, extra: Styles[string] = {}): Styles[string][] => [S.sel, { width: kol[i], textAlign: i === 1 ? "left" : "center" }, extra];
  const kepala = ["No", "Tiang", "Gawang (m)", ...ITEM_TIANG.map((k) => LABEL_ITEM[k].panjang)];
  return (
    <View>
      <Text style={[S.eyebrow, { fontSize: 9 }]}>{`RINCIAN PER TIANG — ${s.judul.toUpperCase()}`}</Text>
      {s.ruas.map((r, n) => (
        <View key={r.id} style={{ marginBottom: 10 }}>
          <Text style={[S.eyebrow, { marginTop: 4 }]}>
            {`RUAS ${n + 1}${r.jurusan ? ` · JURUSAN ${r.jurusan}` : ""} · ${ujungRuas(r, s.gardu_kode)} · ${r.kabel_lama ?? "kabel lama ?"} → ${namaKabel(r) || "pengganti ?"}`}
          </Text>
          <View style={[S.tr, { borderTopWidth: 0.5 }]} fixed>
            {kepala.map((h, i) => <Text key={h} style={sel(i, S.th)}>{h}</Text>)}
          </View>
          {r.tiang.map((t, i) => (
            <View key={t.tiang_id} style={S.tr} wrap={false}>
              <Text style={sel(0)}>{i + 1}</Text>
              <Text style={sel(1)}>{t.kode ?? "?"}</Text>
              <Text style={sel(2)}>{t.panjang_m ? angka(t.panjang_m) : "—"}</Text>
              {ITEM_TIANG.map((k, j) => <Text key={k} style={sel(3 + j)}>{t[k] || "—"}</Text>)}
            </View>
          ))}
          <View style={S.tr} wrap={false}>
            <Text style={sel(0, S.th)}> </Text>
            <Text style={sel(1, S.th)}>Jumlah</Text>
            <Text style={sel(2, S.th)}>{angka(panjangRuas(r))}</Text>
            {ITEM_TIANG.map((k, j) => <Text key={k} style={sel(3 + j, S.th)}>{jumlahItem(r, k)}</Text>)}
          </View>
        </View>
      ))}
    </View>
  );
}

interface Props {
  s: SurveyJaringan;
  g: GambarRekon;
  foto: FotoPdf[];
  logo: LogoLembar;
  latar: string | null;
}

export default function GambarRekonduktorPdf({ s, g, foto, logo, latar }: Props) {
  const panjang = s.ruas.reduce((n, r) => n + panjangRuas(r), 0);
  return (
    <Lembar
      judul={`Gambar survey ${s.judul}`}
      gambar={<Bidang g={g} latar={latar} citra={s.latar === "citra"} />}
      lampiran={<RincianTiang s={s} />}
      kolom={
        <>
          <View style={S.blok}>
            <Text style={S.eyebrow}>SURVEY JARINGAN — REKONDUKTOR JTR</Text>
            <Baris l="Judul" v={s.judul} />
            <Baris l="Gardu" v={s.gardu_kode ?? "—"} />
            <Baris l="Penyulang" v={s.penyulang ?? "—"} />
            <Baris l="Panjang titik" v={`± ${angka(panjang)} m (${s.ruas.length} ruas, ${angka(s.rekon_tiang)} tiang)`} />
            <Baris l="Jumlah SR" v={angka(s.ruas.reduce((n, r) => n + jumlahItem(r, "sr"), 0))} />
            <Baris l="Status" v={s.status} />
          </View>
          <View style={S.blok}>
            <Text style={S.eyebrow}>RUAS</Text>
            {s.ruas.map((r, i) => (
              <Baris
                key={r.id} l={`Ruas ${i + 1}${r.jurusan ? ` (${r.jurusan})` : ""}`}
                v={`${ujungRuas(r, s.gardu_kode)} · ${angka(panjangRuas(r))} m · ${r.kabel_lama ?? "?"} → ${namaKabel(r) || "?"}`}
              />
            ))}
          </View>
          <TabelMaterialPdf material={s.material} />
          <Foto foto={foto} />
          <CatatanPdf isi={s.catatan} />
          <SumberData
            teks={`Disurvey ${s.dibuat_oleh ?? "—"}, ${tgl(s.dibuat_at)} · dicetak ${tgl(new Date())}. Kabel = panjang titik + 5% andongan. Rincian per tiang di lembar 2.`}
          />
        </>
      }
      blok={{
        skalaM: g.skala,
        judul: s.judul,
        logo,
        ulp: s.ulp,
        pengesah: [
          { label: "Di gbr/Survai", nama: s.digambar_nama ?? s.dibuat_oleh, tanggal: s.dibuat_at },
          { label: "Diperiksa", nama: s.diperiksa_nama },
          { label: "Disetujui", nama: s.disetujui_nama, tanggal: s.disetujui_at },
          { label: "Dirubah", nama: s.diubah_at !== s.dibuat_at ? s.diubah_oleh : null, tanggal: s.diubah_at !== s.dibuat_at ? s.diubah_at : null },
        ],
        keterangan: (
          <>
            <Contoh teks="JTR yang ada (patokan)"><ContohGaris warna={LAMA} tebal={0.9} /></Contoh>
            <Contoh teks="Ruas JTR diganti kabelnya · panjang gawang"><ContohGaris warna={MERAH} tebal={2} putus /></Contoh>
            <Contoh teks="Tiang di ruas (tetap)"><Circle cx={13} cy={5} r={2.8} fill="#fff" stroke={MERAH} strokeWidth={1} /></Contoh>
            {g.gardu && <Contoh teks="Gardu"><SimbolGardu x={13} y={5.5} r={5} /></Contoh>}
          </>
        ),
      }}
    />
  );
}
