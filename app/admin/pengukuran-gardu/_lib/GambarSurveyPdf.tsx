// Gambar survey usulan perbaikan JTR — hanya dimuat lewat import() saat PDF
// dibuat. Hitungan gambar di gambarSurvey.ts; lembar & potongan PDF bersama di
// lib/gambarSurvey/LembarPdf.tsx.

import { Circle, Line, Polygon, Polyline, Text, View } from "@react-pdf/renderer";
import {
  angka, Baris, BidangGambar, CatatanPdf, Contoh, ContohGaris, Lembar, MERAH, S, SimbolGardu, SumberData,
  TabelMaterialPdf, TEAL, tgl, wajik,
} from "@/lib/gambarSurvey/LembarPdf";
import type { LogoLembar } from "@/lib/gambarSurvey/latar";
import type { UsulanJtr } from "../_hooks/useUsulanJtr";
import type { Gambar, JenisLabel, NadaUjung } from "./gambarSurvey";
import { LABEL_RENCANA, pindahSr } from "./rencanaJtr";

const GARIS = { lain: "#B0B8C4", utama: "#1F2937", pindah: "#7C3AED" } as const;
/** Tiang yang SR-nya dipindah ke kabel baru (cara pindah SR). */
const JINGGA = "#EA580C";
const TEBAL = { lain: 0.7, utama: 1.3, pindah: 1.6 } as const;
const WARNA_UJUNG: Record<NadaUjung, string> = { merah: "#DC2626", kuning: "#D97706", hijau: "#16A34A" };
const WARNA_LABEL: Record<JenisLabel, string> = {
  "ujung-merah": WARNA_UJUNG.merah,
  "ujung-kuning": WARNA_UJUNG.kuning,
  "ujung-hijau": WARNA_UJUNG.hijau,
  sr: JINGGA,
  kabel: MERAH,
  pecah: MERAH,
  sisip: MERAH,
  gardu: TEAL,
  jurusan: "#111827",
  tiang: "#1F2937",
  "tiang-lain": "#9CA3AF",
};
const LABEL_TIPIS: JenisLabel[] = ["tiang", "tiang-lain"];

function Legenda({ g, jurusan, garduKode }: { g: Gambar; jurusan: string; garduKode: string }) {
  return (
    <>
      <Contoh teks={`Kabel jurusan ${jurusan} (yang ada)`}><ContohGaris warna={GARIS.utama} tebal={TEBAL.utama} /></Contoh>
      {g.garis.some((x) => x.jenis === "pindah") && (
        <Contoh teks="Pindah ke jurusan baru"><ContohGaris warna={GARIS.pindah} tebal={TEBAL.pindah} /></Contoh>
      )}
      {g.tiang.some((t) => t.jenis === "sr") && (
        <Contoh teks="Tiang yang SR-nya dipindah ke kabel baru"><Circle cx={13} cy={5} r={3.2} fill={JINGGA} stroke="#fff" strokeWidth={0.8} /></Contoh>
      )}
      {g.kabelBaru.length > 1 && (
        <Contoh teks="Jalur kabel baru (rencana)"><ContohGaris warna={MERAH} tebal={1.4} putus /></Contoh>
      )}
      <Contoh teks="Kabel jurusan lain"><ContohGaris warna={GARIS.lain} tebal={TEBAL.lain} /></Contoh>
      <Contoh teks={`Tiang — kode tanpa awalan ${garduKode}-, "· n SR" = tarikan SR`}><Circle cx={13} cy={5} r={2.8} fill="#fff" stroke={GARIS.utama} strokeWidth={0.9} /></Contoh>
      <Contoh teks="Gardu (di tiang)"><SimbolGardu x={13} y={5.5} r={5} /></Contoh>
      {g.pecah && <Contoh teks={g.caraSr ? "Ujung kabel baru" : "Titik pecah"}><Circle cx={13} cy={5} r={4} fill="none" stroke={MERAH} strokeWidth={1.2} /></Contoh>}
      {g.sisip && <Contoh teks="Usulan gardu sisip"><Polygon points="13,1 18,9 8,9" fill={MERAH} /></Contoh>}
      {g.ujung.length > 0 && (
        <Contoh teks="Titik ukur tegangan ujung R/S/T–N (merah < 198 V, kuning < 207 V)">
          <Polygon points={wajik(13, 5, 4.5)} fill={WARNA_UJUNG.merah} stroke="#fff" strokeWidth={0.6} />
        </Contoh>
      )}
    </>
  );
}

