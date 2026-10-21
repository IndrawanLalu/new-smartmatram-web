import {
  LayoutDashboard, Map, Users, ClipboardList, Gauge, FileText, Target, UserCog,
  MessageSquare, CalendarDays, BrainCircuit, ShieldCheck, SearchCheck, Radar,
  TrendingUp, TriangleAlert, Table2, Wrench, Radio, ZapOff, Network, Database, Waypoints,
  Globe, Zap, Spline, Trees, Activity, HardHat, ArrowUpDown, Images, PencilRuler,
  type LucideIcon,
} from "lucide-react";

/**
 * Peta navigasi admin — SATU sumber nama halaman.
 *
 * Dipakai tiga tempat: rel navigasi di sidebar, nama kelompok di topbar, dan
 * kepala halaman (`_kit/KepalaOtomatis.tsx`: ikon, judul, keterangan). Sebelumnya daftar ini hidup di dalam
 * AdminSidebar, sehingga topbar tidak punya cara tahu halaman apa yang terbuka
 * tanpa menyalin daftarnya — dan salinan itu pasti melenceng cepat atau lambat.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Satu kalimat di kepala halaman (UI baru, rencana-ui-baru.md). */
  keterangan?: string;
  /** Layar penuh (peta, command center): tanpa kepala halaman; nama
   *  halamannya ditulis di topbar. */
  layarPenuh?: boolean;
}

/** Grup tidak berikon: hanya item yang berikon, supaya rel ikon di kiri lurus. */
export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

/** Setiap item pakai ikon yang BERBEDA — ikon ganda membuat mata tidak bisa
 *  memakainya sebagai penanda, jadi tinggal membaca teks. */
