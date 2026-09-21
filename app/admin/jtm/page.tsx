"use client";

import { useState } from "react";
import {
  CheckCheck,
  ClipboardCheck,
  Map,
  Network,
  SlidersHorizontal,
  TowerControl,
  Upload,
} from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import DaftarSegmen from "./_components/DaftarSegmen";
import PetaJtm from "./_components/PetaJtm";
import ImporTiang from "./_components/ImporTiang";
import PengaturanJtm from "./_components/PengaturanJtm";
import TiangNormal from "./_components/TiangNormal";
import DaftarPenyapuan from "./_components/DaftarPenyapuan";
import DaftarTiang from "./_components/DaftarTiang";

const TABS = [
  { key: "segmen", label: "Segmen", icon: Network },
  { key: "peta", label: "Peta", icon: Map },
  { key: "tiang", label: "Tiang", icon: TowerControl },
  { key: "penyapuan", label: "Inspeksi", icon: ClipboardCheck },
  { key: "impor", label: "Impor Tiang", icon: Upload },
  { key: "pengaturan", label: "Pengaturan", icon: SlidersHorizontal },
  { key: "normal", label: "Tiang Normal", icon: CheckCheck },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function JtmPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("segmen");

  return (
    // Tab peta memakai tinggi penuh lewat flex, bukan calc(): angka calc harus
    // ditebak dari tinggi topbar dan bilah saring, dan tebakan itu meleset di
    // tiap ukuran layar.
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

      {tab === "segmen" && <DaftarSegmen user={user} />}
      {tab === "peta" && (
        <div className="flex-1 min-h-0">
          <PetaJtm user={user} />
        </div>
      )}
      {tab === "tiang" && <DaftarTiang user={user} />}
      {tab === "penyapuan" && <DaftarPenyapuan user={user} />}
      {tab === "impor" && <ImporTiang user={user} />}
      {tab === "pengaturan" && <PengaturanJtm />}
      {tab === "normal" && <TiangNormal />}
    </div>
  );
}
