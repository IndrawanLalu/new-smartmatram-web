"use client";

import { useState } from "react";
import { BadgeCheck, LayoutDashboard } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import PersetujuanHargardu from "./_components/PersetujuanHargardu";
import DashboardHargardu from "./_components/DashboardHargardu";

const TABS = [
  { key: "persetujuan", label: "Persetujuan", icon: BadgeCheck },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function HargarduPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("persetujuan");

  return (
    <div className="text-ink flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 shrink-0">
        {TABS.map(({ key, label, icon: Icon }) => {
          const aktif = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold transition-colors ${
                aktif
                  ? "bg-navy-600 text-white shadow-sm"
                  : "bg-white text-ink-soft border border-line hover:border-navy-300"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "persetujuan" && <PersetujuanHargardu user={user} />}
      {tab === "dashboard" && <DashboardHargardu user={user} />}
    </div>
  );
}
