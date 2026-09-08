"use client";

import { useState } from "react";
import { Network, ShieldCheck, Map, ClipboardList, BadgeCheck } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import RekapJtr from "./_components/RekapJtr";
import PetaJaringan from "./_components/PetaJaringan";
import HasilInspeksi from "./_components/HasilInspeksi";
import ApprovalGardu from "./_components/ApprovalGardu";
import UsulanKoreksi from "./_components/UsulanKoreksi";

const TABS = [
  { key: "jaringan", label: "Jaringan JTR", icon: Network },
  { key: "peta", label: "Peta", icon: Map },
  { key: "hasil", label: "Hasil Inspeksi", icon: ClipboardList },
  { key: "persetujuan", label: "Persetujuan Gardu", icon: BadgeCheck },
  { key: "usulan", label: "Usulan Koreksi", icon: ShieldCheck },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function JtrPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("jaringan");

  return (
    // Tab peta memakai tinggi penuh lewat flex, bukan calc(): angka calc harus
    // ditebak dari tinggi topbar, padding, dan bilah saring — dan tebakan itu
    // meleset di tiap ukuran layar. Flex membiarkan browser yang menghitung.
    <div className={`text-ink flex flex-col gap-4 ${tab === "peta" ? "h-full" : ""}`}>
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

      {tab === "jaringan" && <RekapJtr user={user} />}
      {tab === "peta" && (
        <div className="flex-1 min-h-0">
          <PetaJaringan user={user} />
        </div>
      )}
      {tab === "hasil" && <HasilInspeksi user={user} />}
      {tab === "persetujuan" && <ApprovalGardu user={user} />}
      {tab === "usulan" && <UsulanKoreksi user={user} />}
    </div>
  );
}
