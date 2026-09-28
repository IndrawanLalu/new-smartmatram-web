"use client";

import dynamic from "next/dynamic";

/**
 * Titik ukur tegangan ujung terhadap titik gardu (dan tiang ujung JTR terjauh
 * bila datanya sudah ada) — sepola persetujuan titik lokasi gardu. Admin
 * memeriksa di peta apakah regu benar mengukur di ujung jaringan, bukan di
 * bawah gardunya.
 */

const Peta = dynamic(() => import("./_PetaUjungLeaflet"), {
  ssr: false,
  loading: () => <div className="h-[260px] rounded-xl border border-line bg-surface animate-pulse" />,
});

export interface TitikPetaUjung {
  ukurLat: number;
  ukurLng: number;
  akurasiM: number | null;
  garduLat: number | null;
  garduLng: number | null;
  tiangLat: number | null;
  tiangLng: number | null;
}

export default function PetaUjung({ titik }: { titik: TitikPetaUjung }) {
  return <Peta titik={titik} />;
}
