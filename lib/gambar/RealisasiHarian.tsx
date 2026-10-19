import type React from "react";
import { META } from "@/app/admin/kinerja-yantek/_lib/kinerjaMeta";
import { nilaiUtama, type BarisBulanan } from "@/app/admin/kinerja-yantek/_lib/realisasiBulanan";
import type { GambarBingkai } from "./aset";
import { ATAS_ISI, Bingkai, TINGGI_FOOTER } from "./Bingkai";
import { BULAN, C, G_LEBAR, G_TINGGI, tglPanjang } from "./gaya";
import { Ikon, type NamaIkon } from "./ikon";
import { Sel } from "./Tabel";

/**
 * Gambar Realisasi Harian SMART Mataram — 11 jenis pekerjaan × 4 ULP + UP3.
 * Tiap sel berjajar: angka besar = hari itu │ total bulan berjalan s.d.
 * hari itu. Bintang = ULP unggul hari itu per jenis (aturannya sama dengan
 * bintang rekap bulanan: yang seri tidak dapat bintang).
 *
 * Yang dihitung pekerjaan utama, termasuk yang belum disetujui (sama dengan
 * Rekap Kinerja). Di luar WO dan tegangan ujung ditulis terpisah, tidak
 * dicampur ke angka utama. Tidak ada total antar-jenis — satuannya campur.
 */

const ULP = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"] as const;
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Ikon tiap jenis — sama dengan gambar Rekap Kinerja. */
const IKON: Record<string, NamaIkon> = {
  perabasan: "pohon", harjtm: "helm", hargardu: "kunciPas", penyeimbangan: "timbangan", optimasi: "tukar",
  jtm: "jalur", jtm2: "jalur", jtr: "jaringan", igardu1: "pindai", igardu2: "pindai", pengukuran: "meter",
};

// Tata letak: satu tabel selebar gambar (tanpa panel kanan).
const KIRI = 24;
const LEBAR = G_LEBAR - 2 * KIRI;
const BAWAH = G_TINGGI - TINGGI_FOOTER - 12;
const L_JENIS = 400;
const L_ULP = 290;
const L_UP3 = LEBAR - 32 - L_JENIS - ULP.length * L_ULP;
const T_KEPALA = 58;
const T_BARIS = 50;
const T_KAKI = 46;
const LATAR_UNGGUL = "#FFF6D1";

type Jenis = (typeof META)[number];

interface Angka {
  /** Nilai utama (KMS atau cacah). */
  nilai: number;
  luar: number;
  ujung: number;
}

interface SelUlp {
  hari: Angka;
  bulan: Angka;
}

const nol = (): Angka => ({ nilai: 0, luar: 0, ujung: 0 });
const tambah = (a: Angka, b: BarisBulanan, desimal: boolean) => {
  a.nilai += nilaiUtama(b, desimal);
  a.luar += b.luar;
  a.ujung += b.ujung;
};

/** KMS dua desimal berkoma, cacah bulat — sama dengan aplikasi. */
const teks = (v: number, desimal: boolean) =>
  desimal ? v.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v.toLocaleString("id-ID");

/** Tambahan di luar angka utama: "+3 luar WO", "+14 TU". */
const tambahan = (a: Angka) => [a.luar ? `+${a.luar} luar WO` : null, a.ujung ? `+${a.ujung} TU` : null].filter(Boolean).join(" · ");

/** ULP dengan nilai hari ini tertinggi; seri atau semua nol = tanpa bintang. */
function unggul(perUlp: Record<string, SelUlp>) {
  const maks = Math.max(...ULP.map((u) => perUlp[u].hari.nilai));
  if (maks <= 0) return null;
  const juara = ULP.filter((u) => perUlp[u].hari.nilai === maks);
  return juara.length === 1 ? juara[0] : null;
}

interface Props {
  gambar: GambarBingkai;
  /** YYYY-MM-DD */
  tgl: string;
  /** Jam pengambilan data (hari ini saja), mis. "18.00". */
  jam: string | null;
  /** Baris `realisasi_bulanan` bulan itu, sudah dipotong s.d. `tgl`. */
  baris: BarisBulanan[];
}

