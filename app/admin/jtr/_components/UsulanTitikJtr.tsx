"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CheckCircle2, Loader2, MapPin, XCircle } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import type { TitikTiang } from "./PetaUsulan";
import { tgl } from "../_lib/tampilan";

const PetaUsulan = dynamic(() => import("./PetaUsulan"), {
  ssr: false,
  loading: () => <div className="h-[300px] rounded-xl border border-line bg-surface animate-pulse" />,
});

/**
 * Usulan koreksi master yang lahir dari INSPEKSI JTR di gardu ini — diputuskan
 * di dalam modal persetujuan inspeksinya, dengan peta yang sama.
 *
 * Menggantikan tab "Usulan Koreksi" JTR (24 Sep 2026), yang ternyata antrean
 * SEMUA modul: usulan Optimasi Trafo dan Pengukuran ikut masuk dan bisa
 * disetujui dari JTR tanpa melewati verifikasi modulnya sendiri. Sekarang tiap
 * usulan diputuskan di modul yang melahirkannya.
 */

interface Usulan {
  id: string;
  field: string;
  nilai_lama: { lat?: number; lng?: number; nilai?: unknown } | null;
  nilai_baru: { lat?: number; lng?: number; nilai?: unknown };
  bukti_akurasi: number | null;
  bukti_selisih: number | null;
  catatan: string | null;
  pengusul_nama: string | null;
  diusulkan_at: string;
  diterapkan_langsung: boolean;
}

const titik = (v: Usulan["nilai_lama"]) =>
  v && typeof v.lat === "number" && typeof v.lng === "number" ? { lat: v.lat, lng: v.lng } : null;

interface Props {
  garduKode: string;
  ulp: string;
  tiang: TitikTiang[];
  oleh: string;
}

export default function UsulanTitikJtr({ garduKode, ulp, tiang, oleh }: Props) {
  const toast = useToast();
  const [usulan, setUsulan] = useState<Usulan[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    supabaseBrowser
      .from("master_usulan")
      .select("id,field,nilai_lama,nilai_baru,bukti_akurasi,bukti_selisih,catatan,pengusul_nama,diusulkan_at,diterapkan_langsung")
      .eq("entitas", "gardu")
      .eq("entitas_kode", garduKode.toUpperCase())
      .eq("ulp", ulp.toUpperCase())
      .eq("sumber_modul", "inspeksi_jtr")
      .eq("status", "menunggu")
      .order("diusulkan_at")
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error) setGalat(error.message);
        else setUsulan((data ?? []) as unknown as Usulan[]);
      });
    return () => { hidup = false; };
  }, [garduKode, ulp]);

  const putuskan = async (u: Usulan, setuju: boolean) => {
    setSibuk(u.id);
    try {
      const { error } = await supabaseBrowser.rpc("putuskan_usulan", {
        p_id: u.id,
        p_setuju: setuju,
        p_nama: oleh,
        p_alasan: setuju ? "Disetujui saat persetujuan inspeksi JTR" : "Ditolak saat persetujuan inspeksi JTR",
      });
      if (error) throw new Error(error.message);
      setUsulan((p) => (p ?? []).filter((x) => x.id !== u.id));
      toast.success(
        setuju
          ? "Koreksi disetujui."
          : u.diterapkan_langsung
            ? "Koreksi ditolak — master dikembalikan ke nilai lama."
            : "Koreksi ditolak.",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal memutuskan usulan.");
    } finally {
      setSibuk(null);
    }
  };

  if (galat) return <p className="text-xs text-amber-700">Usulan koreksi gagal dimuat: {galat}</p>;
  if (usulan === null || usulan.length === 0) return null;

  return (
    <section className="rounded-xl border-2 border-navy-300 bg-navy-50/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin size={16} className="text-navy-600" />
        <p className="text-sm font-semibold text-navy-600">
          {usulan.length} usulan koreksi master dari inspeksi ini
        </p>
      </div>
      {usulan.map((u) => {
        const lama = titik(u.nilai_lama);
        const baru = titik(u.nilai_baru);
        return (
          <div key={u.id} className="rounded-lg bg-white border border-line p-3 space-y-3">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[200px] text-sm">
                <p className="font-semibold text-ink">
                  {u.field === "koordinat" ? "Koreksi titik gardu" : `Koreksi ${u.field}`}
                  {u.bukti_selisih != null && <span className="font-normal text-ink-soft"> · bergeser {Math.round(u.bukti_selisih)} m</span>}
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {u.pengusul_nama ?? "—"} · {tgl(u.diusulkan_at)}
                  {u.bukti_akurasi != null && ` · ketelitian GPS ±${Math.round(Number(u.bukti_akurasi))} m`}
                </p>
                {u.diterapkan_langsung && (
                  <p className="text-[11px] text-attention mt-1">
                    Titik ini <b>sudah dipakai</b> sejak dikoreksi petugas. Menolak mengembalikannya ke titik lama.
                  </p>
                )}
                {u.catatan && <p className="text-xs text-ink-soft italic mt-1">{u.catatan}</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => void putuskan(u, false)} disabled={sibuk === u.id} className={BTN_GHOST}>
                  <XCircle size={14} /> Tolak
                </button>
                <button onClick={() => void putuskan(u, true)} disabled={sibuk === u.id} className={BTN_PRIMARY}>
                  {sibuk === u.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Setujui
                </button>
              </div>
            </div>
            {baru && (
              <PetaUsulan
                lama={lama}
                baru={baru}
                akurasi={u.bukti_akurasi != null ? Number(u.bukti_akurasi) : null}
                tiang={tiang}
                tinggi={300}
              />
            )}
          </div>
        );
      })}
    </section>
  );
}
