"use client";

import { useState, useEffect, useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export interface Petugas {
  id: string;
  nama: string;
  group_name: string;
  ulp: string;
  phone: string | null;
  email: string | null;
  status: string;
}

export interface SavePetugasInput {
  nama: string;
  group_name: string;
  ulp: string;
  phone: string;
  email: string;
  status: string;
}

/**
 * @param enabled `false` menahan pengambilan data tanpa menahan pemanggilan
 *   hook-nya. Dipakai halaman Petugas: penolakan akses harus digambar SETELAH
 *   semua hook dipanggil (urutan hook tidak boleh berubah antar render), tapi
 *   pengguna yang ditolak juga tidak perlu menembak kueri.
 */
export function usePetugas(filterUlp?: string, enabled = true) {
  const [data, setData] = useState<Petugas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!enabled) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    let q = supabaseBrowser
      .from("petugas")
      .select("id, nama, group_name, ulp, phone, email, status")
      .order("ulp")
      .order("group_name")
      .order("nama");

    if (filterUlp) q = q.eq("ulp", filterUlp);

    const { data: rows, error: err } = await q;
    if (err) setError(err.message);
    else setData(rows ?? []);
    setLoading(false);
  }, [filterUlp, enabled]);

  useEffect(() => { fetch(); }, [fetch]);

  const addPetugas = async (input: SavePetugasInput): Promise<string | null> => {
    const { error: err } = await supabaseBrowser.from("petugas").insert({
      id: crypto.randomUUID(),
      nama: input.nama.trim(),
      group_name: input.group_name,
      ulp: input.ulp,
      phone: input.phone.trim() || null,
      email: input.email.trim() || null,
      status: input.status,
    });
    if (err) return err.message;
    await fetch();
    return null;
  };

  const updatePetugas = async (id: string, input: SavePetugasInput): Promise<string | null> => {
    const { error: err } = await supabaseBrowser
      .from("petugas")
      .update({
        nama: input.nama.trim(),
        group_name: input.group_name,
        ulp: input.ulp,
        phone: input.phone.trim() || null,
        email: input.email.trim() || null,
        status: input.status,
      })
      .eq("id", id);
    if (err) return err.message;
    await fetch();
    return null;
  };

  const deletePetugas = async (id: string): Promise<string | null> => {
    const { error: err } = await supabaseBrowser.from("petugas").delete().eq("id", id);
    if (err) return err.message;
    await fetch();
    return null;
  };

  return { data, loading, error, refresh: fetch, addPetugas, updatePetugas, deletePetugas };
}
