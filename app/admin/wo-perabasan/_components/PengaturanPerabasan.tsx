"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { CARD, EYEBROW } from "@/app/admin/_ui";
import { canSeeAllUnits, UNITS } from "@/lib/roles";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Pengaturan Perabasan per ULP (scripts/perabasan-pengaturan-tiang.sql,
 * 24 Nov 2026). "Pohon temuan wajib dirabas": bawaan TIDAK wajib; hanya UP3
 * yang mengubah (dijaga simpan_perabasan_pengaturan). Admin melihat ULP-nya.
 */

export default function PengaturanPerabasan() {
  const user = useCurrentUser();
  const toast = useToast();
  const [wajib, setWajib] = useState<Map<string, { aktif: boolean; oleh: string | null }> | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const bolehUbah = user.role === "UP3";
  const ulp = UNITS.map((u) => u.value as string).filter((u) => canSeeAllUnits(user.role) || u === user.unit);

  useEffect(() => {
    void supabaseBrowser.from("perabasan_pengaturan").select("ulp,pohon_wajib,updated_oleh").then(({ data, error }) => {
      if (error) {
        setGalat(/perabasan_pengaturan/.test(error.message) ? "Jalankan scripts/perabasan-pengaturan-tiang.sql di Supabase dulu." : error.message);
        return;
      }
      setWajib(new Map((data ?? []).map((r) => [r.ulp, { aktif: !!r.pohon_wajib, oleh: r.updated_oleh ?? null }])));
    });
  }, []);

  const balik = async (u: string) => {
    const baru = !(wajib?.get(u)?.aktif ?? false);
    setSibuk(u);
    const { error } = await supabaseBrowser.rpc("simpan_perabasan_pengaturan", { p_ulp: u, p_pohon_wajib: baru, p_oleh: user.name });
    setSibuk(null);
    if (error) return toast.error(error.message);
    setWajib((m) => new Map(m).set(u, { aktif: baru, oleh: user.name ?? null }));
    toast.success(baru
      ? `ULP ${u}: pohon temuan inspeksi wajib dirabas sebelum Selesai disisir.`
      : `ULP ${u}: pohon temuan inspeksi boleh tidak dirabas.`);
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className={`${EYEBROW} flex items-center gap-1.5`}><Settings size={13} /> Pohon temuan inspeksi JTM</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">
        <b>Wajib</b> = regu tidak bisa <i>Selesai disisir</i> sebelum semua pohon temuan inspeksi JTM di segmen itu dirabas
        atau ditandai &quot;tidak perlu dirabas&quot;. <b>Tidak wajib</b> (bawaan) = pohonnya tetap tampil di HP sebagai
        &quot;disarankan dirabas&quot;, tapi tidak menghalangi. Pohon hasil Cek Perabasan selalu wajib.
        {!bolehUbah && " Hanya UP3 yang bisa mengubah."}
      </p>
      {galat ? (
        <p className="mt-3 text-xs text-red-600">{galat}</p>
      ) : !wajib ? (
        <p className="mt-3 text-xs text-ink-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Memuat…</p>
      ) : (
        <table className="mt-3 text-xs">
          <tbody>
            {ulp.map((u) => {
              const r = wajib.get(u);
              const aktif = r?.aktif ?? false;
              return (
                <tr key={u} className="border-t border-line first:border-0">
                  <td className="py-2 pr-6 font-semibold text-ink">{u}</td>
                  <td className="pr-4">
                    <button type="button" role="switch" aria-checked={aktif} disabled={!bolehUbah || sibuk !== null} onClick={() => void balik(u)}
                      className={`h-6 px-2.5 rounded-full text-[11px] font-semibold border disabled:cursor-not-allowed ${aktif ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {sibuk === u ? <Loader2 size={12} className="animate-spin inline" /> : aktif ? "Wajib dirabas" : "Tidak wajib"}
                    </button>
                  </td>
                  <td className="text-ink-muted">{r?.oleh ? `diubah ${r.oleh}` : "bawaan"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-ink-muted mt-3 max-w-3xl">
        Setiap pohon yang dirabas harus punya tiang di segmen WO-nya (bawaan: tiang terdekat dari titik pohon). HP
        memperingatkan sebelum memotret bila titik regu lebih dari 50 m dari tiang terdekat segmen itu.
      </p>
    </div>
  );
}