export function RealisasiHarian({ gambar, tgl, jam, baris }: Props) {
  const [y, m, d] = tgl.split("-").map(Number);
  const namaHari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  const bln = BULAN[m - 1].slice(0, 3);

  const tabel = META.map((jenis) => {
    const perUlp: Record<string, SelUlp> = {};
    const up3: SelUlp = { hari: nol(), bulan: nol() };
    for (const u of ULP) perUlp[u] = { hari: nol(), bulan: nol() };
    for (const b of baris.filter((x) => x.kunci === jenis.kunci)) {
      const s = perUlp[b.ulp];
      const hariIni = b.tgl === tgl;
      for (const t of s ? [s, up3] : [up3]) {
        tambah(t.bulan, b, jenis.desimal);
        if (hariIni) tambah(t.hari, b, jenis.desimal);
      }
    }
    return { jenis, perUlp, up3, juara: unggul(perUlp) };
  });

  // Kaki tabel: cacah objek (segmen/gardu/pekerjaan + luar WO + TU) dan yang belum disetujui.
  const kaki = (pilih: (b: BarisBulanan) => number) => {
    const hitung = (xs: BarisBulanan[]) => ({
      hari: xs.filter((b) => b.tgl === tgl).reduce((s, b) => s + pilih(b), 0),
      bulan: xs.reduce((s, b) => s + pilih(b), 0),
    });
    return { perUlp: Object.fromEntries(ULP.map((u) => [u, hitung(baris.filter((b) => b.ulp === u))])), up3: hitung(baris) };
  };
  const objek = kaki((b) => b.cacah + b.luar + b.ujung);
  const belum = kaki((b) => b.cacah - b.cacahSetuju);
  const sepi = ULP.filter((u) => objek.perUlp[u].hari === 0);

  return (
    <Bingkai
      gambar={gambar}
      unit="UP3 MATARAM"
      judul="REALISASI HARIAN"
      judulAksen="SMART MATARAM"
      meta={[
        { ikon: "kalender", teks: `${namaHari}, ${tglPanjang(tgl)}` },
        { ikon: "lokasi", teks: `UP3 Mataram · ${ULP.length} ULP` },
        ...(jam ? [{ ikon: "jamPasir" as const, teks: `Data pukul ${jam} WITA` }] : []),
      ]}
      keterangan={
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span>Angka besar = hari ini</span>
          <span>·</span>
          <span>{`di sampingnya = total ${BULAN[m - 1]} s.d. tanggal ${d}`}</span>
          <span>·</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Ikon nama="bintang" ukuran={24} warna={C.amber} />
            <span>ULP unggul hari ini</span>
          </div>
          <span>·</span>
          <span>– nihil · TU = tegangan ujung</span>
        </div>
      }
    >
      <div
        style={{
          position: "absolute", top: ATAS_ISI, left: KIRI, width: LEBAR, height: BAWAH - ATAS_ISI,
          display: "flex", flexDirection: "column", background: C.putih, borderRadius: 18, border: "1px solid #CFDDF0",
          padding: "14px 16px",
        }}
      >
        {/* Kepala */}
        <div style={{ display: "flex", height: T_KEPALA, flexShrink: 0, color: C.putih, fontSize: 20, fontWeight: 700, borderRadius: 8, overflow: "hidden" }}>
          <Sel k={{ lebar: L_JENIS, rata: "kiri" }} style={{ background: C.navy, gap: 9 }}>
            <Ikon nama="lapisan" ukuran={22} warna={C.putih} />
            <span>Jenis Pekerjaan</span>
          </Sel>
          {ULP.map((u) => (
            <Sel key={u} k={{ lebar: L_ULP }} style={{ background: C.navy, borderLeft: "1px solid rgba(255,255,255,.25)", flexDirection: "column" }}>
              <span>{u}</span>
              {sepi.includes(u) && <span style={{ fontSize: 13, fontWeight: 700, color: C.kuning, marginTop: 1 }}>belum ada kiriman hari ini</span>}
            </Sel>
          ))}
          <Sel k={{ lebar: L_UP3 }} style={{ background: C.hijau, borderLeft: "1px solid rgba(255,255,255,.25)" }}>
            <span>UP3 MATARAM</span>
          </Sel>
        </div>

        {/* Badan */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 4 }}>
          {tabel.map(({ jenis, perUlp, up3, juara }, i) => (
            <div key={jenis.kunci} style={{ display: "flex", height: T_BARIS, flexShrink: 0, background: i % 2 ? C.zebra : C.putih, borderBottom: `1px solid ${C.garis}` }}>
              <Sel k={{ lebar: L_JENIS, rata: "kiri" }}>
                <NamaJenis jenis={jenis} />
              </Sel>
              {ULP.map((u) => (
                <Sel key={u} k={{ lebar: L_ULP }} style={{ borderLeft: `1px solid ${C.garis}`, ...(juara === u ? { background: LATAR_UNGGUL } : {}) }}>
                  <Isi sel={perUlp[u]} desimal={jenis.desimal} bln={bln} lebar={L_ULP} bintang={juara === u} />
                </Sel>
              ))}
              <Sel k={{ lebar: L_UP3 }} style={{ borderLeft: `2px solid ${C.hijau}55`, background: C.hijauMuda }}>
                <Isi sel={up3} desimal={jenis.desimal} bln={bln} lebar={L_UP3} warna={C.hijauTua} />
              </Sel>
            </div>
          ))}
        </div>

        {/* Kaki */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 6, borderRadius: 8, overflow: "hidden" }}>
          <BarisKaki ikon="centang" warnaIkon={C.hijau} label="Objek dikerjakan" data={objek} bln={bln} warna={C.navy} />
          <BarisKaki ikon="jamPasir" warnaIkon={C.oranye} label="Belum disetujui" data={belum} bln={bln} warna={C.oranyeTua} />
        </div>
      </div>
    </Bingkai>
  );
}

