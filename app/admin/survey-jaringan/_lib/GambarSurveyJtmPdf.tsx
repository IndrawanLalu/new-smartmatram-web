// Gambar survey Survey Jaringan Baru (JTM) — hanya dimuat lewat import().
// Hitungan di gambarSurveyJtm.ts; lembar & potongan bersama di lib/gambarSurvey.
/* eslint-disable jsx-a11y/alt-text -- <Image> di sini milik react-pdf (PDF), bukan <img> HTML */

import { Circle, G, Image, Line, Path, Polygon, Text, View } from "@react-pdf/renderer";
import {
  angka, Baris, BidangGambar, CatatanPdf, Contoh, ContohGaris, Lembar, S, SimbolGardu, SumberData,
  TabelMaterialPdf, TEAL, tgl, wajik,
} from "@/lib/gambarSurvey/LembarPdf";
import type { LogoLembar } from "@/lib/gambarSurvey/latar";
import { bentukGardu, setengahTiang } from "@/lib/gambarSurvey/simbolGardu";
import { geser } from "@/lib/gambarSurvey/kertas";
import { bawaJtm, bawaJtr, LABEL_ALASAN, type JenisGardu, type SurveyJaringan, type TiangSambung, type TitikSurvey } from "@/lib/surveyJaringan";
import { FOTO_PDF_W, ukuranFotoPdf, type FotoPdf } from "./fotoPdf";
import type { GambarJtm, JenisLabelJtm } from "./gambarSurveyJtm";

const LAMA = "#94A3B8";
const HITAM = "#111827";
const BARU = "#EA580C";
const JTR = "#2563EB";
const UNGU = "#7C3AED";
const ABU = "#6B7280";
const WARNA_LABEL: Record<JenisLabelJtm, string> = {
  sambung: UNGU, gardu: BARU, alat: BARU, nomor: "#9A3412", panjang: "#C2410C", jurusan: JTR, lain: "#94A3B8",
};
const TIPIS: JenisLabelJtm[] = ["panjang", "lain"];
/** Tiang yang ada & Tiang JTR rencana sama besar; Tiang JTM rencana sedikit lebih besar; trafo ukurannya sendiri. */
export const R_TIANG = 3;
const R_TIANG_JTM = 3.6;
export const T_TRAFO = 5.5;

/** Tiang yang ADA: lingkaran setengah hitam ◐. */
function TiangAda({ x, y }: { x: number; y: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={R_TIANG} fill="#fff" stroke={HITAM} strokeWidth={0.7} />
      <Path d={setengahTiang(x, y, R_TIANG)} fill={HITAM} />
    </G>
  );
}

/** Tiang RENCANA: putih polos (garis rencana digambar di atasnya, menembus tengah). */
const TiangRencana = ({ x, y, r = R_TIANG_JTM }: { x: number; y: number; r?: number }) => (
  <Circle cx={x} cy={y} r={r} fill="#fff" stroke={HITAM} strokeWidth={0.8} />
);

/** Gardu baru: tiang rencana (portal dua) + segitiga trafo di sampingnya, diputar `arah` (contohGardu.png). */
function GarduBaru({ x, y, jenis, arah, r = R_TIANG_JTM, t = T_TRAFO }: { x: number; y: number; jenis: JenisGardu | null; arah: number; r?: number; t?: number }) {
  const b = bentukGardu(jenis, arah, r, t);
  return (
    <G>
      <Polygon points={b.segitiga.map((p) => `${x + p.x},${y + p.y}`).join(" ")} fill={ABU} stroke="#fff" strokeWidth={0.6} />
      {b.tiang.map((p, i) => <TiangRencana key={i} x={x + p.x} y={y + p.y} r={r} />)}
    </G>
  );
}

