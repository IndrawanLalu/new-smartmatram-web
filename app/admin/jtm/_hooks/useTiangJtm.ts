"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { useToast } from "@/app/admin/_components/Toast";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";

/**
 * Tiang JTM untuk peta.
 *
 * Keanggotaan segmen ditarik terpisah, bukan lewat embed PostgREST. Satu tiang
 * bisa dimiliki banyak segmen, dan embed bersarang pada tabel sebesar ini
 * memaksa PostgREST menyusun JSON per baris — jauh lebih lambat daripada dua
 * kueri datar yang digabung di sini.
 */

export interface TiangJtm {
  id: string;
  kode: string;
  penyulang: string;
  ulp: string;
  induk_id: string | null;
  lat: number | null;
  lng: number | null;
  jenis: string | null;
  konstruksi: string | null;
  nomor_lama: string | null;
  /** Kode penanda (gardu/lbsm/recloser/…) — menentukan ikonnya di peta. */
  penanda: string | null;
  sumber: string | null;
  dikonfirmasi_at: string | null;
  /** Diisi di sini, bukan dari database: nama segmen yang memikul tiang ini. */
  segmen: string[];
  /** Id segmennya — dipakai layar penandaan untuk tahu mana yang sudah masuk. */
  segmenIds: string[];
  penyulangLewat: string[];
}

/** PostgREST selalu mengetikkan relasi tertanam sebagai LARIK, walaupun
 *  kenyataannya satu baris. Ditulis apa adanya di sini supaya tidak perlu
 *  dipaksa dengan `as` — pemaksaan tipe itu yang membuat bentuk data
 *  sebenarnya berhenti bisa dipercaya. */
interface AnggotaBaris {
  tiang_id: string;
  segmen_id: string;
  segmen: { nama: string; penyulang: string; status: string }[] | null;
}

export function useTiangJtm(user: CurrentUser, ulpPilihan: string) {
  const toast = useToast();
  const [tiang, setTiang] = useState<TiangJtm[]>([]);
  const [loading, setLoading] = useState(true);
  // Galat DISIMPAN, bukan cuma dilempar ke toast. Toast lewat dalam tiga detik;
  // sesudah itu kueri yang gagal tidak bisa dibedakan dari "memang tidak ada
  // tiangnya" — dan yang pertama butuh tindakan, yang kedua tidak.
  const [error, setError] = useState<string | null>(null);

  const unit = canSeeAllUnits(user.role) ? ulpPilihan || null : (user.unit ?? null);

  const muat = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, anggota] = await Promise.all([
        fetchAllRows<Omit<TiangJtm, "segmen" | "segmenIds" | "penyulangLewat">>(() => {
          const q = supabaseBrowser
            .from("tiang")
            .select(
              "id,kode,penyulang,ulp,induk_id,lat,lng,jenis,konstruksi,nomor_lama,penanda,sumber,dikonfirmasi_at",
            )
            .not("penyulang", "is", null)
            .is("gardu_kode", null)
            .eq("status_hidup", "aktif")
            .order("penyulang")
            .order("kode");
          return unit ? q.eq("ulp", unit) : q;
        }),
        fetchAllRows<AnggotaBaris>(() =>
          supabaseBrowser
            .from("segmen_tiang")
            .select("tiang_id,segmen_id,segmen(nama,penyulang,status)")
            .order("tiang_id"),
        ),
      ]);

      const per = new Map<string, { segmen: string[]; ids: string[]; penyulang: Set<string> }>();
      for (const a of anggota) {
        const s = Array.isArray(a.segmen) ? a.segmen[0] : a.segmen;
        if (!s || s.status !== "aktif") continue;
        const isi = per.get(a.tiang_id) ?? { segmen: [], ids: [], penyulang: new Set<string>() };
        isi.segmen.push(s.nama);
        isi.ids.push(a.segmen_id);
        isi.penyulang.add(s.penyulang);
        per.set(a.tiang_id, isi);
      }

      setTiang(
        rows.map((t) => {
          const isi = per.get(t.id);
          return {
            ...t,
            lat: t.lat === null ? null : Number(t.lat),
            lng: t.lng === null ? null : Number(t.lng),
            segmen: isi?.segmen ?? [],
            segmenIds: isi?.ids ?? [],
            penyulangLewat: isi ? [...isi.penyulang] : [],
          };
        }),
      );
    } catch (e) {
      const pesan = e instanceof Error ? e.message : String(e);
      toast.error(`Gagal memuat tiang: ${pesan}`);
      setError(pesan);
      setTiang([]);
    } finally {
      setLoading(false);
    }
  }, [unit, toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  const penyulangList = useMemo(
    () => [...new Set(tiang.map((t) => t.penyulang))].sort(),
    [tiang],
  );

  return { tiang, penyulangList, loading, error, muat };
}
