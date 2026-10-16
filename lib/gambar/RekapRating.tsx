import type { GambarBingkai } from "./aset";
import { Bingkai } from "./Bingkai";
import { BULAN, C, HURUF_JUDUL, rentang, WARNA_BINTANG } from "./gaya";
import { Ikon } from "./ikon";
import { AreaUtama, JudulKartu, Kartu, KartuAngka, KartuFokus, KartuUtama, Panel } from "./kartu";
import { Sel, Tabel, type Kolom } from "./Tabel";

/**
 * Gambar Rekap Rating Yantek per Petugas — satu ULP, satu bulan.
 * Hitungannya `buildStats` halaman Analisis Yantek (Total WO = semua baris,
 * rata-rata hanya dari baris berrating). Semua angka ringkasan dihitung di sini
 * dari `petugas` — tidak ada angka yang diketik tangan.
 */

export interface PetugasRating {
  nama: string;
  totalWO: number;
  /** Jumlah rating per bintang, indeks 0–5. */
  r: number[];
}

interface RekapRatingProps {
  gambar: GambarBingkai;
  ulp: string;
  /** YYYY-MM-DD — rentang data yang ikut. */
  dari: string;
  sampai: string;
  /** Sudah urut: ★5 terbanyak, lalu Total WO. */
  petugas: PetugasRating[];
  halaman: number;
  jumlahHalaman: number;
}

export const BARIS_PER_HALAMAN = 30;

const FOKUS = ["Tingkatkan kualitas pekerjaan", "Kurangi rating 1 & 2 bintang", "Pertahankan kinerja terbaik", "Jaga pelayanan prima"];

const rataRata = (r: number[]) => {
  const n = r.reduce((a, b) => a + b, 0);
  return n ? r.reduce((s, c, i) => s + c * i, 0) / n : null;
};
const teksRata = (v: number | null) => (v === null ? "–" : v.toFixed(2));
const persen = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");
/** Perlu perhatian: punya rating 1 atau 2 bintang. */
const perhatian = (p: PetugasRating) => p.r[1] + p.r[2] > 0;

const warnaBintang = (b: number, n: number) => (!n ? C.pudar : b <= 2 ? C.merah : b === 5 ? C.hijauTua : C.tinta);

/** No, Nama, Total WO, ★1–★5, Rata-rata = 1392. */
const kolom = (nomorAwal: number): Kolom<PetugasRating>[] => [
  { kepala: "No", latar: C.navy, lebar: 72, isi: (_, i) => String(nomorAwal + i), gaya: () => ({ color: C.tintaLembut }) },
  { kepala: "Nama Petugas", ikon: "orang", latar: C.navy, lebar: 450, rata: "kiri", isi: (p) => p.nama },
  { kepala: "Total WO", ikon: "dokumen", latar: C.navy, lebar: 150, isi: (p) => String(p.totalWO) },
  ...[1, 2, 3, 4, 5].map(
    (b): Kolom<PetugasRating> => ({
      kepala: String(b), ikon: "bintang", latar: WARNA_BINTANG[b - 1], lebar: 116,
      isi: (p) => (p.r[b] ? String(p.r[b]) : "–"),
      gaya: (p) => ({ fontWeight: 800, color: warnaBintang(b, p.r[b]) }),
    }),
  ),
  {
    kepala: "Rata-rata", ikon: "grafik", latar: C.biruTerang, lebar: 140,
    isi: (p) => (
      <div style={{ display: "flex", width: 120, height: 17, borderRadius: 5, background: C.biruMuda, alignItems: "center", justifyContent: "center", fontWeight: 800, color: C.navy }}>
        {teksRata(rataRata(p.r))}
      </div>
    ),
  },
];

