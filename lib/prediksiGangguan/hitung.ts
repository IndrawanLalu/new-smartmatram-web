import { arusDiTitik, bacaArus, xsDariArus, type Arus, type BacaanArus } from "./arus";
import { alatMilik, cariAlat, hilir, muatJaringan, namaAlat, namaPenyulangJtm, type Jaringan, type Titik } from "./jaringan";
import { garduSekitar, patokanDekat, temuanTerbuka, namaTitikAlat, type Gardu, type Patokan } from "./patokan";
import { sumberTrafo, trafoPenyulang, type Sumber } from "./sumber";

/**
 * Prediksi lokasi gangguan penyulang dari arus gangguan (rencana 31 Okt 2026,
 * diuji: Bung Karno Rec. Karang Seme 28-10 → asli BKR-108L001R003, Rec.
 * Crystal Regency 29-10 → asli BKR-122R003, dua-duanya masuk calon).
 *
 * OC  → calon tiang di zona peralatan yang trip, diurutkan dari arus yang
 *       paling cocok, dikelompokkan per cabang + patokan terdekat.
 * EF  → zona saja, dibagi seksi LBSM/FCO (besar arus tanah tidak peka jarak).
 */

export interface MasukanPrediksi {
  penyulang: string;
  keypoint: string | null;
  arus: Arus;
  bebanKw: number | null;
  trafoGi: string | null;
  /** Rapor akurasi: jangan pakai temuan ini sebagai kalibrasi. */
  kecualiTemuan?: number;
  /** Tiang lokasi temuan — diisi untuk menilai prediksi & menghitung kalibrasi. */
  tiangTemuan?: string;
}

/** Penilaian prediksi terhadap lokasi temuan yang sebenarnya. */
export interface Uji {
  masukZona: boolean;
  /** Peringkat tiang temuan di daftar calon OC (null = tidak masuk calon). */
  peringkat: number | null;
  /** Urutan saran yang memuat tiang temuan: kelompok cabang (OC) atau seksi (EF) —
   *  urutan yang dibaca regu di WA. */
  saranKe: number | null;
  kmTemuan: number | null;
  /** Selisih jarak tiang temuan dengan calon nomor 1 (km). */
  selisihKm: number | null;
  /** Xs yang membuat arus di tiang temuan tepat sama dengan arus terukur (OC). */
  xsHitung: number | null;
}

export interface Calon { id: string; kode: string; km: number; lat: number | null; lng: number | null; arus: number }

export interface Cabang {
  /** Awalan kode cabang, mis. "BKR-122R". */
  awalan: string;
  label: string;
  dari: string;
  sampai: string;
  jumlah: number;
}

/**
 * Satu saran OC = satu area berpatokan sama. Cabang-cabang yang jaraknya sama
 * dari GI arusnya pasti sama, jadi urutan di antara mereka nyaris acak — regu
 * lebih tertolong oleh "cek seputaran LBSM BUNGKARNO" sebagai satu area
 * daripada tiga baris cabang (Crystal Regency 29-10-2026).
 */
export interface Kelompok {
  cabang: Cabang[];
  kmDari: number;
  kmSampai: number;
  jumlah: number;
  /** Peringkat calon terbaik di kelompok ini (1 = paling cocok). */
  peringkat: number;
  patokan: Patokan[];
  temuan: number;
  temuanRow: number;
  lat: number | null;
  lng: number | null;
}

export interface Seksi {
  pangkal: string;
  kode: string;
  lat: number | null;
  lng: number | null;
  jumlah: number;
  km: number;
  patokan: Patokan[];
  temuan: number;
  temuanRow: number;
}

export interface HasilPrediksi {
  penyulang: string;
  penyulangJtm: string | null;
  bacaan: BacaanArus;
  sumber: Sumber | null;
  alat: { nama: string; kode: string | null; km: number | null; ditemukan: boolean };
  zona: { tiang: number; km: number; kmDari: number; kmSampai: number; dikecualikan: string[] } | null;
  calon: Calon[];
  kelompok: Kelompok[];
  /** EF: peralatan di zona — dicek lebih dulu, cepat dilihat dari jalan. */
  peralatan: { nama: string; kode: string; lat: number | null; lng: number | null }[];
  seksi: Seksi[];
  /** Kalau OC: arus di zona berkisar ini (dengan Xs tengah). */
  arusZona: [number, number] | null;
  catatan: string[];
  uji?: Uji;
}

