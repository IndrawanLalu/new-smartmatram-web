"use client";

import { useState } from "react";
import { FileText, PlusCircle } from "lucide-react";
import type { CurrentUser } from "@/lib/roles";
import TabGaris from "@/app/admin/_kit/TabGaris";
import SusunWoBulanan from "@/app/admin/_components/SusunWoBulanan";
import WoPengukuranTab from "./WoPengukuranTab";

/**
 * Tab WO Pengukuran (W4, 27 Okt 2026): Daftar WO (WoPengukuranTab — kartu ULP,
 * Rencana Excel, terbit otomatis/manual) · Susun WO (pilih gardu sendiri,
 * masuk ke WO bulan itu). Sesudah Susun WO, Daftar WO terbuka di bulan itu.
 */

export default function WoPengukuranMenu({ user, ulp }: { user: CurrentUser; ulp: string }) {
  const [tampilan, setTampilan] = useState<"daftar" | "susun">("daftar");
  const [bulanAwal, setBulanAwal] = useState<string | undefined>(undefined);

  return (
    <div className="flex flex-col gap-4">
      <TabGaris
        tab={[
          { kunci: "daftar", label: "Daftar WO", ikon: <FileText size={14} /> },
          { kunci: "susun", label: "Susun WO", ikon: <PlusCircle size={14} /> },
        ]}
        aktif={tampilan}
        onPilih={setTampilan}
      />
      {tampilan === "susun" ? (
        <SusunWoBulanan
          user={user}
          jenis="pengukuran"
          onSelesai={(b) => { setBulanAwal(b); setTampilan("daftar"); }}
        />
      ) : (
        <WoPengukuranTab key={bulanAwal ?? "-"} user={user} ulp={ulp} bulanAwal={bulanAwal} />
      )}
    </div>
  );
}
