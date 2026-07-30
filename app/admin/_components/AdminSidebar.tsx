"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ChangePasswordModal from "./ChangePasswordModal";
import {
  LayoutDashboard,
  Map,
  BarChart3,
  Users,
  ClipboardList,
  Gauge,
  LogOut,
  Lock,
  Zap,
  ZapOff,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Target,
  UserCog,
  MessageSquare,
  CalendarDays,
  BrainCircuit,
  ShieldCheck,
  SearchCheck,
  Radar,
  TrendingUp,
  TriangleAlert,
  Table2,
  Wrench,
  Radio,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/login/actions";

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Grup tidak berikon: hanya item yang berikon, supaya rel ikon di kiri lurus. */
interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

interface AdminSidebarProps {
  userEmail: string;
  userName: string;
  userRole: string;
  userUnit: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

/** Setiap item pakai ikon yang BERBEDA — ikon ganda membuat mata tidak bisa
 *  memakainya sebagai penanda, jadi tinggal membaca teks. */
const NAV_GROUPS: NavGroup[] = [
  {
    key: "analitik",
    label: "Analitik",
    items: [
      { href: "/admin/dashboard",            label: "Dashboard",            icon: LayoutDashboard },
      { href: "/admin/advanced-dashboard",   label: "Advanced Analytics",   icon: TrendingUp },
      { href: "/admin/cara-kerja-ml",        label: "SMART Learning",       icon: BrainCircuit },
      { href: "/admin/efektifitas-inspeksi", label: "Efektivitas Inspeksi", icon: ShieldCheck },
      { href: "/admin/dashboard-penyulang",  label: "Dashboard Penyulang",  icon: BarChart3 },
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
      { href: "/admin/detail-gangguan",       label: "Detail Gangguan APKT", icon: TriangleAlert },
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

/** Item aktif = blok navy penuh. Item lain tetap tinta penuh + bobot 500 —
 *  bobot 400 di 14px membuat teks terlihat buram di layar biasa. */
const ITEM_BASE =
  "group flex items-center gap-2.5 rounded-xl text-sm font-medium transition-colors";
const ITEM_ON = "bg-navy-600 text-white font-semibold shadow-sm";
const ITEM_OFF = "text-ink hover:bg-navy-50 hover:text-navy-600";

/** Stroke 2px (bawaan lucide) terlalu berat di samping teks 14px/500 —
 *  1,75 menyeimbangkan bobot ikon dengan bobot huruf. */
const ICON_STROKE = 1.75;

/** Ikon selangkah lebih ringan dari labelnya supaya teks yang memimpin,
 *  bukan rel ikon yang jadi pita gelap. Saat aktif ikut putih. */
const iconCls = (active: boolean) =>
  `shrink-0 ${active ? "" : "text-ink-soft group-hover:text-navy-600"}`;

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminSidebar({
  userEmail,
  userName,
  userRole,
  userUnit,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);

  // Grup yang terbuka — default semua terbuka kecuali Tools
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    analitik: true,
    monitoring: true,
    operasional: true,
    manajemen: true,
    tools: false,
  });

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const initials = userName
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <aside
      className={`shrink-0 bg-white h-screen sticky top-0 flex flex-col transition-all duration-300 border-r border-line ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="px-3 py-3.5 flex items-center justify-between gap-2 border-b border-line">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-9 h-9 bg-navy-600 rounded-xl grid place-items-center shrink-0">
            <Zap size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div className="whitespace-nowrap min-w-0">
              <p className="font-display font-extrabold text-[13px] leading-tight text-ink tracking-tight">
                SMART Mataram
              </p>
              <p className="text-[11px] text-ink-muted truncate">
                {userUnit ? `PLN ULP ${userUnit}` : "PLN UP3 Mataram"}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Lebarkan sidebar" : "Ringkas sidebar"}
          className="w-6 h-6 grid place-items-center rounded-lg text-ink-muted hover:text-ink hover:bg-surface transition-colors shrink-0"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-3">
        {NAV_GROUPS.map((group, gi) => {
          const isOpen = openGroups[group.key] ?? true;
          const hasActive = group.items.some((it) => pathname === it.href);

          if (collapsed) {
            return (
              <div key={group.key} className="space-y-1">
                {group.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={label}
                      className={`${ITEM_BASE} justify-center h-10 ${active ? ITEM_ON : ITEM_OFF}`}
                    >
                      <Icon size={18} strokeWidth={ICON_STROKE} className={iconCls(active)} />
                    </Link>
                  );
                })}
                <div className="mx-2 border-t border-line" />
              </div>
            );
          }

          return (
            <div key={group.key} className={gi > 0 ? "pt-3 border-t border-line" : ""}>
              {/* Label bagian — kecil tapi tegas: kontras dinaikkan, bukan sekadar bold */}
              <button
                onClick={() => toggleGroup(group.key)}
                className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.09em] transition-colors ${
                  hasActive ? "text-navy-600" : "text-ink hover:text-navy-600"
                }`}
              >
                <span>{group.label}</span>
                <ChevronDown
                  size={13}
                  className={`shrink-0 text-ink-soft transition-transform duration-200 ${
                    isOpen ? "rotate-0" : "-rotate-90"
                  }`}
                />
              </button>

              {isOpen && (
                <div className="mt-1 space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const active = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`${ITEM_BASE} px-2.5 py-2 ${active ? ITEM_ON : ITEM_OFF}`}
                      >
                        <Icon size={16} strokeWidth={ICON_STROKE} className={iconCls(active)} />
                        <span className="truncate">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User + aksi */}
      <div className="border-t border-line p-2 space-y-0.5">
        {!collapsed ? (
          <div className="flex items-center gap-2.5 px-1.5 pb-2 pt-1">
            <div className="w-9 h-9 rounded-full bg-navy-50 grid place-items-center shrink-0 text-[11px] font-bold text-navy-600">
              {initials || <Users size={14} />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink truncate">{userName}</p>
              <p className="text-[11px] text-ink-soft truncate">{userEmail}</p>
            </div>
          </div>
        ) : (
          <div className="grid place-items-center pb-2 pt-1">
            <div
              title={`${userName} · ${userRole}`}
              className="w-9 h-9 rounded-full bg-navy-50 grid place-items-center text-[11px] font-bold text-navy-600"
            >
              {initials || <Users size={14} />}
            </div>
          </div>
        )}

        {!collapsed && (
          <div className="flex items-center gap-1.5 px-1.5 pb-1.5">
            <span className="rounded-md bg-navy-50 px-1.5 py-0.5 text-[10px] font-bold text-navy-600">
              {userRole}
            </span>
            {userUnit && <span className="text-[10px] text-ink-muted">{userUnit}</span>}
          </div>
        )}

        <button
          onClick={() => setChangePwOpen(true)}
          title={collapsed ? "Ganti Password" : undefined}
          className={`w-full ${ITEM_BASE} ${ITEM_OFF} px-2.5 py-2 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <Lock size={15} className="shrink-0" />
          {!collapsed && <span>Ganti Password</span>}
        </button>

        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Keluar" : undefined}
            className={`w-full ${ITEM_BASE} px-2.5 py-2 text-ink-soft hover:bg-red-50 hover:text-red-600 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut size={15} className="shrink-0" />
            {!collapsed && <span>Keluar</span>}
          </button>
        </form>
      </div>

      {changePwOpen && <ChangePasswordModal onClose={() => setChangePwOpen(false)} />}
    </aside>
  );
}