function NamaJenis({ jenis }: { jenis: Jenis }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: C.biruMuda, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Ikon nama={IKON[jenis.kunci] ?? "lapisan"} ukuran={21} warna={C.biru} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "block", fontSize: jenis.jenis.length > 30 ? 15 : 18.5, fontWeight: 700, color: C.tinta, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 322 }}>
          {jenis.jenis}
        </div>
        <div style={{ display: "flex", fontSize: 13, fontWeight: 600, color: C.pudar }}>{`satuan ${jenis.satuan}`}</div>
      </div>
    </div>
  );
}

/** Satu sel, berjajar: [★] angka hari ini [+tambahan] │ total bulan. */
function Isi({ sel, desimal, bln, lebar, bintang, warna = C.tinta }: { sel: SelUlp; desimal: boolean; bln: string; lebar: number; bintang?: boolean; warna?: string }) {
  const { hari, bulan } = sel;
  const adaBulan = bulan.nilai || bulan.luar || bulan.ujung;
  if (!adaBulan) return <span style={{ fontSize: 22, color: C.pudar }}>–</span>;
  const tbHari = tambahan(hari);
  const tbBulan = tambahan(bulan);
  const kiri = Math.round(lebar * 0.46);
  return (
    <div style={{ display: "flex", alignItems: "center", width: lebar }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6, width: kiri, flexShrink: 0 }}>
        {bintang && <Ikon nama="bintang" ukuran={23} warna={C.amber} />}
        <span style={{ fontSize: 24, fontWeight: 800, color: hari.nilai ? warna : C.pudar }}>{hari.nilai ? teks(hari.nilai, desimal) : "–"}</span>
        {tbHari && <Pil teks={tbHari} />}
      </div>
      <div style={{ width: 0, height: 26, borderLeft: `1px solid ${C.pudar}66`, margin: "0 10px", flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600, color: C.tintaLembut, whiteSpace: "nowrap" }}>
        {`${bln} ${teks(bulan.nilai, desimal)}${tbBulan ? ` · ${tbBulan}` : ""}`}
      </span>
    </div>
  );
}

function Pil({ teks: t }: { teks: string }) {
  return (
    <span style={{ fontSize: 12.5, fontWeight: 700, color: C.biru, background: C.biruMuda, borderRadius: 9, padding: "1px 7px" }}>{t}</span>
  );
}

interface Kaki {
  perUlp: Record<string, { hari: number; bulan: number }>;
  up3: { hari: number; bulan: number };
}

function BarisKaki({ ikon, warnaIkon, label, data, bln, warna }: { ikon: NamaIkon; warnaIkon: string; label: string; data: Kaki; bln: string; warna: string }) {
  const sel = (v: { hari: number; bulan: number }, w: string, lebar: number): React.ReactNode =>
    v.bulan ? (
      <Isi sel={{ hari: { nilai: v.hari, luar: 0, ujung: 0 }, bulan: { nilai: v.bulan, luar: 0, ujung: 0 } }} desimal={false} bln={bln} lebar={lebar} warna={w} />
    ) : (
      <span style={{ fontSize: 22, color: C.pudar }}>–</span>
    );
  return (
    <div style={{ display: "flex", height: T_KAKI, flexShrink: 0, background: C.biruMuda, borderBottom: "1px solid #C6DBF3" }}>
      <Sel k={{ lebar: L_JENIS, rata: "kiri" }} style={{ gap: 10, fontSize: 18.5, fontWeight: 800, color: C.navy }}>
        <Ikon nama={ikon} ukuran={22} warna={warnaIkon} />
        <span>{label}</span>
      </Sel>
      {ULP.map((u) => (
        <Sel key={u} k={{ lebar: L_ULP }} style={{ borderLeft: "1px solid #C6DBF3" }}>
          {sel(data.perUlp[u], warna, L_ULP)}
        </Sel>
      ))}
      <Sel k={{ lebar: L_UP3 }} style={{ borderLeft: `2px solid ${C.hijau}55` }}>
        {sel(data.up3, C.hijauTua, L_UP3)}
      </Sel>
    </div>
  );
}
