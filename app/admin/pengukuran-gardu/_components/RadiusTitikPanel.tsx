"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Crosshair, Loader2, RotateCcw } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { CARD, FIELD } from "@/app/admin/_ui";
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
 *
 * ── LETAKNYA ────────────────────────────────────────────────────────────────
 * Di DASAR tab Persetujuan, terlipat. Sempat ditaruh di kepala halaman dan
 * Bapak benar menolaknya: panel yang selalu terbuka di atas segalanya
 * menghalangi pandangan pada tiap tab, padahal angkanya disentuh sekali lalu
 * dibiarkan berbulan-bulan.
 *
 * Tempatnya di sini karena inilah tab yang isinya ditentukan angka ini. Admin
 * yang merasa antreannya terlalu panjang atau terlalu kosong sudah berada di
 * layar yang tepat untuk menggesernya.
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
  // Tertutup saat dibuka, sepola panel Kriteria Anomali. Angkanya disentuh
  // sekali lalu dibiarkan berbulan-bulan; yang terbuka terus cuma memakan
  // ruang layar tiap hari.
  const [buka, setBuka] = useState(false);

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

  if (loading) return null;

  return (
    <div className={CARD}>
      <button
        onClick={() => setBuka((b) => !b)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
      >
        <Crosshair size={17} className="text-navy-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink">Radius titik pengukuran</p>
          <p className="text-[11px] text-ink-muted mt-0.5 truncate">
            {tampil.map((b) => `${b.ulp === "ALL" ? "bawaan" : b.ulp} ${b.radius_titik_m} m`).join(" · ")}
          </p>
        </div>
        <ChevronDown
          size={16}
          className={`text-ink-muted shrink-0 transition-transform ${buka ? "rotate-180" : ""}`}
        />
      </button>

      {buka && (
        <div className="border-t border-line px-5 py-4">
          <p className="text-xs text-ink-soft max-w-3xl">
            Sejauh mana petugas boleh berdiri dari titik master saat mengukur. Di luar radius ini,
            HP menahan simpan dan meminta petugas memilih: <b>salah gardu</b>, atau{" "}
            <b>titik masternya yang keliru</b>. Yang kedua memperbarui titik master dan membuat
            pengukurannya menunggu persetujuan di tab <b>Persetujuan</b>.
          </p>
          <p className="text-[11px] text-ink-muted mt-1.5 max-w-3xl">
            Berlaku seketika di HP — tidak perlu OTA. Bukan kriteria anomali: yang ini menilai
            apakah pengukurannya sah dilakukan di situ, bukan apakah hasil ukurnya wajar.
          </p>

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
      )}
    </div>
  );
}
