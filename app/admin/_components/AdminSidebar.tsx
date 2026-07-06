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
  ClipboardCheck,
  Gauge,
  Activity,
  LogOut,
  Lock,
  Zap,
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
  Table2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/login/actions";

// ── Types ────────────────────────────────────────────────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  key: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

interface AdminSidebarProps {
  userEmail: string;
  userName: string;
  userRole: string;
  userUnit: string | null;
}

// ── Constants ────────────────────────────────────────────────────────────────

const NAV_GROUPS: NavGroup[] = [
  {
    key: "analitik",
    label: "Analitik",
    icon: BarChart3,
    items: [
      { href: "/admin/dashboard",            label: "Dashboard",            icon: LayoutDashboard },
      { href: "/admin/advanced-dashboard",   label: "Advanced Analytics",   icon: BrainCircuit },
      { href: "/admin/cara-kerja-ml",        label: "SMART Learning",       icon: BrainCircuit },
      { href: "/admin/efektifitas-inspeksi", label: "Efektivitas Inspeksi", icon: ShieldCheck },
      { href: "/admin/dashboard-penyulang",  label: "Dashboard Penyulang",  icon: BarChart3 },
    ],
  },
  {
    key: "monitoring",
    label: "Monitoring",
    icon: Activity,
    items: [
      { href: "/admin/monitoring-inspeksi", label: "Monitoring Inspeksi",  icon: ClipboardCheck },
      { href: "/admin/pengukuran-gardu",    label: "Pengukuran Gardu",     icon: Gauge },
      { href: "/admin/command-center",      label: "Command Center",       icon: Activity },
      { href: "/admin/peta-gardu",          label: "Peta Aset",            icon: Map },
    ],
  },
  {
    key: "operasional",
    label: "Operasional",
    icon: FileText,
    items: [
      { href: "/admin/morning-brief",         label: "Morning Brief",        icon: FileText },
      { href: "/admin/scoreboard",            label: "Score Board LM",       icon: Target },
      { href: "/admin/yantek",                label: "Analisis Yantek",      icon: Wrench },
      { href: "/admin/padam-apkt",            label: "Rekap Padam APKT",     icon: Zap },
      { href: "/admin/detail-gangguan",       label: "Detail Gangguan APKT", icon: Zap },
      { href: "/admin/rekap-produktivitas",   label: "Rekap Produktivitas",  icon: CalendarDays },
    ],
  },
  {
    key: "manajemen",
    label: "Manajemen",
    icon: Users,
    items: [
      { href: "/admin/petugas",          label: "Manajemen Petugas", icon: Users },
      { href: "/admin/user-management",  label: "Manajemen User",    icon: UserCog },
      { href: "/admin/settings/wa",      label: "Setting WA Group",  icon: MessageSquare },
    ],
  },
  {
    key: "tools",
    label: "Tools",
    icon: Table2,
    items: [
      { href: "/admin/json-to-table", label: "JSON ke Tabel", icon: Table2 },
    ],
  },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminSidebar({
  userEmail,
  userName,
  userRole,
  userUnit,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed]     = useState(false);
  const [changePwOpen, setChangePwOpen] = useState(false);

  // Grup yang terbuka — default semua terbuka kecuali Tools
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    analitik:    true,
    monitoring:  true,
    operasional: true,
    manajemen:   true,
    tools:       false,
  });

  function toggleGroup(key: string) {
    setOpenGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Apakah ada item aktif di grup ini (untuk highlight icon saat collapsed)
  function groupHasActive(group: NavGroup) {
    return group.items.some((item) => pathname === item.href);
  }

  return (
    <aside
      className={`shrink-0 bg-[#0a1628] h-screen sticky top-0 flex flex-col transition-all duration-300 border-r border-[#1e3552] ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="p-3 border-b border-[#1e3552] flex items-center justify-between min-h-15">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 bg-linear-to-br from-[#004D40] to-[#00897B] rounded-lg flex items-center justify-center shrink-0 shadow-lg">
            <Zap size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div className="whitespace-nowrap">
              <p className="text-white font-bold text-sm leading-tight">SMART Mataram</p>
              <p className="text-[#5eead4] text-xs opacity-70">
                {userUnit ? `PLN ULP ${userUnit}` : "PLN UP3 Mataram"}
              </p>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-6 h-6 flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-y-auto space-y-1">
        {NAV_GROUPS.map((group) => {
          const isOpen    = openGroups[group.key] ?? true;
          const hasActive = groupHasActive(group);
          const GroupIcon = group.icon;

          return (
            <div key={group.key}>
              {/* Group header */}
              <button
                onClick={() => !collapsed && toggleGroup(group.key)}
                title={collapsed ? group.label : undefined}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors text-xs font-semibold tracking-wide ${
                  collapsed ? "justify-center" : "justify-between"
                } ${
                  hasActive
                    ? "text-[#5eead4]"
                    : "text-[#475569] hover:text-[#94a3b8]"
                }`}
              >
                <div className="flex items-center gap-2">
                  <GroupIcon
                    size={14}
                    className={`shrink-0 ${hasActive ? "text-[#00897B]" : ""}`}
                  />
                  {!collapsed && <span>{group.label}</span>}
                </div>
                {!collapsed && (
                  <ChevronDown
                    size={12}
                    className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`}
                  />
                )}
              </button>

              {/* Items */}
              {!collapsed && isOpen && (
                <div className="mt-0.5 ml-2 pl-3 border-l border-[#1e3552] space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? "bg-[#00897B]/20 text-[#5eead4] font-medium border border-[#00897B]/30"
                            : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                        }`}
                      >
                        <Icon size={14} className={`shrink-0 ${isActive ? "text-[#00897B]" : ""}`} />
                        <span className="truncate">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Collapsed: tampilkan icon item langsung */}
              {collapsed && (
                <div className="mt-0.5 space-y-0.5">
                  {group.items.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        title={label}
                        className={`flex items-center justify-center px-2 py-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-[#00897B]/20 text-[#5eead4] border border-[#00897B]/30"
                            : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
                        }`}
                      >
                        <Icon size={15} className={`shrink-0 ${isActive ? "text-[#00897B]" : ""}`} />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="p-2 border-t border-[#1e3552]">
        {!collapsed && (
          <div className="px-3 pb-2 space-y-0.5">
            <p className="text-gray-200 text-xs font-medium truncate">{userName}</p>
            <p className="text-gray-500 text-xs truncate">{userEmail}</p>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="bg-[#00897B]/20 text-[#5eead4] text-xs font-semibold px-1.5 py-0.5 rounded border border-[#00897B]/30">
                {userRole}
              </span>
              {userUnit && <span className="text-gray-500 text-xs">{userUnit}</span>}
            </div>
          </div>
        )}
        <button
          onClick={() => setChangePwOpen(true)}
          title={collapsed ? "Ganti Password" : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-200 hover:bg-white/5 transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <Lock size={16} className="shrink-0" />
          {!collapsed && <span>Ganti Password</span>}
        </button>
        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Logout" : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <LogOut size={16} className="shrink-0" />
            {!collapsed && <span>Logout</span>}
          </button>
        </form>
      </div>

      {changePwOpen && <ChangePasswordModal onClose={() => setChangePwOpen(false)} />}
    </aside>
  );
}
