"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Crosshair, Loader2, RotateCcw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";

/**
 * Radius titik pengukuran per ULP.
 *
 * Sengaja TERPISAH dari Kriteria Anomali meski tinggal di tabel yang sama:
 * yang di sana menilai HASIL UKURNYA (beban, suhu, unbalance), yang di sini
 * menilai APAKAH PENGUKURANNYA SAH DILAKUKAN DI SITU. Menggabungkannya membuat
 * orang mengira radius ikut menentukan gardu itu anomali atau tidak.
 *
 * Seluruh ULP ditampilkan SEKALIGUS, bukan mengikuti saringan di atas halaman.
 * Yang menyetel ini membandingkan: gardu di gang sempit Cakranegara memang
 * berbeda dengan gardu di tepi jalan Bayan, dan bedanya cuma terlihat kalau
 * angkanya berdampingan.
 */

const BAWAAN = 50;
const MIN = 10;
const MAKS = 2000;

interface Baris {
  ulp: string;
  radius_titik_m: number;
}

export default function RadiusTitikPanel({ user }: { user: CurrentUser }) {
  const toast = useToast();
  const [baris, setBaris] = useState<Baris[]>([]);
  const [draf, setDraf] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [sibuk, setSibuk] = useState<string | null>(null);

  const bolehSemua = canSeeAllUnits(user.role);

  const muat = useCallback(async () => {
    const { data, error } = await supabaseBrowser
      .from("anomali_settings")
      .select("ulp,radius_titik_m")
      .order("ulp");
    if (error) {
      toast.error(
        error.message.includes("radius_titik_m")
          ? "Kolom radius belum ada — jalankan scripts/pengukuran-kunci-titik.sql di Supabase."
          : error.message,
      );
      setLoading(false);
      return;
    }
    setBaris((data ?? []) as Baris[]);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void muat();
  }, [muat]);

  // Baris 'ALL' hanya jaring pengaman untuk unit yang belum punya barisnya
  // sendiri. Ditampilkan paling bawah dan diberi keterangan, bukan
  // disembunyikan: kalau kelak ada ULP baru, angka itulah yang berlaku baginya.
  const tampil = useMemo(
    () =>
      baris
        .filter((b) => bolehSemua || b.ulp === user.unit)
        .sort((a, b) => (a.ulp === "ALL" ? 1 : b.ulp === "ALL" ? -1 : a.ulp.localeCompare(b.ulp))),
    [baris, bolehSemua, user.unit],
  );

  const simpan = async (ulp: string, nilai: string) => {
    const v = Number(nilai.replace(",", "."));
    if (!Number.isFinite(v) || v < MIN || v > MAKS) {
      toast.error(`Radius harus antara ${MIN} dan ${MAKS} meter.`);
      return;
    }
    setSibuk(ulp);
    const { error } = await supabaseBrowser
      .from("anomali_settings")
      .upsert({ ulp, radius_titik_m: v, updated_at: new Date().toISOString() }, { onConflict: "ulp" });
    setSibuk(null);

    if (error) {
      toast.error(error.message);
      return;
    }
    setBaris((p) => p.map((b) => (b.ulp === ulp ? { ...b, radius_titik_m: v } : b)));
    setDraf((p) => {
      const n = { ...p };
      delete n[ulp];
      return n;
    });
    toast.success(`Radius ${ulp} jadi ${v} m — berlaku seketika di HP petugas.`);
  };

  if (loading) {
    return (
      <div className={`${CARD} p-5 flex items-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat radius titik…
      </div>
    );
  }

  return (
    <div className={`${CARD} p-5`}>
      <div className="flex items-start gap-3">
        <Crosshair size={18} className="text-navy-600 shrink-0 mt-0.5" />
        <div>
          <p className={EYEBROW}>Radius titik pengukuran</p>
          <p className="text-xs text-ink-soft mt-1 max-w-3xl">
            Sejauh mana petugas boleh berdiri dari titik master saat mengukur. Di luar radius ini,
            HP menahan simpan dan meminta petugas memilih: <b>salah gardu</b>, atau{" "}
            <b>titik masternya yang keliru</b>. Yang kedua memperbarui titik master dan membuat
            pengukurannya menunggu persetujuan di tab <b>Persetujuan</b>.
          </p>
          <p className="text-[11px] text-ink-muted mt-1.5 max-w-3xl">
            Berlaku seketika di HP — tidak perlu OTA. Bukan kriteria anomali: yang ini menilai
            apakah pengukurannya sah dilakukan di situ, bukan apakah hasil ukurnya wajar.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {tampil.map((b) => {
          const nilai = draf[b.ulp] ?? String(b.radius_titik_m);
          const berubah = Number(nilai) !== Number(b.radius_titik_m);
          const global = b.ulp === "ALL";

          return (
            <div key={b.ulp} className="flex flex-wrap items-center gap-2">
              <span
                className={`text-sm w-[150px] ${global ? "text-ink-muted italic" : "font-semibold text-ink"}`}
              >
                {global ? "Bawaan (ULP lain)" : b.ulp}
              </span>

              <input
                value={nilai}
                onChange={(e) => setDraf((p) => ({ ...p, [b.ulp]: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && berubah && void simpan(b.ulp, nilai)}
                inputMode="numeric"
                className={`${FIELD} w-[100px] text-right font-mono`}
                aria-label={`Radius ${b.ulp}`}
              />
              <span className="text-xs text-ink-muted w-[24px]">m</span>

              {berubah && (
                <button
                  onClick={() => void simpan(b.ulp, nilai)}
                  disabled={sibuk === b.ulp}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-lg text-xs font-semibold bg-navy-600 text-white disabled:opacity-40"
                >
                  {sibuk === b.ulp ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Check size={12} />
                  )}
                  Simpan
                </button>
              )}

              {berubah && (
                <button
                  onClick={() =>
                    setDraf((p) => {
                      const n = { ...p };
                      delete n[b.ulp];
                      return n;
                    })
                  }
                  className="text-ink-muted hover:text-ink"
                  title="Batalkan perubahan"
                >
                  <RotateCcw size={13} />
                </button>
              )}

              {/* Angka yang jauh dari bawaan diberi keterangan, bukan ditolak.
                  Radius 500 m mungkin memang perlu di ULP yang gardunya
                  tersebar — tapi pada angka segitu penjaganya praktis mati, dan
                  yang menyetelnya berhak tahu itu. */}
              {!berubah && b.radius_titik_m >= 300 && (
                <span className="text-[11px] text-amber-700">
                  sangat longgar — hampir tidak ada yang akan tertahan
                </span>
              )}
              {!berubah && b.radius_titik_m <= 20 && (
                <span className="text-[11px] text-amber-700">
                  sangat ketat — ketelitian GPS biasa saja sudah bisa melewatinya
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-ink-muted mt-3">
        Batas yang diterima {MIN}–{MAKS} m. Bawaan {BAWAAN} m.
      </p>
    </div>
  );
}
