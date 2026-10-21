"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Ambang ΔT (selisih suhu titik panas − suhu pembanding) untuk SARAN kategori
 * temuan Tier 2 di HP (scripts/jtm-tier2-malam.sql). Regu tetap yang memilih.
 * Satu baris `jtm_settings` 'ALL' — berlaku semua ULP.
 */

type Ambang = { dt_biasa: number; dt_rawan: number; dt_urgent: number };
const KOLOM: { k: keyof Ambang; label: string; nada: string }[] = [
  { k: "dt_biasa", label: "Biasa mulai", nada: "text-sky-700" },
  { k: "dt_rawan", label: "Rawan mulai", nada: "text-amber-700" },
  { k: "dt_urgent", label: "Urgent mulai", nada: "text-red-700" },
];

export default function AmbangDtJtm() {
  const toast = useToast();
  const [awal, setAwal] = useState<Ambang | null>(null);
  const [isi, setIsi] = useState<Ambang | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    void supabaseBrowser.from("jtm_settings").select("dt_biasa,dt_rawan,dt_urgent").eq("ulp", "ALL").maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const a = { dt_biasa: Number(data.dt_biasa), dt_rawan: Number(data.dt_rawan), dt_urgent: Number(data.dt_urgent) };
        setAwal(a);
        setIsi(a);
      });
  }, []);

  if (!isi || !awal) return null;
  const urut = isi.dt_biasa > 0 && isi.dt_biasa < isi.dt_rawan && isi.dt_rawan < isi.dt_urgent;
  const berubah = KOLOM.some(({ k }) => isi[k] !== awal[k]);

  const simpan = async () => {
    setSibuk(true);
    const { error } = await supabaseBrowser.from("jtm_settings").update(isi).eq("ulp", "ALL");
    setSibuk(false);
    if (error) return toast.error(error.message);
    setAwal(isi);
    toast.success("Ambang ΔT disimpan — berlaku di HP saat formulir dimuat berikutnya.");
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className={EYEBROW}>Ambang ΔT — Tier 2</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">
        ΔT = suhu titik panas − suhu pembanding (fasa lain yang normal). HP <b>menyarankan</b> kategori temuan
        dari angka ini; flashover yang terlihat selalu disarankan Urgent. Regu tetap yang memilih kategorinya.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        {KOLOM.map(({ k, label, nada }) => (
          <label key={k} className="text-xs">
            <span className={`font-semibold ${nada}`}>{label}</span>
            <span className="mt-1 flex items-center gap-1.5">
              <input
                type="number" inputMode="decimal" min={1} value={isi[k]}
                onChange={(e) => setIsi({ ...isi, [k]: Number(e.target.value) })}
                className={`${FIELD} w-24`}
              />
              <span className="text-ink-muted">°C</span>
            </span>
          </label>
        ))}
        <button onClick={() => void simpan()} disabled={!berubah || !urut || sibuk} className={`${BTN_GHOST} disabled:opacity-40`}>
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
        </button>
      </div>
      {!urut && <p className="mt-2 text-[11px] text-red-600">Ambang harus naik: Biasa &lt; Rawan &lt; Urgent.</p>}
    </div>
  );
}
