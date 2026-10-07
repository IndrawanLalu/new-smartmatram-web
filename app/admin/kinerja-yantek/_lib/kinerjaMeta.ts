/**
 * Daftar jenis pekerjaan Rekap Kinerja (label, satuan, urutan) + hitung capaian.
 * Dipisah dari hook `useKinerjaYantek` (yang "use client") supaya rute server —
 * kirim rekap bulanan ke WA (`/api/rekap-kinerja-wa`) — memakai daftar yang SAMA
 * dengan layar. Urutan & isinya tidak berubah.
 */

/** Keadaan sebuah baris — menentukan apa yang boleh ditampilkan sebagai angka. */
export type Keadaan =
  /** Punya WO dan punya realisasi: keempat kolomnya berarti. */
  | "lengkap"
  /** Pekerjaannya tercatat, tapi belum ada WO yang menerbitkannya. */
  | "tanpaWo"
  /** Modulnya belum dibangun. */
  | "belumAda";

export interface BarisKinerja {
  kunci: string;
  jenis: string;
  /** Tautan ke modulnya — null kalau belum ada. */
  href: string | null;
  keadaan: Keadaan;
  /** "km", "gardu", "penyapuan gardu". Ditulis supaya angka di satu baris
   *  tidak dikira sebanding dengan baris lain. */
  satuan: string;
  /** Angka pecahan (km) atau cacah bulat. Menentukan cara menuliskannya. */
  desimal: boolean;
  woTerbit: number | null;
  /** Dinilai terhadap SLA saja. Inspeksi JTR: WO-nya disusun dari jalur yang
   *  dikerjakan, jadi WO = realisasi dan capaian WO selalu 100% — angka itu
   *  tidak berarti apa-apa dan menutupi capaian SLA (keputusan user 7 Okt 2026,
   *  sama dengan Beranda HP). */
  dinilaiSla?: boolean;
  /** Inspeksi JTR saja: jumlah gardu di WO. WO dari sistem belum tentu membawa
   *  KMS (panjang penghantar gardu belum terukur), sehingga WO yang ada tampil
   *  "0 KMS" — jumlah gardunya yang menunjukkan WO itu ada. */
  woGardu?: number | null;
  /** SLA periode ini — target bulanan per ULP yang diisi UP3/admin ULP
   *  (`sla_kinerja`), dijumlah untuk seluruh tahun / semua ULP. null = belum
   *  ada SLA. */
  sla: number | null;
  realisasi: number | null;
  belumApprove: number | null;
  /** Sumbernya gagal dibaca. Angkanya dikosongkan, BUKAN ditulis nol —
   *  nol yang dikarang tidak bisa dibedakan dari kinerja yang benar nihil. */
  gagal?: boolean;
  /** Kenapa belum ada, atau apa persisnya yang dihitung. */
  catatan: string;
}

const persen = (r: number | null, w: number | null) =>
  r === null || w === null || w === 0 ? null : Math.round((r / w) * 100);

/** Capaian WO = realisasi ÷ WO terbit. Kosong untuk baris yang dinilai
 *  terhadap SLA saja. */
export function capaianWo(b: BarisKinerja) {
  return b.dinilaiSla ? null : persen(b.realisasi, b.woTerbit);
}

/** Capaian SLA = SEMUA realisasi (WO + di luar WO) ÷ SLA — keputusan user
 *  25 Sep 2026. */
export function capaianSla(b: BarisKinerja) {
  return persen(b.realisasi, b.sla);
}

export const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Label & keterangan tiap baris — urutan di sini = urutan di layar, SAMA
 *  dengan urutan surat WO (`_lib/woSurat.ts`, ditetapkan user 29 Sep 2026). */
