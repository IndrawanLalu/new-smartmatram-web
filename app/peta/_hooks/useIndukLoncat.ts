"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Tiang JTM yang induknya di satu penyulang MELOMPATI tiang sebelumnya
 * (10 Okt 2026). Contoh AMPENAN: AMP-002R005 disambung dari 002R003, padahal
 * batangnya berdiri sesudah 002R004 — dan 002R004 juga AMPENAN. Akibatnya
 * 002R004 jadi buntu dan jalur 001 → 002R006 tidak melewatinya.
 *
 * Aturannya sengaja sempit: induk batang tiang itu sendiri anggota penyulang
 * yang sama, tapi induk penyulangnya tiang lain. Sambungan tumpang di titik
 * pertemuan (batang sebelumnya milik penyulang lain) TIDAK ditandai — itu
 * memang disengaja.
 *
 * Datanya kecil (hanya tiang yang induk penyulangnya diatur), jadi dibaca
 * sekali untuk semua ULP, bukan per layar.
 */

export interface IndukLoncat {
  /** Kode tiang di penyulang itu, induk yang dipakai sekarang, dan tiang yang dilompati. */
  kode: string;
  induk: string;
  batang: string;
}

interface BarisKp { tiang_id: string; penyulang: string; kode: string; induk_id: string | null }

const kunci = (tiangId: string, penyulang: string) => `${tiangId}|${penyulang.toUpperCase()}`;

async function baca(): Promise<Map<string, IndukLoncat>> {
  const { data: atur } = await supabaseBrowser
    .from("tiang_kode_penyulang")
    .select("tiang_id,penyulang,kode,induk_id")
    .not("induk_id", "is", null);
  const kp = (atur ?? []) as BarisKp[];
  if (!kp.length) return new Map();

  const { data: batang } = await supabaseBrowser
    .from("tiang")
    .select("id,induk_id")
    .in("id", [...new Set(kp.map((r) => r.tiang_id))])
    .eq("status_hidup", "aktif");
  const indukBatang = new Map(((batang ?? []) as { id: string; induk_id: string | null }[]).map((t) => [t.id, t.induk_id]));

  const calon = kp.filter((r) => {
    const b = indukBatang.get(r.tiang_id);
    return b && b !== r.induk_id;
  });
  if (!calon.length) return new Map();

  // Kode di penyulang itu untuk induk yang dipakai & induk batang — sekaligus
  // menjawab apakah induk batang anggota penyulang yang sama.
  const ids = [...new Set(calon.flatMap((r) => [r.induk_id!, indukBatang.get(r.tiang_id)!]))];
  const { data: anggota } = await supabaseBrowser
    .from("tiang_kode_penyulang")
    .select("tiang_id,penyulang,kode")
    .in("tiang_id", ids);
  const kodeDi = new Map(((anggota ?? []) as BarisKp[]).map((a) => [kunci(a.tiang_id, a.penyulang), a.kode]));

  const hasil = new Map<string, IndukLoncat>();
  for (const r of calon) {
    const dilompati = kodeDi.get(kunci(indukBatang.get(r.tiang_id)!, r.penyulang));
    if (!dilompati) continue;
    hasil.set(kunci(r.tiang_id, r.penyulang), {
      kode: r.kode,
      induk: kodeDi.get(kunci(r.induk_id!, r.penyulang)) ?? "?",
      batang: dilompati,
    });
  }
  return hasil;
}

export function useIndukLoncat() {
  const [loncat, setLoncat] = useState<Map<string, IndukLoncat>>(new Map());
  const [ke, setKe] = useState(0);

  useEffect(() => {
    let hidup = true;
    void baca().then((m) => hidup && setLoncat(m));
    return () => { hidup = false; };
  }, [ke]);

  const muatUlang = useCallback(() => setKe((n) => n + 1), []);
  return { loncat, muatUlang };
}

export const kunciLoncat = kunci;