function Data({ u, g, garduNama }: Pick<Props, "u" | "g" | "garduNama">) {
  const o = u.opsi;
  const d = u.dasar;
  return (
    <View style={S.blok}>
      <Text style={S.eyebrow}>{LABEL_RENCANA[u.pekerjaan].toUpperCase()}</Text>
      <Baris l="Gardu" v={[u.gardu_kode, garduNama].filter(Boolean).join(" — ")} />
      <Baris l="Penyulang" v={u.penyulang ?? "—"} />
      <Baris l="Jurusan" v={u.jurusan} />
      <Baris l="Trafo" v={`${angka(d.kva)} kVA · beban ${angka(d.persen_beban)}%`} />
      <Baris l="Arus R/S/T" v={`${angka(d.a_r)} / ${angka(d.a_s)} / ${angka(d.a_t)} A (ukur ${d.tanggal_pengukuran ?? "—"})`} />
      <Baris l="Kabel" v={`${d.kabel ?? "—"} · terjauh ${angka(d.terjauh_m)} m · ${angka(d.jumlah_sr)} SR`} />
      {g.ujung.map((x) => (
        <Baris key={x.jurusan} l={`Teg. ujung ${x.jurusan}`} v={`${angka(x.v_rn)} / ${angka(x.v_sn)} / ${angka(x.v_tn)} V (ukur ${x.tgl})`} />
      ))}
      {o && (
        <>
          {pindahSr(o) ? (
            <Baris l="Cara" v={`pindah SR ke kabel baru sampai ${o.titikKode ?? "—"} — kabel lama tidak dipotong`} />
          ) : (
            <Baris l="Titik pecah" v={`${o.titikKode ?? "—"}, cabang ${o.cabangKode ?? "—"} pindah`} />
          )}
          <Baris l="Kabel baru" v={`± ${angka(o.kabelBaru)} m (${angka(o.tiangLintas)} tiang dilalui)`} />
          <Baris l="Arus sesudah" v={`jurusan baru ${angka(o.iBaru)} A · lama ${angka(o.iLama)} A`} />
          <Baris
            l={pindahSr(o) ? "SR dipindah" : "Pindah"}
            v={`${angka(o.srPindah)} SR${o.srTotal ? ` dari ${angka(o.srTotal)}` : ""} · ${angka(o.tiangPindah)} tiang`}
          />
          <Baris l="Tegangan" v={`jatuh tegangan terburuk turun ± ${angka(o.turunPct)}%`} />
        </>
      )}
      <Text style={{ marginTop: 2, fontFamily: "Helvetica-Oblique" }}>{u.ringkas}</Text>
    </View>
  );
}

function Jtr({ g, latar }: { g: Gambar; latar: string | null }) {
  return (
    <BidangGambar
      latar={latar} label={g.label} warnaLabel={(j) => WARNA_LABEL[j]} tebal={(j) => !LABEL_TIPIS.includes(j)}
      peringatan={g.hilang ? "Sebagian tiang usulan sudah tidak ada di data JTR sekarang — JTR berubah sejak usulan disimpan." : null}
    >
      {g.garis.map((x, i) => (
        <Line key={i} x1={x.a.x} y1={x.a.y} x2={x.b.x} y2={x.b.y} stroke={GARIS[x.jenis]} strokeWidth={TEBAL[x.jenis]} />
      ))}
      {g.kabelBaru.length > 1 && (
        <Polyline points={g.kabelBaru.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={MERAH} strokeWidth={1.4} strokeDasharray="5 3" />
      )}
      {g.tiang.map((t) => (
        <Circle
          key={t.id} cx={t.x} cy={t.y} r={t.jenis === "lain" ? 2.1 : t.jenis === "sr" ? 3.4 : 2.8}
          fill={t.jenis === "pindah" ? GARIS.pindah : t.jenis === "sr" ? JINGGA : "#fff"}
          stroke={t.jenis === "sr" ? "#fff" : GARIS[t.jenis]} strokeWidth={0.9}
        />
      ))}
      {g.pecah && <Circle cx={g.pecah.x} cy={g.pecah.y} r={5.5} fill="none" stroke={MERAH} strokeWidth={1.4} />}
      {g.sisip && <Polygon points={`${g.sisip.x},${g.sisip.y - 6} ${g.sisip.x + 6},${g.sisip.y + 5} ${g.sisip.x - 6},${g.sisip.y + 5}`} fill={MERAH} />}
      {g.ujung.map((x) => (
        <Polygon key={`u${x.jurusan}`} points={wajik(x.x, x.y, 5)} fill={WARNA_UJUNG[x.nada]} stroke="#fff" strokeWidth={0.8} />
      ))}
      {g.gardu && <SimbolGardu x={g.gardu.x} y={g.gardu.y} r={8} />}
    </BidangGambar>
  );
}

interface Props {
  u: UsulanJtr;
  g: Gambar;
  garduNama: string | null;
  logo: LogoLembar;
  /** Latar peta jalan (JPEG data URL); null = latar putih. */
  latar: string | null;
}

export default function GambarSurveyPdf(p: Props) {
  const { u } = p;
  return (
    <Lembar
      judul={`Gambar survey ${u.gardu_kode}-${u.jurusan}`}
      gambar={<Jtr g={p.g} latar={p.latar} />}
      kolom={
        <>
          <Data u={u} g={p.g} garduNama={p.garduNama} />
          <TabelMaterialPdf material={u.material} />
          <CatatanPdf isi={u.catatan} />
          <SumberData
            teks={`Diusulkan ${u.dibuat_oleh ?? "—"}, ${tgl(u.dibuat_at)} · dicetak ${tgl(new Date())}. Posisi tiang menurut koordinat data JTR SMART — pastikan di lapangan.`}
          />
        </>
      }
      blok={{
        skalaM: p.g.skala,
        judul: `Rencana ${LABEL_RENCANA[u.pekerjaan]} Gardu ${u.gardu_kode} Jurusan ${u.jurusan}${u.penyulang ? ` — Penyulang ${u.penyulang}` : ""}`,
        logo: p.logo,
        ulp: u.ulp,
        pengesah: [
          { label: "Di gbr/Survai", nama: u.dibuat_oleh, tanggal: u.dibuat_at },
          { label: "Diperiksa", nama: null },
          { label: "Disetujui", nama: null },
          { label: "Dirubah", nama: null },
        ],
        keterangan: <Legenda g={p.g} jurusan={u.jurusan} garduKode={u.gardu_kode} />,
      }}
    />
  );
}
