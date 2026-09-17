/**
 * Palet halaman peta.
 *
 * Nilainya SENGAJA sama dengan `/admin/peta-gardu` dan tab peta
 * monitoring-inspeksi — ketiganya satu keluarga layar gelap bertinta navy, dan
 * kalau dibiarkan masing-masing memilih sendiri, tiga peta di aplikasi yang
 * sama akan terlihat seperti tiga aplikasi.
 *
 * Hex mentah, bukan token `@theme`, karena token di sana dirancang untuk
 * permukaan TERANG: `bg-sidebar` bernilai #e9edf5 dan pernah dipakai di sini
 * dengan teks putih — hasilnya panel yang tidak terbaca sama sekali.
 */

export const PANEL = "#0a1628";
export const BIDANG = "#0d1b2a";
export const GARIS = "#1e3552";

/** Warna lapisan. Dipakai DUA KALI masing-masing: di peta, dan sebagai warna
 *  kotak centangnya di panel — jadi centang itu sekaligus legenda, dan tidak
 *  ada yang perlu menghafal garis biru itu JTM atau JTR. */
export const WARNA = {
  jtm: "#3B82F6",
  jtr: "#14B8A6",
  // Merah, bukan hijau. Latar peta ini citra satelit Lombok — hijau di atas
  // vegetasi hijau praktis hilang. Merah juga satu-satunya rona yang belum
  // terpakai di sini (biru JTM, teal JTR, kuning rute), jadi tidak ada dua
  // benda yang bisa tertukar. Di /admin/peta-gardu warna gardu mengikuti
  // KONDISI, bukan jenisnya, jadi tidak ada warna gardu baku yang dilanggar.
  gardu: "#EF4444",
  rute: "#F59E0B",
} as const;

export const INPUT =
  "w-full rounded-lg px-2.5 py-1.5 text-xs text-[#e2e8f0] bg-[#0d1b2a] border border-[#1e3552] " +
  "placeholder:text-gray-500 focus:outline-none focus:border-[#00897B] focus:ring-1 focus:ring-[#00897B]/20";

export const JUDUL_BAGIAN =
  "text-[10px] text-gray-500 uppercase tracking-wider font-semibold";
