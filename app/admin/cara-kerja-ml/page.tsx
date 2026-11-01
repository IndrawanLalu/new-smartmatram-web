"use client";

import { useState } from "react";
import { BrainCircuit, MapPinned } from "lucide-react";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil from "@/app/admin/_kit/TabPil";
import TabCaraKerja from "./_components/TabCaraKerja";
import TabPrediksiLokasi from "./_components/lokasi/TabPrediksiLokasi";

const TABS = [
  { kunci: "cara-kerja", label: "Cara Kerja Mesin", ikon: BrainCircuit },
  { kunci: "lokasi", label: "Prediksi Lokasi Gangguan", ikon: MapPinned },
] as const;

type Tab = (typeof TABS)[number]["kunci"];

export default function SmartLearningPage() {
  const [tab, setTab] = useState<Tab>("cara-kerja");
  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={[...TABS]} aktif={tab} onPilih={setTab} />
      </IsiKepala>
      {tab === "lokasi" ? <TabPrediksiLokasi /> : <TabCaraKerja />}
    </div>
  );
}
