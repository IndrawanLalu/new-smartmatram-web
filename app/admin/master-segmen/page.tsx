"use client";

import { useState } from "react";
import { Network, Upload } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useMasterSegmen } from "./_hooks/useMasterSegmen";
import DaftarSegmen from "./_components/DaftarSegmen";
import ImporSegmen from "./_components/ImporSegmen";

/**
 * Master Segmen — daftar acuan ruas jaringan.
 *
 * Melayani DUA modul sekaligus: WO inspeksi JTM dan WO perabasan. Karena itu
 * tempatnya di Master Data, bukan di dalam Jaringan JTM — menaruhnya di sana
 * menyembunyikannya dari regu rabas, yang justru paling sering memakainya.
 *
 * Tab Segmen di dalam Jaringan JTM tetap ada dan tidak bersaing dengan ini:
 * yang itu alat kerja JTM (merintis, menggabung), yang ini daftar acuannya.
 */

const TABS = [
  { key: "daftar", label: "Daftar Segmen", icon: Network },
  { key: "impor", label: "Impor Segmen", icon: Upload },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function MasterSegmenPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<TabKey>("daftar");
  const { baris, penyulang, daftarUlp, loading, pratinjauImpor, impor, ubahPanjang } =
    useMasterSegmen();

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
          </button>
        ))}
      </div>

      {tab === "daftar" && (
        <DaftarSegmen
          baris={baris}
          daftarUlp={daftarUlp}
          loading={loading}
          user={user}
          onUbahPanjang={(id, km) => ubahPanjang(id, km, oleh)}
        />
      )}
      {tab === "impor" && (
        <ImporSegmen
          user={user}
          penyulang={penyulang}
          onPratinjau={pratinjauImpor}
          onImpor={(p, isi) => impor(p, isi, oleh)}
        />
      )}
    </div>
  );
}
