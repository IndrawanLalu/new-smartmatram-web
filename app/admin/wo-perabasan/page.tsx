"use client";

import { useState } from "react";
import { BadgeCheck, ClipboardList, Send } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useWoPerabasan } from "./_hooks/useWoPerabasan";
import DaftarWo from "./_components/DaftarWo";
import TerbitkanWo from "./_components/TerbitkanWo";
import Persetujuan from "./_components/Persetujuan";

/**
 * WO Perabasan — satuan SEGMEN, ukuran KILOMETER.
 *
 * Bedanya dengan WO Pengukuran yang satu per ULP per bulan: di sini WO boleh
 * terbit kapan saja dan boleh memuat segmen dari beberapa penyulang. Itu
 * disengaja — di sana satuannya gardu yang sebanding, di sini kilometer yang
 * tidak: ruas 7 km dan ruas 0,3 km bukan pekerjaan yang sama.
 */

const TABS = [
  { key: "daftar", label: "WO Berjalan", icon: ClipboardList },
  { key: "terbit", label: "Terbitkan WO", icon: Send },
  { key: "setuju", label: "Persetujuan", icon: BadgeCheck },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function WoPerabasanPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const {
    wo, item, segmen, realisasi, loading,
    terbitkan, putuskan, batalkanItem, segmenTerikat, menunggu,
  } = useWoPerabasan();

  const oleh = user.name ?? user.email;

  return (
    <div className="text-ink flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm font-semibold transition-colors ${
              tab === key
                ? "bg-navy-600 text-white shadow-sm"
                : "bg-white text-ink-soft border border-line hover:border-navy-300"
            }`}
          >
            <Icon size={16} />
            {label}
            {key === "setuju" && menunggu.length > 0 && (
              <span
                className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full ${
                  tab === key ? "bg-white/20" : "bg-sky-100 text-sky-700"
                }`}
              >
                {menunggu.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "daftar" && (
        <DaftarWo
          wo={wo}
          item={item}
          loading={loading}
          user={user}
          onBatalkanItem={(id, alasan) => batalkanItem(id, alasan, oleh)}
        />
      )}
      {tab === "terbit" && (
        <TerbitkanWo
          user={user}
          segmen={segmen}
          segmenTerikat={segmenTerikat}
          onTerbitkan={(v) => terbitkan({ ...v, oleh })}
        />
      )}
      {tab === "setuju" && (
        <Persetujuan
          menunggu={menunggu}
          realisasi={realisasi}
          onPutuskan={(id, terima, catatan) => putuskan(id, terima, catatan, oleh)}
        />
      )}
    </div>
  );
}
