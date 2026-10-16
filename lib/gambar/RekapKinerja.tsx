import { META } from "@/app/admin/kinerja-yantek/_lib/kinerjaMeta";
import type { GambarBingkai } from "./aset";
import { Bingkai } from "./Bingkai";
import { BULAN, C, tglPanjang } from "./gaya";
import { Ikon, type NamaIkon } from "./ikon";
import { AreaUtama, KartuAngka, KartuFokus, KartuUtama, Panel } from "./kartu";
import { Tabel, type Kolom } from "./Tabel";

/**
 * Gambar Rekap Kinerja Pelayanan Teknik — satu ULP, satu bulan.
 * Angka dari fungsi `rekap_kinerja` (sama dengan layar Rekap Kinerja & Beranda
 * HP); label, satuan, urutan dari `kinerjaMeta.ts`. Aturan tampilnya ikut
 * TabelKinerja: capaian dibulatkan, ambang 80/50, tanpa baris TOTAL karena
 * satuannya campur.
 */

export interface BarisGambar {
  kunci: string;
  woTerbit: number | null;
  sla: number | null;
  realisasi: number | null;
  belumDisetujui: number | null;
  /** Baris tidak ada di jawaban `rekap_kinerja` — angkanya dikosongkan, bukan nol. */
  gagal: boolean;
}

interface RekapKinerjaProps {
  gambar: GambarBingkai;
  ulp: string;
  tahun: number;
  bulan: number;
  /** YYYY-MM-DD — hari terakhir yang datanya ikut. */
  dataSampai: string;
  baris: BarisGambar[];
}

type Jenis = (typeof META)[number];

/** Ikon tiap jenis — milik gambar saja, layar web memakai lucide. */
const IKON: Record<string, NamaIkon> = {
  perabasan: "pohon",
  harjtm: "helm",
  hargardu: "kunciPas",
  penyeimbangan: "timbangan",
  optimasi: "tukar",
  jtm: "jalur",
  jtm2: "jalur",
  jtr: "jaringan",
  igardu1: "pindai",
  igardu2: "pindai",
  pengukuran: "meter",
};

const FOKUS = ["Kejar pekerjaan di bawah 50%", "Segerakan persetujuan admin", "Kirim realisasi tiap hari"];


const persen = (r: number | null, w: number | null) => (r === null || w === null || w === 0 ? null : Math.round((r / w) * 100));
const capaianWo = (m: Jenis, b: BarisGambar) => (m.dinilaiSla ? null : persen(b.realisasi, b.woTerbit));
const capaianSla = (b: BarisGambar) => persen(b.realisasi, b.sla);
const warnaCapaian = (p: number) => (p >= 80 ? C.hijau : p >= 50 ? C.oranye : C.merah);
/** KMS dua desimal berkoma, cacah bulat — sama dengan aplikasi. */
const teksAngka = (v: number, desimal: boolean) => (desimal ? v.toFixed(2).replace(".", ",") : v.toLocaleString("id-ID"));

const kosong = (kunci: string): BarisGambar => ({ kunci, woTerbit: null, sla: null, realisasi: null, belumDisetujui: null, gagal: true });