function Bidang({ g, latar, citra }: { g: GambarJtm; latar: string | null; citra: boolean }) {
  return (
    <BidangGambar
      latar={latar} label={g.label} warnaLabel={(j) => WARNA_LABEL[j]} tebal={(j) => !TIPIS.includes(j)}
      atribusi={citra ? "Latar © Esri, Maxar, Earthstar Geographics" : undefined}
    >
      {g.lama.map((x, i) => <Line key={`l${i}`} x1={x.a.x} y1={x.a.y} x2={x.b.x} y2={x.b.y} stroke={LAMA} strokeWidth={1} />)}
      {g.tiangLama.map((t) => (t.gardu ? <SimbolGardu key={t.id} x={t.x} y={t.y} r={5} /> : <TiangAda key={t.id} x={t.x} y={t.y} />))}
      {g.sambung.map((p, i) => <Circle key={`s${i}`} cx={p.x} cy={p.y} r={6} fill="none" stroke={UNGU} strokeWidth={1.5} />)}
      {g.tiangBaru.map((t) =>
        t.bentuk === "gardu" ? (
          <GarduBaru key={t.id} x={t.x} y={t.y} jenis={t.jenis} arah={t.arah} />
        ) : (
          <TiangRencana key={t.id} x={t.x} y={t.y} r={t.jaringan === "JTR" ? R_TIANG : R_TIANG_JTM} />
        ),
      )}
      {/* Garis rencana di ATAS tiang rencana — tetap terlihat menembus tengahnya.
          JTM + JTR: dua garis sejajar (jingga & biru). */}
      {g.baru.map((x, i) => {
        const dua = bawaJtm(x.kabel) && bawaJtr(x.kabel);
        const [a, b] = dua ? geser([x.a, x.b], 1.6) : [x.a, x.b];
        const [c, d] = dua ? geser([x.a, x.b], -1.6) : [x.a, x.b];
        return (
          <G key={`b${i}`}>
            {bawaJtm(x.kabel) && <Line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={BARU} strokeWidth={1.6} strokeDasharray="6 3" />}
            {bawaJtr(x.kabel) && <Line x1={c.x} y1={c.y} x2={d.x} y2={d.y} stroke={JTR} strokeWidth={1.1} strokeDasharray="4 2.5" />}
          </G>
        );
      })}
      {g.tiangBaru.filter((t) => t.bentuk === "alat").map((t) => (
        <Polygon key={`a${t.id}`} points={wajik(t.x + 6, t.y - 6, 3.5)} fill={BARU} stroke="#fff" strokeWidth={0.6} />
      ))}
    </BidangGambar>
  );
}

const kms = (m: number) => (m / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 });
const koordinat = (k: { lat: number; lng: number }) => `${k.lat.toFixed(6)}, ${k.lng.toFixed(6)}`;

