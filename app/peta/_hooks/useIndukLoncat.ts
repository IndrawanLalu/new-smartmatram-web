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
 * memang disengaja. Begitu pula ARAH BERLAWANAN (22 Okt 2026, MVTIC SHERATON
 * di batang GUNUNG SARI): induk batangnya justru menyambung DARI tiang ini di
 * penyulang itu — dia hilir, bukan tiang yang dilompati.
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
  // menjawab apakah induk batang anggota penyulang yang sama, dan dari mana
  // induk batang itu menyambung di penyulang itu.
  const ids = [...new Set(calon.flatMap((r) => [r.induk_id!, indukBatang.get(r.tiang_id)!]))];
  const { data: anggota } = await supabaseBrowser
    .from("tiang_kode_penyulang")
    .select("tiang_id,penyulang,kode,induk_id")
    .in("tiang_id", ids);
  const baris = (anggota ?? []) as BarisKp[];
  const kodeDi = new Map(baris.map((a) => [kunci(a.tiang_id, a.penyulang), a.kode]));
  const indukDi = new Map(baris.map((a) => [kunci(a.tiang_id, a.penyulang), a.induk_id]));

  const tersisa = calon.filter((r) => {
    const kb = kunci(indukBatang.get(r.tiang_id)!, r.penyulang);
    return kodeDi.has(kb) && indukDi.get(kb) !== r.tiang_id;
  });
  const dilewati = await batangDiHulu(tersisa, indukBatang);

  const hasil = new Map<string, IndukLoncat>();
  for (const r of tersisa) {
    if (dilewati.has(kunci(r.tiang_id, r.penyulang))) continue;
    const dilompati = kodeDi.get(kunci(indukBatang.get(r.tiang_id)!, r.penyulang))!;
    hasil.set(kunci(r.tiang_id, r.penyulang), {
      kode: r.kode,
      induk: kodeDi.get(kunci(r.induk_id!, r.penyulang)) ?? "?",
      batang: dilompati,
    });
  }
  return hasil;
}

/** Batas langkah naik — tiang sisipan penumpang biasanya satu-dua batang. */
const NAIK_MAKS = 6;

/**
 * Tiang yang induk batangnya ternyata ada DI HULU induk penyulangnya — jalur
 * penyulang itu melewati tiang tambahan (mis. MSR-136 yang hanya dipakai MVTIC
 * & MENINTING di antara 135 dan 137, sementara GUNUNG SARI langsung 142 → 143).
 * Tidak ada yang dilompati, jadi tidak ditandai (22 Okt 2026).
 * Naik dari induk penyulang: induk yang diatur di penyulang itu, kalau tidak
 * ada induk batangnya.
 */
async function batangDiHulu(calon: BarisKp[], indukBatang: Map<string, string | null>): Promise<Set<string>> {
  const ketemu = new Set<string>();
  let jalan = calon.map((r) => ({ k: kunci(r.tiang_id, r.penyulang), p: r.penyulang, cari: indukBatang.get(r.tiang_id)!, di: r.induk_id! }));
  for (let i = 0; i < NAIK_MAKS && jalan.length; i++) {
    const ids = [...new Set(jalan.map((j) => j.di))];
    const [{ data: kp }, { data: tb }] = await Promise.all([
      supabaseBrowser.from("tiang_kode_penyulang").select("tiang_id,penyulang,induk_id").in("tiang_id", ids).not("induk_id", "is", null),
      supabaseBrowser.from("tiang").select("id,induk_id").in("id", ids),
    ]);
    const atur = new Map(((kp ?? []) as BarisKp[]).map((a) => [kunci(a.tiang_id, a.penyulang), a.induk_id]));
    const batang = new Map(((tb ?? []) as { id: string; induk_id: string | null }[]).map((t) => [t.id, t.induk_id]));
    const lanjut: typeof jalan = [];
    for (const j of jalan) {
      const naik = atur.get(kunci(j.di, j.p)) ?? batang.get(j.di) ?? null;
      if (!naik) continue;
      if (naik === j.cari) ketemu.add(j.k);
      else lanjut.push({ ...j, di: naik });
    }
    jalan = lanjut;
  }
  return ketemu;
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
