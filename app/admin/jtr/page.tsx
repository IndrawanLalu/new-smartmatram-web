"use client";

import { useMemo, useState } from "react";
import {
  Network,
  ShieldCheck,
  Map,
  ClipboardList,
  BadgeCheck,
  CheckCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { canManageSettings } from "@/lib/roles";
import RekapJtr from "./_components/RekapJtr";
import PetaJaringan from "./_components/PetaJaringan";
import HasilInspeksi from "./_components/HasilInspeksi";
import ApprovalGardu from "./_components/ApprovalGardu";
import UsulanKoreksi from "./_components/UsulanKoreksi";
import TiangBaik from "./_components/TiangBaik";
import PengaturanJtr from "./_components/PengaturanJtr";

const TABS = [
  { key: "jaringan", label: "Jaringan JTR", icon: Network, setelan: false },
  { key: "peta", label: "Peta", icon: Map, setelan: false },
  { key: "hasil", label: "Hasil Inspeksi", icon: ClipboardList, setelan: false },
  { key: "persetujuan", label: "Persetujuan Gardu", icon: BadgeCheck, setelan: false },
  { key: "usulan", label: "Usulan Koreksi", icon: ShieldCheck, setelan: false },
  // Dua tab terakhir berlaku untuk SEMUA ULP sekaligus — satu perubahan di sini
  // mengubah formulir tiap regu di lapangan. Karena itu dibatasi ke peran yang
  // memang berwenang atas setelan, bukan dibuka ke semua yang bisa membuka JTR.
  { key: "baik", label: "Tiang Baik", icon: CheckCheck, setelan: true },
  { key: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal, setelan: true },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function JtrPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("jaringan");

  const bolehSetel = canManageSettings(user.role);
  const tabTampil = useMemo(() => TABS.filter((t) => !t.setelan || bolehSetel), [bolehSetel]);

  return (
    // Tab peta memakai tinggi penuh lewat flex, bukan calc(): angka calc harus
    // ditebak dari tinggi topbar, padding, dan bilah saring — dan tebakan itu
    // meleset di tiap ukuran layar. Flex membiarkan browser yang menghitung.
    <div className={`text-ink flex flex-col gap-4 ${tab === "peta" ? "h-full" : ""}`}>
      <div className="flex flex-wrap gap-2 shrink-0">
        {tabTampil.map(({ key, label, icon: Icon }) => {
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
      {tab === "baik" && bolehSetel && <TiangBaik />}
      {tab === "pengaturan" && bolehSetel && <PengaturanJtr />}
    </div>
  );
}
