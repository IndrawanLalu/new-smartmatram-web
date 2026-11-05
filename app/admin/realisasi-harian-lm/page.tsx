"use client";

import { useState } from "react";
import { Leaf, Settings2, Target } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil, { type ItemTab } from "@/app/admin/_kit/TabPil";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import type { Laporan } from "@/app/admin/kinerja-yantek/_lib/lm4dx";
import RealisasiLm from "./_components/RealisasiLm";
import PengaturanTindakan from "./_components/PengaturanTindakan";

/**
 * Realisasi Harian LM (5 Nov 2026, rencana-realisasi-harian-4dx-susut.md):
 * baris pekerjaan × tanggal 1–31 untuk LM 4DX dan Penurunan Susut, hanya
 * pekerjaan yang SUDAH DISETUJUI. Barisnya satu tabel dengan Copy to LM 4DX
 * (`lm4dx_baris.laporan`), diatur UP3 & admin.
 */

type Tab = Laporan | "atur";

const TABS: ItemTab<Tab>[] = [
  { kunci: "4dx", label: "LM 4DX", ikon: Target },
  { kunci: "susut", label: "Penurunan Susut", ikon: Leaf },
];
/** Pengaturan paling akhir (teknisaplikasi butir 7), hanya UP3 & admin. */
const TAB_ATUR: ItemTab<Tab> = { kunci: "atur", label: "Pengaturan", ikon: Settings2 };

export default function RealisasiHarianLmPage() {
  const user = useCurrentUser();
  const [tab, setTab] = useState<Tab>("4dx");
  const daftarUlp = canSeeAllUnits(user.role) ? ["SEMUA", ...UNITS.map((u) => u.value)] : [user.unit ?? ""];
  const pengatur = user.role === "UP3" || user.role === "admin" ? user.name ?? user.email : null;

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={pengatur ? [...TABS, TAB_ATUR] : TABS} aktif={tab} onPilih={setTab} />
      </IsiKepala>
      {tab === "atur" && pengatur ? (
        <PengaturanTindakan oleh={pengatur} />
      ) : tab !== "atur" ? (
        // key: ganti laporan = muat ulang bersih (baris berbeda).
        <RealisasiLm key={tab} laporan={tab} ulpAwal={daftarUlp[0]} daftarUlp={daftarUlp} pengatur={pengatur} />
      ) : null}
    </div>
  );
}
