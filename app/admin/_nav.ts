import {
  LayoutDashboard, Map, Users, ClipboardList, Gauge, FileText, Target, UserCog,
  MessageSquare, CalendarDays, BrainCircuit, ShieldCheck, SearchCheck, Radar,
  TrendingUp, TriangleAlert, Table2, Wrench, Radio, ZapOff, Network,
  type LucideIcon,
} from "lucide-react";

/**
 * Peta navigasi admin — SATU sumber nama halaman.
 *
 * Dipakai dua tempat: rel navigasi di sidebar, dan judul halaman di topbar
 * (`_components/PageTitle.tsx`). Sebelumnya daftar ini hidup di dalam
 * AdminSidebar, sehingga topbar tidak punya cara tahu halaman apa yang terbuka
 * tanpa menyalin daftarnya — dan salinan itu pasti melenceng cepat atau lambat.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
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
      { href: "/admin/dashboard",            label: "Dashboard",            icon: LayoutDashboard },
      { href: "/admin/advanced-dashboard",   label: "Advanced Analytics",   icon: TrendingUp },
      { href: "/admin/cara-kerja-ml",        label: "SMART Learning",       icon: BrainCircuit },
      { href: "/admin/efektifitas-inspeksi", label: "Efektivitas Inspeksi", icon: ShieldCheck },
    ],
  },
  {
    key: "monitoring",
    label: "Monitoring",
    items: [
      { href: "/admin/monitoring-inspeksi", label: "Monitoring Inspeksi",  icon: SearchCheck },
      { href: "/admin/pengukuran-gardu",    label: "Pengukuran Gardu",     icon: Gauge },
      { href: "/admin/command-center",      label: "Command Center",       icon: Radar },
      { href: "/admin/peta-gardu",          label: "Peta Aset",            icon: Map },
      { href: "/admin/jtr",                 label: "Inspeksi JTR",         icon: Network },
    ],
  },
  {
    key: "operasional",
    label: "Operasional",
    items: [
      { href: "/admin/work-order",            label: "Work Order",           icon: ClipboardList },
      { href: "/admin/morning-brief",         label: "Morning Brief",        icon: FileText },
      { href: "/admin/scoreboard",            label: "Score Board LM",       icon: Target },
      { href: "/admin/yantek",                label: "Analisis Yantek",      icon: Wrench },
      { href: "/admin/padam-apkt",            label: "Rekap Padam APKT",     icon: ZapOff },
      { href: "/admin/detail-gangguan",       label: "Kode G APKT",          icon: TriangleAlert },
      { href: "/admin/rekap-produktivitas",   label: "Rekap Produktivitas",  icon: CalendarDays },
    ],
  },
  {
    key: "manajemen",
    label: "Manajemen",
    items: [
      { href: "/admin/petugas",          label: "Manajemen Petugas", icon: Users },
      { href: "/admin/user-management",  label: "Manajemen User",    icon: UserCog },
      { href: "/admin/settings/wa",      label: "Setting WA Group",  icon: MessageSquare },
      { href: "/admin/settings/amg",     label: "Setting AMG",       icon: Radio },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    items: [
      { href: "/admin/json-to-table", label: "JSON ke Tabel", icon: Table2 },
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