export function RekapKinerja({ gambar, ulp, tahun, bulan, dataSampai, baris }: RekapKinerjaProps) {
  const pasangan = META.map((m) => ({ m, b: baris.find((x) => x.kunci === m.kunci) ?? kosong(m.kunci) }));

  const hariBulan = new Date(tahun, bulan, 0).getDate();
  const hariKe = Number(dataSampai.slice(8, 10));
  /** Porsi bulan yang sudah lewat — pembanding laju; null kalau bulannya sudah habis. */
  const laju = hariKe < hariBulan ? hariKe / hariBulan : null;

  const berSla = pasangan.filter(({ b }) => capaianSla(b) !== null);
  const tercapai = berSla.filter(({ b }) => capaianSla(b)! >= 80).length;
  const rendah = berSla.filter(({ b }) => capaianSla(b)! < 50).length;
  const menunggu = pasangan.filter(({ b }) => (b.belumDisetujui ?? 0) > 0).length;

  return (
    <Bingkai
      gambar={gambar}
      unit={`ULP ${ulp}`}
      judul="REKAP KINERJA"
      judulAksen="PELAYANAN TEKNIK"
      meta={[
        { ikon: "kalender", teks: `${BULAN[bulan - 1]} ${tahun}` },
        { ikon: "lokasi", teks: `ULP ${ulp}` },
        { ikon: "lapisan", teks: `${META.length} Jenis Pekerjaan` },
        // Tahunnya sudah di butir pertama — dibuang supaya baris ini tidak menabrak foto.
        { ikon: "kalender", teks: `Data s.d. ${tglPanjang(dataSampai).replace(/ \d{4}$/, "")}` },
      ]}
      keterangan={
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span>Capaian</span>
          {([[C.hijau, "≥ 80%"], [C.oranye, "50–79%"], [C.merah, "< 50% (baris merah)"]] as const).map(([w, t]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 13, height: 13, borderRadius: 7, background: w }} />
              <span>{t}</span>
            </div>
          ))}
          {laju !== null && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>·</span>
              <div style={{ width: 0, height: 20, borderLeft: `3px dashed ${C.navy}` }} />
              <span>{`hari ke-${hariKe} dari ${hariBulan}`}</span>
            </div>
          )}
        </div>
      }
    >
      <AreaUtama>
        <Tabel
          kolom={kolom(laju)}
          baris={pasangan}
          kunci={(p) => p.m.kunci}
          tinggiKepala={50}
          tinggiBaris={57}
          ukuranHuruf={19}
          merah={({ b }) => perluPerhatian(b)}
        />
        <div style={{ position: "absolute", left: 22, right: 22, bottom: 14, display: "flex", flexWrap: "wrap", gap: 6, fontSize: 15.5, fontWeight: 500, color: C.tintaLembut }}>
          <Tebal>Capaian WO</Tebal>
          <span>= realisasi ÷ WO terbit ·</span>
          <Tebal>Capaian SLA</Tebal>
          <span>= seluruh realisasi (WO maupun di luar WO) ÷ SLA ·</span>
          <Tebal>Inspeksi JTR</Tebal>
          <span>dinilai terhadap SLA saja · termasuk yang belum disetujui · satuan beda, jadi tidak dijumlah</span>
        </div>
      </AreaUtama>

      <Panel>
        <KartuUtama ikon="naik" judul="Capaian SLA ≥ 80%" nilai={`${tercapai}/${berSla.length}`} keterangan="jenis pekerjaan" />
        <KartuAngka
          ikon="peringatan" ikonWarna={C.merah} judul="Perlu Perhatian" nilai={String(rendah)}
          keterangan="jenis capaian SLA < 50%" warna={C.merahTua} latar={C.merahMuda} tepi="#F6C4C4"
          porsi={berSla.length ? rendah / berSla.length : 0}
        />
        <KartuAngka
          ikon="jamPasir" ikonWarna={C.oranye} judul="Menunggu Persetujuan" nilai={String(menunggu)}
          keterangan="jenis ada yang belum disetujui" warna={C.oranyeTua} latar={C.oranyeMuda} tepi="#F8D7A8"
          porsi={menunggu / META.length}
        />
        <KartuAngka
          ikon="kalender" ikonWarna={C.biru} judul="Hari Berjalan" nilai={`${hariKe}/${hariBulan}`}
          keterangan={laju === null ? "hari · bulan selesai" : `hari (${Math.round(laju * 100)}% bulan ${BULAN[bulan - 1]})`}
          warna={C.navy} latar={C.biruMuda} tepi="#C6DBF3" porsi={hariKe / hariBulan}
        />
        <KartuFokus poin={FOKUS} />
      </Panel>
    </Bingkai>
  );
}

const Tebal = ({ children }: { children: string }) => <span style={{ fontWeight: 700 }}>{children}</span>;

// ── Tabel ──────────────────────────────────────────────────────────────────

interface Pasangan {
  m: Jenis;
  b: BarisGambar;
}

/** Baris merah: capaian SLA di bawah 50%. */
const perluPerhatian = (b: BarisGambar) => {
  const p = capaianSla(b);
  return p !== null && p < 50;
};