export function RekapRating({ gambar, ulp, dari, sampai, petugas, halaman, jumlahHalaman }: RekapRatingProps) {
  const r = [0, 1, 2, 3, 4, 5].map((i) => petugas.reduce((n, p) => n + (p.r[i] ?? 0), 0));
  const totalWO = petugas.reduce((n, p) => n + p.totalWO, 0);
  const berrating = r.reduce((a, b) => a + b, 0);
  const rata = rataRata(r);
  const mulai = (halaman - 1) * BARIS_PER_HALAMAN;
  const k = kolom(mulai + 1);
  const [y, m] = sampai.split("-").map(Number);

  return (
    <Bingkai
      gambar={gambar}
      unit={`ULP ${ulp}`}
      judul="REKAP RATING YANTEK"
      judulAksen="PER PETUGAS"
      meta={[
        { ikon: "kalender", teks: `${BULAN[m - 1]} ${y}` },
        { ikon: "lokasi", teks: `ULP ${ulp}` },
        { ikon: "grup", teks: `${petugas.length} Petugas` },
        { ikon: "kalender", teks: `Periode: ${rentang(dari, sampai)}` },
      ]}
      keterangan={
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>Diurutkan dari bintang 5 terbanyak</span>
          <span>→</span>
          <span>baris bertanda merah punya rating 1 atau 2 bintang</span>
          {jumlahHalaman > 1 && <span style={{ color: C.tintaLembut }}>{`· Halaman ${halaman}/${jumlahHalaman}`}</span>}
        </div>
      }
    >
      <AreaUtama>
        <Tabel
          kolom={k}
          baris={petugas.slice(mulai, mulai + BARIS_PER_HALAMAN)}
          kunci={(p) => p.nama}
          tinggiKepala={46}
          tinggiBaris={20.6}
          ukuranHuruf={16.5}
          merah={perhatian}
          ikonKepala={19}
        />
        <div style={{ position: "absolute", left: 16, bottom: 14, width: 1398, height: 46, display: "flex", background: C.biruMuda, borderRadius: 10, fontSize: 22, fontWeight: 800, color: C.navy }}>
          <Sel k={k[0]}>{""}</Sel>
          <Sel k={k[1]}>TOTAL</Sel>
          <Sel k={k[2]}>{String(totalWO)}</Sel>
          {[1, 2, 3, 4, 5].map((b) => (
            <Sel key={b} k={k[b + 2]} style={{ color: b === 5 ? C.hijauTua : WARNA_BINTANG[b - 1] }}>
              {String(r[b])}
            </Sel>
          ))}
          <Sel k={k[8]}>{teksRata(rata)}</Sel>
        </div>
      </AreaUtama>

      <Panel>
        <KartuUtama ikon="bintang" judul="Rata-rata Rating" nilai={teksRata(rata)} keterangan="dari 5.00" />
        {/* Porsi dari rating yang masuk (bukan dari Total WO — tidak semua WO dirating). */}
        <KartuAngka
          ikon="bintang" ikonWarna={C.hijau} judul="Rating Bintang 5" nilai={String(r[5])}
          keterangan={`(${persen(r[5], berrating)} dari ${berrating} rating)`}
          warna={C.hijauTua} latar={C.hijauMuda} tepi="#BFE5C7" porsi={berrating ? r[5] / berrating : 0}
        />
        <KartuAngka
          ikon="bintang" ikonWarna={C.merah} judul="Rating Bintang 1" nilai={String(r[1])}
          keterangan={`(${persen(r[1], berrating)} dari ${berrating} rating)`}
          warna={C.merahTua} latar={C.merahMuda} tepi="#F6C4C4" porsi={berrating ? r[1] / berrating : 0}
        />
        <Kartu latar={C.biruMuda} tepi="#C6DBF3" tinggi={112}>
          <JudulKartu ikon="dokumen" warna={C.biru} teks="Total WO" />
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 }}>
            <div style={{ fontFamily: HURUF_JUDUL, fontSize: 60, fontWeight: 800, color: C.navy, lineHeight: 1 }}>{String(totalWO)}</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", fontSize: 17, fontWeight: 600, color: C.tintaLembut, lineHeight: 1.3, paddingBottom: 4 }}>
              <span>{`${berrating} berrating`}</span>
              <span>{`(${persen(berrating, totalWO)})`}</span>
            </div>
            <Ikon nama="basisdata" ukuran={46} warna={C.biru} />
          </div>
        </Kartu>
        <KartuFokus poin={FOKUS} />
      </Panel>
    </Bingkai>
  );
}
