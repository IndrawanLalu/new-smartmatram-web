"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Ambang lapangan inspeksi JTM — jarak & radius yang dibaca HP (`jtm_ambang`)
 * saat layar penyapuan dibuka. Berlaku Tier 1 dan Tier 2, semua ULP (baris
 * `jtm_settings` 'ALL'). Batas min/maks = CHECK di database.
 */

type Kolom =
  | "jarak_maks_nilai_m" | "akurasi_minimum_m" | "radius_tumpang_m"
  | "radius_cari_tumpang_m" | "radius_peta_tumpang_m" | "bentang_maks_wajar_m";

const KOLOM: { k: Kolom; label: string; bantu: string; min: number; maks: number }[] = [
  { k: "jarak_maks_nilai_m", label: "Jarak menilai tiang", min: 5, maks: 500,
    bantu: "Jarak terjauh regu dari tiang saat menilai. Lebih jauh dari ini, tombol simpan ditolak." },
  { k: "akurasi_minimum_m", label: "Ketelitian GPS", min: 5, maks: 200,
    bantu: "Pembacaan GPS lebih kasar dari ini dianggap belum layak — regu diminta menunggu." },
  { k: "radius_tumpang_m", label: "Radius tiang kembar", min: 2, maks: 100,
    bantu: "Menitik tiang baru ditolak bila sudah ada tiang lain sedekat ini (hampir pasti batang yang sama)." },
  { k: "radius_cari_tumpang_m", label: "Radius cari menumpang", min: 2, maks: 500,
    bantu: "Tiang yang bisa dipilih saat regu menekan \"Menumpang\"." },
  { k: "radius_peta_tumpang_m", label: "Luas peta menumpang", min: 30, maks: 1000,
    bantu: "Sejauh mana tiang & bentang sekitar digambar di layar Menumpang. Harus ≥ radius cari menumpang." },
  { k: "bentang_maks_wajar_m", label: "Bentang wajar", min: 20, maks: 1000,
    bantu: "Jarak antar tiang lebih dari ini membuat HP bertanya: ada tiang yang belum tercatat?" },
];

type Ambang = Record<Kolom, number>;

export default function AmbangLapanganJtm() {
  const toast = useToast();
  const [awal, setAwal] = useState<Ambang | null>(null);
  const [isi, setIsi] = useState<Ambang | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    void supabaseBrowser.from("jtm_settings").select(KOLOM.map((x) => x.k).join(",")).eq("ulp", "ALL").maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const a = Object.fromEntries(KOLOM.map(({ k }) => [k, Number((data as unknown as Record<string, unknown>)[k])])) as Ambang;
        setAwal(a);
        setIsi(a);
      });
  }, []);

  if (!isi || !awal) return null;
  const salah = KOLOM.filter(({ k, min, maks }) => !(isi[k] >= min && isi[k] <= maks));
  const petaKecil = isi.radius_peta_tumpang_m < isi.radius_cari_tumpang_m;
  const berubah = KOLOM.some(({ k }) => isi[k] !== awal[k]);

  const simpan = async () => {
    setSibuk(true);
    const { error } = await supabaseBrowser.from("jtm_settings").update({ ...isi, updated_at: new Date().toISOString() }).eq("ulp", "ALL");
    setSibuk(false);
    if (error) return toast.error(error.message);
    setAwal(isi);
    toast.success("Ambang lapangan disimpan — berlaku di HP saat layar inspeksi dibuka berikutnya.");
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className={EYEBROW}>Ambang lapangan — Tier 1 & Tier 2</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">
        Jarak dan radius yang dipakai HP saat inspeksi JTM, untuk semua ULP. Server memakai angka yang sama, jadi
        HP lama pun ikut aturan baru.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {KOLOM.map(({ k, label, bantu, min, maks }) => {
          const keliru = salah.some((x) => x.k === k) || (k === "radius_peta_tumpang_m" && petaKecil);
          return (
            <label key={k} className="text-xs">
              <span className="font-semibold text-ink">{label}</span>
              <span className="mt-1 flex items-center gap-1.5">
                <input
                  type="number" inputMode="decimal" min={min} max={maks} value={isi[k]}
                  onChange={(e) => setIsi({ ...isi, [k]: Number(e.target.value) })}
                  className={`${FIELD} w-24 ${keliru ? "border-red-400" : ""}`}
                />
                <span className="text-ink-muted">m</span>
                <span className="text-[10px] text-ink-muted">({min}–{maks})</span>
              </span>
              <span className="mt-1 block text-[11px] text-ink-muted leading-snug">{bantu}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button onClick={() => void simpan()} disabled={!berubah || salah.length > 0 || petaKecil || sibuk} className={`${BTN_GHOST} disabled:opacity-40`}>
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
        </button>
        {(salah.length > 0 || petaKecil) && (
          <p className="text-[11px] text-red-600">
            {petaKecil ? "Luas peta menumpang harus ≥ radius cari menumpang." : `Di luar batas: ${salah.map((x) => x.label).join(", ")}.`}
          </p>
        )}
      </div>
    </div>
  );
}