/** Jenis, WO, SLA, Realisasi, Belum disetujui, Capaian WO, Capaian SLA = 1400. */
const kolom = (laju: number | null): Kolom<Pasangan>[] => [
  { kepala: "Jenis Pekerjaan", ikon: "lapisan", latar: C.navy, lebar: 450, rata: "kiri", isi: ({ m, b }) => <NamaJenis m={m} b={b} /> },
  { kepala: "WO Terbit", ikon: "dokumen", latar: C.navy, lebar: 140, rata: "kanan", isi: ({ m, b }) => <Angka v={b.woTerbit} m={m} /> },
  { kepala: "SLA", ikon: "sasaran", latar: C.navy, lebar: 130, rata: "kanan", isi: ({ m, b }) => <Angka v={b.sla} m={m} /> },
  { kepala: "Realisasi", ikon: "centang", latar: C.hijau, lebar: 140, rata: "kanan", isi: ({ m, b }) => <Angka v={b.realisasi} m={m} warna={C.hijauTua} /> },
  { kepala: "Belum Disetujui", ikon: "jamPasir", latar: C.oranye, lebar: 190, rata: "kanan", isi: ({ m, b }) => <Angka v={b.belumDisetujui} m={m} warna={C.oranyeTua} /> },
  {
    kepala: "Capaian WO", ikon: "naik", latar: C.biru, lebar: 175, rata: "kanan",
    isi: ({ m, b }) => (m.dinilaiSla ? <span style={{ fontSize: 15, fontWeight: 600, color: C.pudar }}>dinilai SLA</span> : <Capaian p={capaianWo(m, b)} laju={laju} />),
  },
  { kepala: "Capaian SLA", ikon: "meter", latar: C.biruTerang, lebar: 175, rata: "kanan", isi: ({ b }) => <Capaian p={capaianSla(b)} laju={laju} /> },
];

function Pil({ teks }: { teks: string }) {
  return (
    <span style={{ fontSize: 13, fontWeight: 700, color: C.oranyeTua, background: C.oranyeMuda, border: `1px solid ${C.oranyeTua}55`, borderRadius: 10, padding: "1px 8px" }}>
      {teks}
    </span>
  );
}

function NamaJenis({ m, b }: Pasangan) {
  const merah = perluPerhatian(b);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: 11, background: merah ? "#FAD4D4" : C.biruMuda, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ikon nama={IKON[m.kunci] ?? "lapisan"} ukuran={23} warna={merah ? C.merahTua : C.biru} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "block", fontSize: m.jenis.length > 32 ? 17.5 : 19, fontWeight: 700, color: C.tinta, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 378 }}>
          {m.jenis}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 1, fontSize: 14, fontWeight: 600, color: C.pudar }}>
          <span>{`satuan ${m.satuan}`}</span>
          {b.gagal && <Pil teks="gagal dimuat" />}
          {!b.gagal && b.woTerbit === null && <Pil teks="belum ber-WO" />}
        </div>
      </div>
    </div>
  );
}

/** Satuan kecil di kiri, angka rata kanan — sama dengan aplikasi. */
function Angka({ v, m, warna = C.tinta }: { v: number | null; m: Jenis; warna?: string }) {
  if (v === null) return <span style={{ fontSize: 20, color: C.pudar }}>–</span>;
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: C.pudar, textTransform: "uppercase" }}>{m.satuan === "pekerjaan" ? "pek" : m.satuan}</span>
      <span style={{ fontSize: 21, fontWeight: 800, color: v === 0 ? C.pudar : warna }}>{teksAngka(v, m.desimal)}</span>
    </div>
  );
}

/** Bilah capaian (dipotong di 100%) + garis putus "hari berjalan". */
function Capaian({ p, laju }: { p: number | null; laju: number | null }) {
  if (p === null) return <span style={{ fontSize: 20, color: C.pudar }}>–</span>;
  const w = warnaCapaian(p);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", position: "relative", width: 82, height: 12, borderRadius: 6, background: "rgba(13,35,80,.09)" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: 12, width: `${Math.min(p, 100)}%`, borderRadius: 6, background: w }} />
        {laju !== null && <div style={{ position: "absolute", left: `${laju * 100}%`, top: -5, height: 22, width: 0, borderLeft: `2px dashed ${C.navy}` }} />}
      </div>
      <span style={{ display: "flex", justifyContent: "flex-end", width: 52, fontSize: 21, fontWeight: 800, color: w }}>{`${p}%`}</span>
    </div>
  );
}
