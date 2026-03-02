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
  { href: "/admin/peta-gardu", label: "Peta Gardu", icon: Map },
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
      className={`shrink-0 bg-[#004D40] h-screen sticky top-0 flex flex-col transition-all duration-300 ${
        collapsed ? "w-14" : "w-60"
      }`}
    >
      {/* Logo */}
      <div className="p-3 border-b border-white/10 flex items-center justify-between min-h-15">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-9 h-9 bg-[#00897B] rounded-lg flex items-center justify-center shrink-0">
            <Zap size={18} className="text-white" />
          </div>
          {!collapsed && (
            <div className="whitespace-nowrap">
              <p className="text-white font-bold text-sm leading-tight">
                SMART Mataram
              </p>
              <p className="text-teal-300 text-xs">PLN ULP Ampenan</p>
            </div>
          )}
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-6 h-6 flex items-center justify-center text-teal-300 hover:text-white transition-colors shrink-0"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-[#00897B] text-white font-medium"
                  : "text-teal-100 hover:bg-white/10"
              } ${collapsed ? "justify-center" : ""}`}
            >
              <Icon size={16} className="shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="p-2 border-t border-white/10">
        {!collapsed && (
          <div className="px-3 pb-2 space-y-0.5">
            <p className="text-white text-xs font-medium truncate">{userName}</p>
            <p className="text-teal-400 text-xs truncate">{userEmail}</p>
            <div className="flex items-center gap-1.5 pt-1">
              <span className="bg-[#00897B] text-white text-xs font-semibold px-1.5 py-0.5 rounded">
                {userRole}
              </span>
              {userUnit && (
                <span className="text-teal-300 text-xs">{userUnit}</span>
              )}
            </div>
          </div>
        )}
        <form action={logout}>
          <button
            type="submit"
            title={collapsed ? "Logout" : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-teal-100 hover:bg-white/10 transition-colors ${
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
