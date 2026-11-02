"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Moon } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits } from "@/lib/roles";
import { supabaseBrowser } from "@/lib/supabase-browser";

/**
 * Jam kerja Tier 2 per ULP (scripts/jam-tier2.sql, 3 Nov 2026) — berlaku untuk
 * Inspeksi JTM DAN Inspeksi Gardu, jadi kartu yang sama tampil di pengaturan
 * keduanya. HP memakai jam server; server menolak penilaian di luar jam.
 * UP3 mengubah semua ULP, admin hanya ULP-nya (penjaga di simpan_jam_tier2).
 */

interface Baris { ulp: string; mulai: string; selesai: string; toleransi_menit: number; aktif: boolean; diubah_oleh: string | null }

const jam = (t: string) => t.slice(0, 5);

export default function JamTier2() {
  const user = useCurrentUser();
  const toast = useToast();
  const [awal, setAwal] = useState<Baris[] | null>(null);
  const [isi, setIsi] = useState<Baris[]>([]);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState<string | null>(null);

  useEffect(() => {
    void supabaseBrowser.from("jam_tier2").select("ulp,mulai,selesai,toleransi_menit,aktif,diubah_oleh").order("ulp")
      .then(({ data, error }) => {
        if (error) return setGalat(/jam_tier2/.test(error.message) ? "Jalankan scripts/jam-tier2.sql di Supabase dulu." : error.message);
        const b = ((data ?? []) as Baris[])
          .filter((r) => canSeeAllUnits(user.role) || r.ulp === user.unit)
          .map((r) => ({ ...r, mulai: jam(r.mulai), selesai: jam(r.selesai) }));
        setAwal(b);
        setIsi(b);
      });
  }, [user.role, user.unit]);

  const ubah = (ulp: string, patch: Partial<Baris>) => setIsi((x) => x.map((r) => (r.ulp === ulp ? { ...r, ...patch } : r)));
  const bolehUbah = canSeeAllUnits(user.role) || user.role === "admin";

  const simpan = async (r: Baris) => {
    setSibuk(r.ulp);
    const { error } = await supabaseBrowser.rpc("simpan_jam_tier2", {
      p_ulp: r.ulp, p_mulai: r.mulai, p_selesai: r.selesai, p_toleransi: r.toleransi_menit, p_aktif: r.aktif, p_oleh: user.name,
    });
    setSibuk(null);
    if (error) return toast.error(error.message);
    setAwal((a) => a?.map((x) => (x.ulp === r.ulp ? { ...r, diubah_oleh: user.name } : x)) ?? null);
    toast.success(r.aktif
      ? `Jam Tier 2 ULP ${r.ulp}: ${r.mulai.replace(":", ".")}–${r.selesai.replace(":", ".")} WITA, toleransi ${r.toleransi_menit} menit.`
      : `Kunci jam Tier 2 ULP ${r.ulp} dinonaktifkan.`);
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className={`${EYEBROW} flex items-center gap-1.5`}><Moon size={13} /> Jam kerja Tier 2 — Inspeksi JTM & Inspeksi Gardu</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">
        Tier 2 hanya bisa dikerjakan pada jam ini, menurut <b>jam server</b> (jam HP yang diubah tidak berpengaruh).
        Toleransi = menit sesudah jam selesai yang masih diterima. HP tanpa sinyal tetap boleh menilai di dalam jam,
        tetapi penilaiannya ditandai <i>jam belum terverifikasi</i> untuk diperiksa saat menyetujui.
      </p>
      {galat ? (
        <p className="mt-3 text-xs text-red-600">{galat}</p>
      ) : !awal ? (
        <p className="mt-3 text-xs text-ink-muted flex items-center gap-1.5"><Loader2 size={13} className="animate-spin" /> Memuat…</p>
      ) : (
        <table className="mt-3 text-xs">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-1 pr-4 font-semibold">ULP</th><th className="pr-3 font-semibold">Mulai</th>
              <th className="pr-3 font-semibold">Selesai</th><th className="pr-3 font-semibold">Toleransi</th>
              <th className="pr-3 font-semibold">Kunci</th><th />
            </tr>
          </thead>
          <tbody>
            {isi.map((r) => {
              const a = awal.find((x) => x.ulp === r.ulp);
              const berubah = !a || a.mulai !== r.mulai || a.selesai !== r.selesai || a.toleransi_menit !== r.toleransi_menit || a.aktif !== r.aktif;
              const salah = !r.mulai || !r.selesai || r.mulai === r.selesai || !(r.toleransi_menit >= 0 && r.toleransi_menit <= 120);
              return (
                <tr key={r.ulp} className="border-t border-line">
                  <td className="py-2 pr-4 font-semibold text-ink">{r.ulp}</td>
                  <td className="pr-3"><input type="time" value={r.mulai} disabled={!bolehUbah} onChange={(e) => ubah(r.ulp, { mulai: e.target.value })} className={`${FIELD} w-28`} aria-label={`Mulai ${r.ulp}`} /></td>
                  <td className="pr-3"><input type="time" value={r.selesai} disabled={!bolehUbah} onChange={(e) => ubah(r.ulp, { selesai: e.target.value })} className={`${FIELD} w-28`} aria-label={`Selesai ${r.ulp}`} /></td>
                  <td className="pr-3 whitespace-nowrap">
                    <input type="number" min={0} max={120} value={r.toleransi_menit} disabled={!bolehUbah}
                      onChange={(e) => ubah(r.ulp, { toleransi_menit: Number(e.target.value) })} className={`${FIELD} w-20`} aria-label={`Toleransi ${r.ulp}`} />
                    <span className="ml-1 text-ink-muted">menit</span>
                  </td>
                  <td className="pr-3">
                    <button type="button" role="switch" aria-checked={r.aktif} disabled={!bolehUbah} onClick={() => ubah(r.ulp, { aktif: !r.aktif })}
                      className={`h-6 px-2.5 rounded-full text-[11px] font-semibold border ${r.aktif ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {r.aktif ? "Aktif" : "Nonaktif"}
                    </button>
                  </td>
                  <td>
                    {bolehUbah && (
                      <button onClick={() => void simpan(r)} disabled={!berubah || salah || sibuk !== null} className={`${BTN_GHOST} h-8 disabled:opacity-40`}>
                        {sibuk === r.ulp ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Simpan
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
