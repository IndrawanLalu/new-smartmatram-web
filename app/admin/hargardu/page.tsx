"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, LayoutDashboard, SlidersHorizontal, Wrench } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import PersetujuanHargardu from "./_components/PersetujuanHargardu";
import DashboardHargardu from "./_components/DashboardHargardu";
import PerluPerbaikan from "./_components/PerluPerbaikan";
import PengaturanItem from "./_components/PengaturanItem";

const TABS = [
  { key: "persetujuan", label: "Persetujuan", icon: BadgeCheck, hanyaUp3: false },
  { key: "perbaikan", label: "Perlu Perbaikan", icon: Wrench, hanyaUp3: false },
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, hanyaUp3: false },
  // Daftar isian berlaku untuk SEMUA ULP, jadi penanya cuma satu. ULP mengisi,
  // tidak bisa mengarang — kalau tiap unit menyusun kosakatanya sendiri, angka
  // se-UP3 tidak bisa dijumlahkan lagi.
  { key: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal, hanyaUp3: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function HargarduPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("persetujuan");

  const up3 = user.role === "UP3";
  const tabs = useMemo(() => TABS.filter((t) => !t.hanyaUp3 || up3), [up3]);

  return (
    <div className="text-ink flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 shrink-0">
        {tabs.map(({ key, label, icon: Icon }) => {
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
      {tab === "perbaikan" && <PerluPerbaikan user={user} />}
      {tab === "dashboard" && <DashboardHargardu user={user} />}
      {tab === "pengaturan" && up3 && <PengaturanItem user={user} />}
    </div>
  );
}
