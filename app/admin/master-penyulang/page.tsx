"use client";

import { useState } from "react";
import { ListChecks, Table2 } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CHIP, CHIP_OFF, CHIP_ON } from "@/app/admin/_ui";
import DaftarPenyulang from "./_components/DaftarPenyulang";
import RekapData from "./_components/RekapData";

/**
 * Master Penyulang — induk yang dituju gardu, tiang, dan segmen.
 *
 * Dulu sebuah tab di dalam halaman Jaringan JTM. Tempatnya keliru dengan alasan
 * yang sama seperti Master Gardu: penyulang dipakai gardu, tiang JTM, segmen,
 * dan nanti WO perabasan. Selama dia jadi anak topik salah satu modul, modul
 * berikutnya akan membuat daftar penyulangnya sendiri — dan daftar penyulang
 * yang berbeda-beda isi persis penyakit yang sedang dibereskan.
 *
 * Tab Rekap Data (10 Okt 2026): panjang, konduktor, tiang, peralatan, dan
 * gardu per penyulang → per segmen, dari hasil inspeksi JTM.
 */

const TABS = [
  { key: "daftar", label: "Daftar Penyulang", icon: ListChecks },
  { key: "rekap", label: "Rekap Data", icon: Table2 },
] as const;

export default function MasterPenyulangPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("daftar");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`${CHIP} ${tab === key ? CHIP_ON : CHIP_OFF}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {tab === "daftar" ? <DaftarPenyulang user={user} /> : <RekapData user={user} />}
    </div>
  );
}