/** Koordinat lokasi: titik sambung (tiang yang ada) & rencana gardu/peralatan. */
function Koordinat({ sambung, titik }: { sambung: TiangSambung[]; titik: TitikSurvey[] }) {
  const penting = titik.map((t, i) => ({ t, n: i + 1 })).filter(({ t }) => t.penanda);
  return (
    <View style={S.blok}>
      <Text style={S.eyebrow}>KOORDINAT LOKASI</Text>
      {sambung.map((x) => <Baris key={x.id} l="Titik sambung" v={`${x.kode ?? "—"} · ${koordinat(x)}`} />)}
      {penting.map(({ t, n }) => (
        <Baris key={t.id} l={`${t.penanda === "gardu" ? "Gardu baru" : "Peralatan"} T${n}`} v={koordinat(t)} />
      ))}
    </View>
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

interface Props {
  s: SurveyJaringan;
  g: GambarJtm;
  titik: TitikSurvey[];
  sambung: TiangSambung[];
  /** Foto kondisi lapangan (data URL, diperkecil & bertanda) + keterangan. */
  foto: FotoPdf[];
  logo: LogoLembar;
  latar: string | null;
}

export default function GambarSurveyJtmPdf({ s, g, titik, sambung, foto, logo, latar }: Props) {
  return (
    <Lembar
      judul={`Gambar survey ${s.judul}`}
      gambar={<Bidang g={g} latar={latar} citra={s.latar === "citra"} />}
      kolom={
        <>
          <View style={S.blok}>
            <Text style={S.eyebrow}>{`SURVEY JARINGAN BARU — ${LABEL_ALASAN[s.alasan].toUpperCase()}`}</Text>
            <Baris l="Judul" v={s.judul} />
            <Baris l="Penyulang" v={s.penyulang ?? "—"} />
            <Baris
              l="Tiang baru"
              v={`${angka(s.jumlah_tiang)} batang (titik T1–T${g.tiangBaru.length}${s.jumlah_tiang > g.tiangBaru.length ? ", gardu portal dua tiang" : ""})`}
            />
            <Baris l="JTM baru" v={`${angka(s.jumlah_tiang_jtm)} tiang · ± ${angka(s.panjang_jtm_m)} m (${kms(s.panjang_jtm_m)} kms)`} />
            {(s.jumlah_tiang_jtr > 0 || s.panjang_jtr_m > 0) && (
              <Baris l="JTR baru" v={`${angka(s.jumlah_tiang_jtr)} tiang · ± ${angka(s.panjang_jtr_m)} m (${kms(s.panjang_jtr_m)} kms)`} />
            )}
            {s.jumlah_gardu > 0 && <Baris l="Gardu baru" v={`${s.jumlah_gardu} gardu · ${angka(s.gardu_kva)} kVA`} />}
            <Baris l="Status" v={s.status} />
          </View>
          <Koordinat sambung={sambung} titik={titik} />
          <TabelMaterialPdf material={s.material} />
          <Foto foto={foto} />
          <CatatanPdf isi={s.catatan} />
          <SumberData
            teks={`Disurvey ${s.dibuat_oleh ?? "—"}, ${tgl(s.dibuat_at)} · dicetak ${tgl(new Date())}. Posisi tiang baru menurut gambar survey di SMART — pastikan di lapangan.`}
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
            <Contoh teks="JTM yang ada (patokan)"><ContohGaris warna={LAMA} tebal={1} /></Contoh>
            <Contoh teks="Tiang yang ada"><TiangAda x={13} y={5} /></Contoh>
            <Contoh teks="JTM baru (rencana) · panjang gawang"><ContohGaris warna={BARU} tebal={1.6} putus /></Contoh>
            <Contoh teks="Tiang JTM rencana T1, T2, …">
              <TiangRencana x={13} y={5} />
              <Line x1={1} y1={5} x2={25} y2={5} stroke={BARU} strokeWidth={1.2} strokeDasharray="3 2" />
            </Contoh>
            {g.baru.some((x) => bawaJtr(x.kabel)) && (
              <>
                <Contoh teks="JTR baru (rencana) · jurusan"><ContohGaris warna={JTR} tebal={1.1} putus /></Contoh>
                <Contoh teks="Tiang JTR rencana">
                  <TiangRencana x={13} y={5} r={R_TIANG} />
                  <Line x1={1} y1={5} x2={25} y2={5} stroke={JTR} strokeWidth={1} strokeDasharray="3 2" />
                </Contoh>
              </>
            )}
            {g.baru.some((x) => x.kabel === "JTM+JTR") && (
              <Contoh teks="JTM + JTR satu tiang">
                <Line x1={1} y1={3.4} x2={25} y2={3.4} stroke={BARU} strokeWidth={1.2} strokeDasharray="3 2" />
                <Line x1={1} y1={6.6} x2={25} y2={6.6} stroke={JTR} strokeWidth={1} strokeDasharray="3 2" />
              </Contoh>
            )}
            <Contoh teks="Titik sambung ke JTM yang ada"><Circle cx={13} cy={5} r={4} fill="none" stroke={UNGU} strokeWidth={1.3} /></Contoh>
            {g.tiangBaru.some((t) => t.bentuk === "gardu") && (
              <Contoh teks="Gardu baru (tiang + trafo; portal dua tiang)"><GarduBaru x={13} y={1.8} jenis="cantol" arah={0} r={1.6} t={1.4} /></Contoh>
            )}
            {g.tiangBaru.some((t) => t.bentuk === "alat") && (
              <Contoh teks="Peralatan baru (FCO, LBS, …)"><Polygon points={wajik(13, 5, 4)} fill={BARU} stroke="#fff" strokeWidth={0.6} /></Contoh>
            )}
            {g.tiangLama.some((t) => t.gardu) && <Contoh teks="Gardu yang ada"><SimbolGardu x={13} y={5.5} r={5} warna={TEAL} /></Contoh>}
          </>
        ),
      }}
    />
  );
}
