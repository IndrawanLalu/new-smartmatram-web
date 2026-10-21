// Gambar survey Survey Jaringan Baru (JTM) — hanya dimuat lewat import().
// Hitungan di gambarSurveyJtm.ts; lembar & potongan bersama di lib/gambarSurvey.

import { Circle, G, Line, Path, Polygon, Text, View } from "@react-pdf/renderer";
import {
  angka, Baris, BidangGambar, CatatanPdf, Contoh, ContohGaris, Lembar, S, SimbolGardu, SumberData,
  TabelMaterialPdf, TEAL, tgl, wajik,
} from "@/lib/gambarSurvey/LembarPdf";
import { bentukGardu, setengahTiang } from "@/lib/gambarSurvey/simbolGardu";
import { LABEL_ALASAN, type JenisGardu, type SurveyJaringan, type TiangSambung } from "@/lib/surveyJaringan";
import type { GambarJtm, JenisLabelJtm } from "./gambarSurveyJtm";

const LAMA = "#94A3B8";
const HITAM = "#111827";
const BARU = "#EA580C";
const UNGU = "#7C3AED";
const WARNA_LABEL: Record<JenisLabelJtm, string> = {
  sambung: UNGU, gardu: BARU, alat: BARU, nomor: "#9A3412", panjang: "#C2410C", lain: "#94A3B8",
};
const TIPIS: JenisLabelJtm[] = ["panjang", "lain"];

const ABU = "#6B7280";

/** Tiang (lingkaran setengah hitam ◐). */
function Tiang({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill="#fff" stroke={HITAM} strokeWidth={0.8} />
      <Path d={setengahTiang(x, y, r)} fill={HITAM} />
    </G>
  );
}

/** Gardu baru: tiang (portal dua) + segitiga trafo di sampingnya, diputar `arah` (contohGardu.png). */
function GarduBaru({ x, y, r, jenis, arah }: { x: number; y: number; r: number; jenis: JenisGardu | null; arah: number }) {
  const b = bentukGardu(jenis, arah, r);
  return (
    <G>
      <Polygon points={b.segitiga.map((p) => `${x + p.x},${y + p.y}`).join(" ")} fill={ABU} stroke="#fff" strokeWidth={0.6} />
      {b.tiang.map((p, i) => <Tiang key={i} x={x + p.x} y={y + p.y} r={r} />)}
    </G>
  );
}

function Bidang({ g, latar }: { g: GambarJtm; latar: string | null }) {
  return (
    <BidangGambar latar={latar} label={g.label} warnaLabel={(j) => WARNA_LABEL[j]} tebal={(j) => !TIPIS.includes(j)}>
      {g.lama.map((x, i) => <Line key={`l${i}`} x1={x.a.x} y1={x.a.y} x2={x.b.x} y2={x.b.y} stroke={LAMA} strokeWidth={1} />)}
      {g.tiangLama.map((t) =>
        t.gardu ? <SimbolGardu key={t.id} x={t.x} y={t.y} r={5} /> : <Circle key={t.id} cx={t.x} cy={t.y} r={1.8} fill="#fff" stroke={LAMA} strokeWidth={0.7} />,
      )}
      {g.baru.map((x, i) => (
        <Line key={`b${i}`} x1={x.a.x} y1={x.a.y} x2={x.b.x} y2={x.b.y} stroke={BARU} strokeWidth={1.8} strokeDasharray="6 3" />
      ))}
      {g.sambung.map((p, i) => <Circle key={`s${i}`} cx={p.x} cy={p.y} r={6} fill="none" stroke={UNGU} strokeWidth={1.5} />)}
      {g.tiangBaru.map((t) =>
        t.bentuk === "gardu" ? (
          <GarduBaru key={t.id} x={t.x} y={t.y} r={6} jenis={t.jenis} arah={t.arah} />
        ) : t.bentuk === "alat" ? (
          <G key={t.id}>
            <Tiang x={t.x} y={t.y} r={3.2} />
            <Polygon points={wajik(t.x + 6, t.y - 6, 3.5)} fill={BARU} stroke="#fff" strokeWidth={0.6} />
          </G>
        ) : (
          <Tiang key={t.id} x={t.x} y={t.y} r={3.2} />
        ),
      )}
    </BidangGambar>
  );
}

interface Props {
  s: SurveyJaringan;
  g: GambarJtm;
  sambung: TiangSambung[];
  logo: string | null;
  latar: string | null;
}

export default function GambarSurveyJtmPdf({ s, g, sambung, logo, latar }: Props) {
  return (
    <Lembar
      judul={`Gambar survey ${s.judul}`}
      gambar={<Bidang g={g} latar={latar} />}
      kolom={
        <>
          <View style={S.blok}>
            <Text style={S.eyebrow}>{`SURVEY JARINGAN BARU JTM — ${LABEL_ALASAN[s.alasan].toUpperCase()}`}</Text>
            <Baris l="Judul" v={s.judul} />
            <Baris l="Penyulang" v={s.penyulang ?? "—"} />
            <Baris l="Titik sambung" v={sambung.map((x) => x.kode ?? "—").join(", ") || "—"} />
            <Baris
              l="Tiang baru"
              v={`${angka(s.jumlah_tiang)} batang (titik T1–T${g.tiangBaru.length}${s.jumlah_tiang > g.tiangBaru.length ? ", gardu portal dua tiang" : ""})`}
            />
            <Baris l="Panjang" v={`± ${angka(s.panjang_m)} m (${(s.panjang_m / 1000).toLocaleString("id-ID", { maximumFractionDigits: 2 })} kms)`} />
            {s.jumlah_gardu > 0 && <Baris l="Gardu baru" v={`${s.jumlah_gardu} gardu · ${angka(s.gardu_kva)} kVA`} />}
            <Baris l="Status" v={s.status} />
          </View>
          <TabelMaterialPdf material={s.material} />
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
            <Contoh teks="Jaringan baru (rencana) · panjang gawang"><ContohGaris warna={BARU} tebal={1.8} putus /></Contoh>
            <Contoh teks="Tiang baru T1, T2, …"><Tiang x={13} y={5} r={3.2} /></Contoh>
            <Contoh teks="Titik sambung ke JTM yang ada"><Circle cx={13} cy={5} r={4} fill="none" stroke={UNGU} strokeWidth={1.3} /></Contoh>
            {g.tiangBaru.some((t) => t.bentuk === "gardu") && (
              <Contoh teks="Gardu baru (tiang + trafo; portal dua tiang)"><GarduBaru x={13} y={1.6} r={1.7} jenis="cantol" arah={0} /></Contoh>
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