const SEKSI_ALAT = new Set(["lbsm", "lbs", "fco", "sso"]);
const ALAT_CEK = new Set(["recloser", "lbsm", "lbs", "fco", "sso"]);
const kepalaSeksi = (j: Jaringan, t: Titik) => !!t.penanda && SEKSI_ALAT.has(t.penanda) && alatMilik(j, t);

const kunciCabang = (kode: string) => kode.match(/^(.*?)\d+[a-z]?$/i)?.[1] ?? kode;
const labelCabang = (awalan: string) =>
  awalan.endsWith("-") ? "Jalur utama" : `Cabang dari ${awalan.slice(0, -1)}`;

/** Zona = hilir alat yang trip, tanpa hilir recloser lain di bawahnya (yang itu akan trip sendiri). */
function zonaProteksi(j: Jaringan, awal: string[]): { ids: Set<string>; dikecualikan: Titik[] } {
  const semua = new Set(awal.flatMap((a) => hilir(j, a)));
  const dikecualikan: Titik[] = [];
  for (const id of semua) {
    const t = j.titik.get(id)!;
    if (t.penanda === "recloser" && !awal.includes(id) && alatMilik(j, t)) dikecualikan.push(t);
  }
  for (const r of dikecualikan) for (const id of hilir(j, r.id)) semua.delete(id);
  return { ids: new Set([...semua].filter((id) => j.titik.get(id)!.anggota)), dikecualikan };
}

function bagiSeksi(j: Jaringan, ids: Set<string>, pangkal: Titik): Map<string, string[]> {
  const seksi = new Map<string, string[]>();
  for (const id of ids) {
    let c = j.titik.get(id)!;
    while (c.id !== pangkal.id && !kepalaSeksi(j, c) && c.induk && ids.has(c.induk)) c = j.titik.get(c.induk)!;
    const kepala = kepalaSeksi(j, c) ? c.id : pangkal.id;
    (seksi.get(kepala) ?? seksi.set(kepala, []).get(kepala)!).push(id);
  }
  return seksi;
}

const panjangRuas = (j: Jaringan, t: Titik) => (t.induk ? t.km - j.titik.get(t.induk)!.km : 0);

