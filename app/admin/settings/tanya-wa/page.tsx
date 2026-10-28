"use client";

import { useState } from "react";
import { BookA, FlaskConical, History, ListTree } from "lucide-react";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import IsiKepala from "@/app/admin/_kit/IsiKepala";
import TabPil, { type ItemTab } from "@/app/admin/_kit/TabPil";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";
import { useTanyaWa } from "./_hooks/useTanyaWa";
import { useJumlahBelumDiajarkan } from "./_hooks/useRiwayatWa";
import TabFungsi from "./_components/TabFungsi";
import TabKamus from "./_components/TabKamus";
import TabUjiCoba from "./_components/TabUjiCoba";
import TabRiwayat from "./_components/TabRiwayat";

/**
 * Tanya Jawab WA (@smart) — rencana-tanya-jawab-wa.md §6, tahap T2 + T3 (Riwayat).
 * Bot menjawab kalimat biasa tanpa AI: fungsi jawabannya di kode, kata kunci,
 * contoh, dan kamus diatur di sini (UP3). Perubahan berlaku di WA ±1 menit.
 */

type TabKey = "fungsi" | "kamus" | "riwayat" | "uji";

export default function TanyaWaPage() {
  const user = useCurrentUser();
  const bisaUbah = user?.role === "UP3";
  const bisaUji = bisaUbah || user?.role === "admin";
  const data = useTanyaWa(user?.name ?? user?.email ?? "web");
  const [tab, setTab] = useState<TabKey>("fungsi");
  const belumDiajarkan = useJumlahBelumDiajarkan();

  const daftarTab: ItemTab<TabKey>[] = [
    { kunci: "fungsi", label: "Fungsi", ikon: ListTree },
    { kunci: "kamus", label: "Kamus", ikon: BookA, angka: data.kamus.length },
    { kunci: "riwayat", label: "Riwayat", ikon: History, angka: belumDiajarkan, angkaTunggu: true },
    ...(bisaUji ? [{ kunci: "uji" as const, label: "Uji coba", ikon: FlaskConical }] : []),
  ];

  return (
    <div className="text-ink flex flex-col gap-4">
      <IsiKepala>
        <TabPil tab={daftarTab} aktif={tab} onPilih={setTab} />
      </IsiKepala>

      {!bisaUbah && (
        <CatatanInfo>Anda hanya bisa melihat. Kata kunci, contoh, dan kamus hanya bisa diubah akun UP3.</CatatanInfo>
      )}

      {data.memuat ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-line border-t-brand-600 rounded-full animate-spin" />
        </div>
      ) : data.galatMuat ? (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
          Gagal memuat: {data.galatMuat}. Pastikan <code>scripts/wa-tanya.sql</code> sudah dijalankan.
        </div>
      ) : tab === "fungsi" ? (
        <TabFungsi data={data} bisaUbah={bisaUbah} />
      ) : tab === "kamus" ? (
        <TabKamus data={data} bisaUbah={bisaUbah} />
      ) : tab === "riwayat" ? (
        <TabRiwayat data={data} bisaUbah={bisaUbah} />
      ) : (
        <TabUjiCoba fungsi={data.fungsi} />
      )}
    </div>
  );
}
