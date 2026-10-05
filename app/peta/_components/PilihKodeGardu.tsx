"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { jarakMeter } from "@/lib/geo";
import { INPUT } from "../_ui";

/**
 * Kode gardu untuk tiang berpenanda gardu: dicari dari Master Gardu ULP-nya,
 * yang TERDEKAT dari tiang paling atas. Kode yang belum ada di Master tetap
 * boleh diketik — pemutakhiran data sering dimulai dari lapangan.
 */

interface GarduMaster {
  kode: string;
  nama: string;
  jarak: number | null;
}

const TAMPIL = 8;

export default function PilihKodeGardu({
  ulp, lat, lng, nilai, onUbah,
}: {
  ulp: string | null;
  lat: number;
  lng: number;
  nilai: string;
  onUbah: (kode: string) => void;
}) {
  const [master, setMaster] = useState<GarduMaster[] | null>(null);
  const [buka, setBuka] = useState(false);

  useEffect(() => {
    if (!ulp) return;
    let batal = false;
    void fetchAllRows<{ kode: string; nama: string | null; lat: number | null; lng: number | null }>(() =>
      supabaseBrowser.from("gardu").select("kode,nama,lat,lng").eq("ulp", ulp),
    ).then((rows) => {
      if (batal) return;
      setMaster(
        rows
          .map((g) => ({
            kode: g.kode,
            nama: g.nama ?? "",
            jarak: g.lat === null || g.lng === null ? null : jarakMeter(lat, lng, Number(g.lat), Number(g.lng)),
          }))
          .sort((a, b) => (a.jarak ?? Infinity) - (b.jarak ?? Infinity)),
      );
    });
    return () => {
      batal = true;
    };
  }, [ulp, lat, lng]);

  const q = nilai.trim().toUpperCase();
  const cocok = useMemo(
    () => (master ?? []).filter((g) => !q || g.kode.includes(q) || g.nama.toUpperCase().includes(q)).slice(0, TAMPIL),
    [master, q],
  );
  const dikenal = !q || (master ?? []).some((g) => g.kode === q);

  return (
    <label className="block text-xs relative">
      <span className="text-gray-500">Kode gardu</span>
      <input
        value={nilai}
        onChange={(e) => onUbah(e.target.value)}
        onFocus={() => setBuka(true)}
        onBlur={() => setTimeout(() => setBuka(false), 150)}
        placeholder={master ? "Cari kode / nama gardu" : "Memuat Master Gardu…"}
        className={`${INPUT} mt-1 uppercase`}
      />
      {buka && cocok.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-[#1e3552] bg-[#0b1220] shadow-xl">
          {cocok.map((g) => (
            <li key={g.kode}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onUbah(g.kode);
                  setBuka(false);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-white/5 flex gap-2"
              >
                <span className="font-semibold text-[#e2e8f0] shrink-0">{g.kode}</span>
                <span className="text-gray-400 truncate flex-1">{g.nama}</span>
                {g.jarak !== null && <span className="text-gray-500 tabular-nums shrink-0">{Math.round(g.jarak)} m</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {master && !dikenal && (
        <span className="block mt-1 text-[11px] text-amber-300">Kode baru — belum ada di Master Gardu, tetap disimpan.</span>
      )}
    </label>
  );
}
