"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Map,
  BarChart3,
  Users,
  ClipboardCheck,
  Gauge,
  Activity,
  LogOut,
  Zap,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { logout } from "@/app/login/actions";

// ── Constants ────────────────────────────────────────────────────────────────

const NAV_ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/peta-gardu", label: "Peta Aset", icon: Map },
  {
    href: "/admin/dashboard-penyulang",
    label: "Dashboard Penyulang",
    icon: BarChart3,
  },
  { href: "/admin/petugas", label: "Manajemen Petugas", icon: Users },
  {
    href: "/admin/monitoring-inspeksi",
    label: "Monitoring Inspeksi",
    icon: ClipboardCheck,
  },
  { href: "/admin/pengukuran-gardu", label: "Pengukuran Gardu", icon: Gauge },
  { href: "/admin/command-center", label: "Command Center", icon: Activity },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface AdminSidebarProps {
  userEmail: string;
  userName: string;
  userRole: string;
  userUnit: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function AdminSidebar({
  userEmail,
  userName,
  userRole,
  userUnit,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
              <p className="text-white font-bold text-sm leading-tight">
                SMART Mataram
              </p>
              <p className="text-[#5eead4] text-xs opacity-70">PLN ULP Ampenan</p>
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
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-[#00897B]/20 text-[#5eead4] font-medium border border-[#00897B]/30"
                  : "text-gray-400 hover:text-gray-200 hover:bg-white/5"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={16} className={`shrink-0 ${isActive ? "text-[#00897B]" : ""}`} />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
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
              {userUnit && (
                <span className="text-gray-500 text-xs">{userUnit}</span>
              )}
            </div>
          </div>
        )}
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
    </aside>
  );
}