export const NAV_GROUPS: NavGroup[] = [
  {
    key: "analitik",
    label: "Analitik",
    items: [
      { href: "/admin/dashboard",            label: "Dashboard",            icon: LayoutDashboard, keterangan: "Ringkasan jaringan, gangguan, dan pekerjaan lapangan." },
      { href: "/admin/advanced-dashboard",   label: "Advanced Analytics",   icon: TrendingUp, keterangan: "Analisis mendalam & pengambilan keputusan manajemen." },
      { href: "/admin/cara-kerja-ml",        label: "SMART Learning",       icon: BrainCircuit, keterangan: "Mesin prediksi yang belajar dari data gangguan — memperkirakan penyulang berisiko, dijelaskan sederhana." },
      { href: "/admin/efektifitas-inspeksi", label: "Efektivitas Inspeksi", icon: ShieldCheck, keterangan: "Korelasi inspeksi & eksekusi terhadap jumlah gangguan per penyulang." },
    ],
  },
  {
    // Gardu, penyulang, dan (menyusul) segmen harus saling terikat: penyulang
    // di gardu tidak boleh berbeda dengan master JTM. Selama ketiganya tersebar
    // sebagai tab di dalam modul yang berlainan, tidak ada tempat yang bisa
    // memperlihatkan bahwa ketiganya sudah cocok — dan yang tidak terlihat
    // tidak pernah diperiksa.
    key: "master",
    label: "Master Data",
    items: [
      { href: "/admin/master-gardu",     label: "Master Gardu",     icon: Database, keterangan: "Data induk gardu distribusi: kode, lokasi, daya, dan penyulangnya." },
      { href: "/admin/master-penyulang", label: "Master Penyulang", icon: Zap, keterangan: "Data induk penyulang beserta ULP dan gardu induknya." },
      { href: "/admin/master-segmen",    label: "Master Segmen",    icon: Spline, keterangan: "Data induk segmen jaringan JTM per penyulang." },
      { href: "/admin/survey-jaringan",  label: "Survey Jaringan Baru", icon: PencilRuler, keterangan: "Rencana jaringan baru digambar di peta — jadi aset saat dioperasikan." },
    ],
  },
  {
    // Delapan jenis pekerjaan yang kinerjanya dilaporkan sebagai satu kesatuan.
    // Sebelumnya tersebar di Monitoring dan Operasional — dikelompokkan menurut
    // BENTUK layarnya (peta, tabel, WO), bukan menurut pekerjaannya. Akibatnya
    // tidak ada satu tempat pun yang bisa menjawab "berapa capaian Yantek bulan
    // ini", dan tiap jenis pekerjaan harus dibuka satu per satu lalu dijumlah
    // di kepala.
    //
    // Rekap Kinerja ditaruh PALING ATAS: dialah yang menyebut mana di antara
    // kedelapan yang sudah ada dan mana yang belum.
    key: "yantek",
    label: "Kinerja Yantek",
    items: [
      { href: "/admin/kinerja-yantek",   label: "Rekap Kinerja",             icon: Activity, keterangan: "Monitoring kinerja pekerjaan teknis dan pelayanan pada jaringan distribusi." },
      { href: "/admin/wo-perabasan",     label: "Perabasan Pohon",           icon: Trees, keterangan: "Monitoring dan rekap kegiatan perabasan pohon pada jaringan distribusi." },
      { href: "/admin/pemeliharaan-jaringan", label: "Pemeliharaan Jaringan", icon: HardHat, keterangan: "Pemeliharaan JTM dan JTR yang dicatat regu dari lapangan." },
      { href: "/admin/hargardu",         label: "Pemeliharaan Gardu",        icon: Wrench, keterangan: "WO dan hasil pemeliharaan gardu distribusi." },
      { href: "/admin/optimasi-trafo",   label: "Optimasi Trafo",            icon: ArrowUpDown, keterangan: "Penggantian dan pemindahan trafo untuk menyeimbangkan beban gardu." },
      { href: "/admin/pengukuran-gardu", label: "Pengukuran Gardu",          icon: Gauge, keterangan: "Pengukuran beban gardu, anomali, dan WO pengukuran." },
      { href: "/admin/jtm",              label: "Inspeksi JTM",              icon: Waypoints, keterangan: "Inspeksi jaringan tegangan menengah per segmen beserta temuannya." },
      { href: "/admin/jtr",              label: "Inspeksi JTR",              icon: Network, keterangan: "Inspeksi jaringan tegangan rendah per gardu beserta temuannya." },
    ],
  },
  {
    key: "monitoring",
    label: "Monitoring",
    items: [
      { href: "/admin/monitoring-inspeksi", label: "Monitoring Inspeksi",  icon: SearchCheck, keterangan: "Temuan inspeksi jaringan dan pohon beserta tindak lanjutnya." },
      { href: "/admin/command-center",      label: "Command Center",       icon: Radar, layarPenuh: true },
      { href: "/admin/peta-gardu",          label: "Peta SLD",             icon: Map, layarPenuh: true },
      { href: "/admin/peta",                label: "Peta Jaringan",        icon: Globe, layarPenuh: true },
    ],
  },
  {
    key: "operasional",
    label: "Operasional",
    items: [
      { href: "/admin/work-order",            label: "Work Order",           icon: ClipboardList, keterangan: "Buat WO bulanan, petugas kerjakan di mobile, realisasi terhitung otomatis." },
      { href: "/admin/morning-brief",         label: "Morning Brief",        icon: FileText, keterangan: "Rangkuman kejadian kemarin yang dikirim ke grup setiap pagi." },
      { href: "/admin/gambar-laporan",        label: "Gambar Laporan",       icon: Images, keterangan: "Infografis laporan siap bagi (PNG): pilih jenis, ULP, dan bulan." },
      { href: "/admin/scoreboard",            label: "Score Board LM",       icon: Target, keterangan: "Lead measure tim dan rekap gangguan penyulang per bulan." },
      { href: "/admin/yantek",                label: "Analisis Yantek",      icon: Wrench, keterangan: "Analisis gangguan dan kinerja pelayanan teknik." },
      { href: "/admin/padam-apkt",            label: "Rekap Padam APKT",     icon: ZapOff, keterangan: "Import & analisis data gangguan penyulang dari APKT." },
      { href: "/admin/detail-gangguan",       label: "Kode G APKT",          icon: TriangleAlert, keterangan: "Kode G gangguan APKT per penyulang." },
      { href: "/admin/rekap-produktivitas",   label: "Rekap Produktivitas",  icon: CalendarDays, keterangan: "Jumlah pekerjaan yang diselesaikan per petugas per hari." },
    ],
  },
  {
    key: "manajemen",
    label: "Manajemen",
    items: [
      { href: "/admin/petugas",          label: "Manajemen Petugas", icon: Users, keterangan: "Kelola data petugas lapangan." },
      { href: "/admin/user-management",  label: "Manajemen User",    icon: UserCog, keterangan: "Kelola akun dan hak akses pengguna." },
      { href: "/admin/settings/wa",      label: "Setting WA Group",  icon: MessageSquare, keterangan: "Konfigurasi group WA tujuan untuk setiap notifikasi." },
      { href: "/admin/settings/amg",     label: "Setting AMG",       icon: Radio, keterangan: "Kredensial login AMG per ULP — dipakai agen lokal untuk mengirim pengukuran." },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    items: [
      { href: "/admin/json-to-table", label: "JSON ke Tabel", icon: Table2, keterangan: "Tempel JSON, langsung jadi tabel yang bisa dicari & diurutkan." },
    ],
  },
];

/** Semua item, datar — untuk pencocokan rute. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/**
 * Item nav yang cocok dengan sebuah pathname.
 *
 * Dicocokkan dari href TERPANJANG lebih dulu supaya rute bersarang tidak
 * tersambar induknya (`/admin/work-order/abc` harus jatuh ke Work Order, dan
 * `/admin/settings/wa` tidak boleh cocok dengan `/admin/settings`).
 */
export function findNavItem(pathname: string): NavItem | null {
  const cocok = NAV_ITEMS
    .filter((it) => pathname === it.href || pathname.startsWith(it.href + "/"))
    .sort((a, b) => b.href.length - a.href.length);
  return cocok[0] ?? null;
}

/** Item menu untuk sebuah alamat — cocok persis, atau alamat di bawahnya
 *  (`/admin/work-order/123` → Work Order). */
export function itemUntuk(pathname: string): { item: NavItem; grup: NavGroup } | null {
  for (const grup of NAV_GROUPS) {
    for (const item of grup.items) {
      if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return { item, grup };
    }
  }
  return null;
}