export const META: Omit<BarisKinerja, "woTerbit" | "sla" | "realisasi" | "belumApprove">[] = [
  {
    kunci: "perabasan",
    jenis: "Perabasan Pohon",
    href: "/admin/wo-perabasan",
    keadaan: "lengkap",
    satuan: "KMS",
    desimal: true,
    catatan: "Target dan capaian KMS dari WO Perabasan. Belum punya tahap persetujuan.",
  },
  {
    kunci: "harjtm",
    jenis: "Pemeliharaan Jaringan",
    href: "/admin/pemeliharaan-jaringan",
    keadaan: "tanpaWo",
    satuan: "pekerjaan",
    desimal: false,
    catatan:
      "WO dari tempelan Excel di Cetak / Kirim WO. Realisasi dicatat regu dari lapangan berikut foto sebelum-sesudah.",
  },
  {
    kunci: "hargardu",
    jenis: "Pemeliharaan Gardu",
    href: "/admin/hargardu",
    keadaan: "lengkap",
    satuan: "gardu",
    desimal: false,
    catatan: "WO Pemeliharaan bulanan. Realisasi = gardu WO yang pemeliharaannya sudah dikirim regu di bulan WO-nya.",
  },
  {
    kunci: "penyeimbangan",
    jenis: "Penyeimbangan Beban Trafo",
    href: "/admin/pengukuran-gardu",
    keadaan: "tanpaWo",
    satuan: "gardu",
    desimal: false,
    catatan: "WO = gardu anomali pengukuran yang di-WO-kan ke Pemerataan Beban (Bulan WO). Realisasi = pekerjaan yang sudah disetor regu (status Selesai, termasuk yang menunggu persetujuan), menurut tanggal pekerjaan.",
  },
  {
    kunci: "optimasi",
    jenis: "Optimasi Trafo",
    href: "/admin/optimasi-trafo",
    keadaan: "lengkap",
    satuan: "gardu",
    desimal: false,
    catatan:
      "WO = gardu yang ditandai OPTIMASI TRAFO di Tindak Lanjut Anomali pada periode ini, tanpa WO yang dibatalkan. Realisasi = catatan terkirim dari HP, termasuk yang di luar WO — jadi bisa melampaui WO-nya.",
  },
  {
    kunci: "jtm",
    jenis: "Inspeksi JTM Tier 1",
    href: "/admin/jtm",
    keadaan: "tanpaWo",
    satuan: "KMS",
    desimal: true,
    catatan:
      "WO = WO Inspeksi JTM (disusun di aplikasi atau ditempel) + tempelan yang segmennya belum ada di master. Realisasi = panjang segmen yang inspeksi tier 1-nya selesai.",
  },
  {
    kunci: "jtm2",
    jenis: "Inspeksi JTM Tier 2",
    href: "/admin/jtm",
    keadaan: "tanpaWo",
    satuan: "KMS",
    desimal: true,
    // `rencana-wo-jtm-tier2.md`: dua jalur — WO susun (segmen master, di HP)
    // dan tempelan Excel (dicentang di web). Rincian asal realisasinya
    // ditambahkan di bawah supaya hitungan ganda terlihat.
    catatan:
      "WO = WO Inspeksi JTM Tier 2 yang disusun di aplikasi + tempelan Excel. Realisasi = panjang segmen yang inspeksi tier 2-nya terkirim dari HP + tempelan yang dicentang di web.",
  },
  {
    kunci: "jtr",
    jenis: "Inspeksi JTR",
    href: "/admin/jtr",
    keadaan: "tanpaWo",
    satuan: "KMS",
    desimal: true,
    dinilaiSla: true,
    catatan:
      "Panjang penghantar gardu yang penyapuannya selesai, termasuk underbuild. WO dari WO Inspeksi JTR.",
  },
  {
    kunci: "igardu1",
    jenis: "Inspeksi Gardu Tier 1",
    href: null,
    keadaan: "tanpaWo",
    satuan: "gardu",
    desimal: false,
    catatan: "WO dari tempelan Excel. Modulnya belum ada — realisasi dicentang per gardu di web.",
  },
  {
    kunci: "igardu2",
    jenis: "Inspeksi Gardu Tier 2",
    href: null,
    keadaan: "tanpaWo",
    satuan: "gardu",
    desimal: false,
    catatan: "WO dari tempelan Excel. Modulnya belum ada — realisasi dicentang per gardu di web.",
  },
  {
    kunci: "pengukuran",
    jenis: "Pengukuran Beban Gardu dan Tegangan Ujung",
    href: "/admin/pengukuran-gardu",
    keadaan: "lengkap",
    satuan: "gardu",
    desimal: false,
    catatan: "WO Pengukuran bulanan. Realisasi = gardu WO yang pengukurannya sudah masuk.",
  },
];

/** Jenis pekerjaan untuk layar Atur SLA — urutan & satuan sama dengan tabel. */
export const JENIS_KINERJA = META.map(({ kunci, jenis, satuan, desimal }) => ({ kunci, jenis, satuan, desimal }));
