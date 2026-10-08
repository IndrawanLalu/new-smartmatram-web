"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { EYEBROW, FIELD } from "@/app/admin/_ui";

/**
 * Peran yang tugasnya diterima HP per NAMA TIM (`team_name`), bukan per peran.
 * Sama dengan `TEAM_ROLES` di HP (useNotificationBadge) dan penjaga
 * `tugaskan_temuan_jtm` — tiga tempat, satu daftar.
 */
export const PERAN_PER_REGU = ["PERABASAN", "K3"];

interface Props {
  /** Peran terpilih; regu dibaca dari Manajemen Petugas grup peran ini. */
  peran: string;
  /** ULP temuan; null = temuan terpilih dari beberapa ULP. */
  ulp: string | null;
  nilai: string;
  onPilih: (regu: string) => void;
}

/** Daftar regu aktif satu peran di satu ULP (mis. RABAS 1, RABAS 2 …). */
export default function PilihRegu({ peran, ulp, nilai, onPilih }: Props) {
  const [regu, setRegu] = useState<string[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const kunci = `${peran}|${ulp}`;
  const [kunciTerbaca, setKunciTerbaca] = useState<string | null>(null);

  useEffect(() => {
    if (!ulp) return;
    let hidup = true;
    supabaseBrowser
      .from("petugas")
      .select("nama,status")
      .ilike("group_name", peran)
      .ilike("ulp", ulp)
      .order("nama")
      .then(({ data, error }) => {
        if (!hidup) return;
        setGalat(error?.message ?? null);
        setRegu((data ?? []).filter((p) => (p.status ?? "aktif").toLowerCase() === "aktif").map((p) => p.nama as string));
        setKunciTerbaca(kunci);
      });
    return () => { hidup = false; };
  }, [peran, ulp, kunci]);

  if (!ulp) {
    return (
      <p className="text-xs text-amber-700 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
        Temuan terpilih berasal dari beberapa ULP. Regu {peran} berbeda per ULP — pilih temuan dari satu ULP saja.
      </p>
    );
  }
  const memuat = kunciTerbaca !== kunci;

  return (
    <div>
      <label className={EYEBROW}>Regu {peran} · {ulp}</label>
      <select
        value={nilai}
        onChange={(e) => onPilih(e.target.value)}
        className={`${FIELD} mt-1 block w-full`}
        disabled={memuat}
      >
        <option value="">{memuat ? "Memuat regu…" : "Pilih regu…"}</option>
        {(regu ?? []).map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      {galat && <p className="mt-1 text-xs text-red-600">Daftar regu gagal dibaca: {galat}</p>}
      {!memuat && !galat && regu?.length === 0 && (
        <p className="mt-1 text-xs text-amber-700">Belum ada regu {peran} aktif di ULP {ulp} (Manajemen Petugas).</p>
      )}
    </div>
  );
}