export async function prediksiLokasi(m: MasukanPrediksi): Promise<HasilPrediksi> {
  const bacaan = bacaArus(m.arus, m.bebanKw);
  const catatan: string[] = [];
  const kosong: HasilPrediksi = {
    penyulang: m.penyulang, penyulangJtm: null, bacaan, sumber: null,
    alat: { nama: m.keypoint ?? m.penyulang, kode: null, km: null, ditemukan: false },
    zona: null, calon: [], kelompok: [], peralatan: [], seksi: [], arusZona: null, catatan,
  };

  // Sheet kadang menulis recloser di kolom penyulang ("REC. TATO"); laporan WA benar.
  const nama = await namaPenyulangJtm(m.penyulang);
  if (!nama) {
    catatan.push(`Jaringan penyulang ${m.penyulang} belum ada di data JTM — lokasi belum bisa dihitung.`);
    return kosong;
  }
  const j = await muatJaringan(nama);
  if (!j) {
    catatan.push(`Penyulang ${nama} belum punya tiang di data JTM.`);
    return { ...kosong, penyulangJtm: nama };
  }

  const keypoint = m.keypoint && namaAlat(m.keypoint) !== namaAlat(nama) && namaAlat(m.keypoint) !== namaAlat(m.penyulang) ? m.keypoint : null;
  const alat = keypoint ? cariAlat(j, keypoint) : null;
  const akar = [...j.titik.values()].filter((t) => !t.induk).map((t) => t.id);
  if (keypoint && !alat) catatan.push(`${keypoint} belum tercatat di peta JTM — zona dihitung untuk seluruh penyulang.`);
  const { ids, dikecualikan } = alat ? zonaProteksi(j, [alat.id]) : keypoint ? { ids: new Set([...j.titik.values()].filter((t) => t.anggota).map((t) => t.id)), dikecualikan: [] } : zonaProteksi(j, akar);
  const zonaTitik = [...ids].map((id) => j.titik.get(id)!);
  if (!zonaTitik.length) {
    catatan.push("Zona peralatan yang trip kosong di data JTM.");
    return { ...kosong, penyulangJtm: nama };
  }
  const kmZona = zonaTitik.map((t) => t.km);
  const hasil: HasilPrediksi = {
    ...kosong,
    penyulangJtm: nama,
    alat: { nama: keypoint ?? `PMT ${nama} (GI)`, kode: alat?.kode ?? null, km: alat?.km ?? null, ditemukan: !!alat || !keypoint },
    zona: {
      tiang: zonaTitik.length,
      km: zonaTitik.reduce((s, t) => s + panjangRuas(j, t), 0),
      kmDari: Math.min(...kmZona),
      kmSampai: Math.max(...kmZona),
      dikecualikan: dikecualikan.map(namaTitikAlat),
    },
  };
  if (dikecualikan.length) catatan.push(`Hilir ${dikecualikan.map(namaTitikAlat).join(", ")} tidak dihitung — gangguan di sana akan memutus recloser itu sendiri.`);
  const tanpaData = Math.max(...zonaTitik.map((t) => t.tanpaData));
  if (tanpaData > 0.3) catatan.push(`±${tanpaData.toFixed(1).replace(".", ",")} km jalur belum punya data konduktor — dianggap AAAC 150.`);

  const [gardu, temuan] = await Promise.all([
    garduSekitar(zonaTitik).catch(() => [] as Gardu[]),
    temuanTerbuka([...ids]).catch(() => new Map<string, { n: number; row: number }>()),
  ]);
  const hitungTemuan = (daftar: string[]) => daftar.reduce(
    (s, id) => { const x = temuan.get(id); return x ? { n: s.n + x.n, row: s.row + x.row } : s; }, { n: 0, row: 0 });

  if (bacaan.jenis === "OC2" || bacaan.jenis === "OC3") {
    const jenis = bacaan.jenis;
    const sumber = await sumberTrafo(m.trafoGi ?? (await trafoPenyulang(m.penyulang)), m.kecualiTemuan);
    hasil.sumber = sumber;
    if (!sumber.trafo) catatan.push("Trafo GI penyulang ini belum diketahui — kekuatan sumber diperkirakan kasar.");
    else if (sumber.asal === "perkiraan") catatan.push(`${sumber.trafo} belum terkalibrasi — isi lokasi temuan gangguan OC di web supaya lebih tepat.`);

    const [lo, hi] = bacaan.rentang!;
    const tengah = (lo + hi) / 2;
    const arusTengah = zonaTitik.map((t) => arusDiTitik(jenis, t.r, t.x, sumber.xs));
    hasil.arusZona = [Math.min(...arusTengah), Math.max(...arusTengah)];
    hasil.calon = zonaTitik
      .filter((t) => arusDiTitik(jenis, t.r, t.x, sumber.rentang[0]) >= lo && arusDiTitik(jenis, t.r, t.x, sumber.rentang[1]) <= hi)
      .map((t) => ({ id: t.id, kode: t.kode, km: t.km, lat: t.lat, lng: t.lng, arus: arusDiTitik(jenis, t.r, t.x, sumber.xs) }))
      .sort((a, b) => Math.abs(a.arus - tengah) - Math.abs(b.arus - tengah));

    if (!hasil.calon.length) {
      catatan.push(tengah > hasil.arusZona[1]
        ? "Arus lebih besar dari yang mungkin di zona ini — gangguan kemungkinan di dekat peralatan yang trip, atau kalibrasi sumber perlu diperbarui."
        : "Arus lebih kecil dari yang mungkin di zona ini — kemungkinan ada tahanan di titik gangguan (pohon/benda asing) atau jaringan di ujung belum terpetakan.");
    } else {
      const grup = new Map<string, { calon: Calon; peringkat: number }[]>();
      hasil.calon.forEach((c, i) => {
        const k = kunciCabang(c.kode);
        (grup.get(k) ?? grup.set(k, []).get(k)!).push({ calon: c, peringkat: i + 1 });
      });
      const perCabang = [...grup].map(([awalan, isi]) => {
        const urutKm = [...isi].sort((a, b) => a.calon.km - b.calon.km);
        const terbaik = isi[0];
        const tm = hitungTemuan(isi.map((x) => x.calon.id));
        return {
          cabang: [{ awalan, label: labelCabang(awalan), dari: urutKm[0].calon.kode, sampai: urutKm[urutKm.length - 1].calon.kode, jumlah: isi.length }],
          kmDari: urutKm[0].calon.km,
          kmSampai: urutKm[urutKm.length - 1].calon.km,
          jumlah: isi.length,
          peringkat: terbaik.peringkat,
          patokan: patokanDekat(j, j.titik.get(terbaik.calon.id)!, gardu),
          temuan: tm.n,
          temuanRow: tm.row,
          lat: terbaik.calon.lat,
          lng: terbaik.calon.lng,
        };
      }).sort((a, b) => a.peringkat - b.peringkat);
      // Gabung cabang berpatokan sama jadi satu saran (urutan = cabang terbaiknya).
      const area = new Map<string, Kelompok>();
      for (const k of perCabang) {
        const kunci = k.patokan.length ? k.patokan.map((p) => p.nama).join("|") : `cabang:${k.cabang[0].awalan}`;
        const ada = area.get(kunci);
        if (!ada) { area.set(kunci, k); continue; }
        ada.cabang.push(...k.cabang);
        ada.kmDari = Math.min(ada.kmDari, k.kmDari);
        ada.kmSampai = Math.max(ada.kmSampai, k.kmSampai);
        ada.jumlah += k.jumlah;
        ada.temuan += k.temuan;
        ada.temuanRow += k.temuanRow;
      }
      hasil.kelompok = [...area.values()];
    }
  } else {
    catatan.push(bacaan.jenis === "EF"
      ? "Gangguan tanah (EF): NGR membatasi arusnya sehingga jarak tidak bisa diperkirakan — cek peralatan dulu, lalu seksi terpanjang."
      : `Jenis gangguan tidak terbaca dari arus (${bacaan.alasan}) — telusuri per seksi.`);
  }

  // Seksi: selalu untuk EF/tak jelas; untuk OC hanya saat tidak ada calon.
  let seksiIsi: string[][] = [];
  if (!hasil.calon.length) {
    const pangkal = alat ?? j.titik.get(akar[0])!;
    const urut = [...bagiSeksi(j, ids, pangkal)].map(([kepala, isi]) => {
      const k = j.titik.get(kepala)!;
      const tm = hitungTemuan(isi);
      const seksi: Seksi = {
        pangkal: kepala === pangkal.id ? hasil.alat.nama : namaTitikAlat(k),
        kode: k.kode,
        lat: k.lat,
        lng: k.lng,
        jumlah: isi.length,
        km: isi.reduce((s, id) => s + panjangRuas(j, j.titik.get(id)!), 0),
        patokan: patokanDekat(j, k, gardu).filter((p) => p.jenis === "gardu"),
        temuan: tm.n,
        temuanRow: tm.row,
      };
      return { seksi, isi };
    // Seksi terpanjang dulu: makin panjang jaringan makin besar peluang terkena,
    // apa pun penyebabnya. Uji 3 EF (1 Nov 2026): 36/100/47 % jaringan disisir,
    // lebih hemat dari urutan temuan ROW (55/100/47 %). Temuan tetap ditampilkan.
    }).sort((a, b) => b.seksi.km - a.seksi.km);
    hasil.seksi = urut.map((u) => u.seksi);
    seksiIsi = urut.map((u) => u.isi);
    // Peralatan di zona dicek dulu: jumperan/isolator/FCO cepat dilihat dari jalan
    // (Cemara 3-10-2026: jumperan LBSM putus).
    hasil.peralatan = zonaTitik
      .filter((t) => t.penanda && ALAT_CEK.has(t.penanda) && alatMilik(j, t))
      .sort((a, b) => a.km - b.km)
      .map((t) => ({ nama: namaTitikAlat(t), kode: t.kode, lat: t.lat, lng: t.lng }));
  }

  if (m.tiangTemuan) {
    const t = j.titik.get(m.tiangTemuan);
    const peringkat = hasil.calon.findIndex((c) => c.id === m.tiangTemuan);
    const ke = peringkat < 0
      ? seksiIsi.findIndex((isi) => isi.includes(m.tiangTemuan!))
      : hasil.kelompok.findIndex((k) => k.cabang.some((c) => c.awalan === kunciCabang(hasil.calon[peringkat].kode)));
    const oc = bacaan.jenis === "OC2" || bacaan.jenis === "OC3" ? bacaan.jenis : null;
    hasil.uji = {
      masukZona: ids.has(m.tiangTemuan),
      peringkat: peringkat < 0 ? null : peringkat + 1,
      saranKe: ke < 0 ? null : ke + 1,
      kmTemuan: t?.km ?? null,
      selisihKm: t && hasil.calon[0] ? Math.abs(t.km - hasil.calon[0].km) : null,
      xsHitung: t && oc && bacaan.rentang ? xsDariArus(oc, t.r, t.x, (bacaan.rentang[0] + bacaan.rentang[1]) / 2) : null,
    };
  }
  return hasil;
}

export async function jaringanUntuk(penyulang: string): Promise<Jaringan | null> {
  const nama = await namaPenyulangJtm(penyulang);
  return nama ? muatJaringan(nama) : null;
}
