"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

/**
 * Titik LAMA dan titik BARU berdampingan di satu peta.
 *
 * Bapak 22 Sep: "ditunjukkan titik sebelum dan sesudahnya saat verifikasi di
 * web." Dan memang itu satu-satunya cara memutuskannya — angka lintang-bujur
 * tidak memberi tahu apa pun tentang apakah perpindahan 340 m masuk akal.
 * Peta memberi tahu: kalau titik lama berada di tengah sawah dan titik baru di
 * tepi jalan, jelas mana yang benar.
 *
 * Gardu yang MEMANG belum punya titik ditampilkan apa adanya sebagai satu
 * penanda saja, dengan keterangan bahwa tidak ada pembanding. Menaruh penanda
 * "sebelum" di koordinat 0,0 akan menggambar garis sepanjang seribu kilometer
 * ke tengah Samudra Atlantik.
 */

const Peta = dynamic(() => import("./_PetaSebelumSesudahLeaflet"), {
  ssr: false,
  loading: () => (
    <div className="h-[220px] rounded-xl border border-line bg-surface animate-pulse" />
  ),
});

export interface TitikUsulan {
  lamaLat: number | null;
  lamaLng: number | null;
  baruLat: number;
  baruLng: number;
  akurasiM: number | null;
  selisihM: number | null;
}

export default function PetaSebelumSesudah({ titik }: { titik: TitikUsulan }) {
  const adaPembanding = titik.lamaLat !== null && titik.lamaLng !== null;

  const keterangan = useMemo(() => {
    if (!adaPembanding) return "Gardu ini belum punya titik master — tidak ada pembanding.";
    if (titik.selisihM === null) return null;
    const km = titik.selisihM >= 1000;
    const jarak = km
      ? `${(titik.selisihM / 1000).toFixed(1)} km`
      : `${Math.round(titik.selisihM)} m`;
    // Ketelitian GPS disandingkan dengan selisihnya. Titik ber-akurasi 80 m
    // yang memindahkan master 60 m bukan koreksi — itu derau alat, dan admin
    // tidak bisa tahu itu tanpa kedua angkanya berdampingan.
    const ragu =
      titik.akurasiM !== null && titik.selisihM !== null && titik.akurasiM >= titik.selisihM;
    return ragu
      ? `Bergeser ${jarak}, tapi ketelitian GPS-nya ${Math.round(titik.akurasiM!)} m — selisihnya mungkin cuma derau alat.`
      : `Bergeser ${jarak}${titik.akurasiM !== null ? ` · ketelitian GPS ${Math.round(titik.akurasiM)} m` : ""}`;
  }, [titik, adaPembanding]);

  return (
    <div>
      <Peta titik={titik} />
      {keterangan && (
        <p
          className={`text-[11px] mt-1.5 ${
            !adaPembanding ? "text-ink-muted" : "text-amber-700"
          }`}
        >
          {keterangan}
        </p>
      )}
    </div>
  );
}
