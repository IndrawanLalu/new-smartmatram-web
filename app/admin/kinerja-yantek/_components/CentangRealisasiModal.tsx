"use client";

import { useEffect, useMemo, useState } from "react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import type { CurrentUser } from "@/lib/roles";
import { fmtAngka, JENIS_SURAT, labelBulan } from "../_lib/woSurat";

/**
 * Realisasi WO tempelan yang modulnya belum ada (JTM Tier 2, Inspeksi Gardu
 * Tier 1 & 2) — dicentang per objek di web (keputusan user 29 Sep 2026).
 * Centang = selesai pada tanggal itu; dibatalkan = kosongkan centangnya.
 */

const UNIT = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];
const hariIni = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Makassar" });

interface Item {
  id: string;
  urutan: number;
  objek: string;
  alamat: string | null;
  km: number | null;
  pelaksana: string | null;
  selesai_tgl: string | null;
}

interface Props {
  user: CurrentUser;
  kunci: string;
  ulpAwal: string | null;
  periodeAwal: string;
  onTutup: () => void;
  onBerubah: () => void;
}

export default function CentangRealisasiModal({ user, kunci, ulpAwal, periodeAwal, onTutup, onBerubah }: Props) {
  const toast = useToast();
  const up3 = user.role === "UP3";
  const jenis = JENIS_SURAT.find((j) => j.kunci === kunci)!;
  const [ulp, setUlp] = useState(up3 ? (ulpAwal ?? UNIT[0]) : (user.unit ?? "").toUpperCase());
  const [periode, setPeriode] = useState(periodeAwal);
  const [tahun, bulan] = periode.split("-").map(Number);
  const [muat, setMuat] = useState<{ kunci: string; item: Item[] } | null>(null);
  const kini = `${ulp}|${periode}`;

  useEffect(() => {
    let hidup = true;
    (async () => {
      const { data: wo, error } = await supabaseBrowser
        .from("wo_manual").select("id").eq("ulp", ulp).eq("tahun", tahun).eq("bulan", bulan).eq("jenis", kunci).maybeSingle();
      if (error) throw new Error(error.message);
      const item = wo
        ? await fetchAllRows<Item>(() =>
            supabaseBrowser
              .from("wo_manual_item")
              .select("id,urutan,objek,alamat,km,pelaksana,selesai_tgl")
              .eq("wo_id", wo.id)
              .order("urutan"),
          )
        : [];
      if (hidup) setMuat({ kunci: kini, item });
    })().catch((e: Error) => {
      if (!hidup) return;
      toast.error(`WO gagal dibaca: ${e.message}`);
      setMuat({ kunci: kini, item: [] });
    });
    return () => { hidup = false; };
  }, [kini, ulp, tahun, bulan, kunci, toast]);

  const item = useMemo(() => (muat?.kunci === kini ? muat.item : null), [muat, kini]);
  const selesai = (item ?? []).filter((i) => i.selesai_tgl);

  const centang = async (it: Item, tgl: string | null) => {
    const { error } = await supabaseBrowser.rpc("centang_wo_manual", { p_id: it.id, p_tgl: tgl, p_oleh: user.name ?? user.email });
    if (error) return toast.error(error.message);
    setMuat((m) => m && { ...m, item: m.item.map((x) => (x.id === it.id ? { ...x, selesai_tgl: tgl } : x)) });
    onBerubah();
  };

  const total = (xs: Item[]) => (jenis.km ? xs.reduce((a, x) => a + Number(x.km ?? 0), 0) : xs.length);

  return (
    <ModalShell
      title={`Realisasi ${jenis.nama.replace(/^WO /, "")}`}
      subtitle="Centang objek yang sudah selesai dikerjakan"
      maxWidth="max-w-3xl"
      onClose={onTutup}
      footer={<button onClick={onTutup} className={`${BTN_GHOST} ml-auto`}>Tutup</button>}
    >
      <div className="flex flex-wrap items-end gap-3">
        <select value={ulp} onChange={(e) => setUlp(e.target.value)} disabled={!up3} className={`${FIELD} w-[160px]`} aria-label="ULP">
          {(up3 ? UNIT : [ulp]).map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <input type="month" value={periode} onChange={(e) => e.target.value && setPeriode(e.target.value)} className={`${FIELD} w-[170px]`} aria-label="Bulan WO" />
        {item && item.length > 0 && (
          <p className="text-sm text-ink ml-auto">
            <b>{fmtAngka(total(selesai), jenis.km)}</b> dari {fmtAngka(total(item), jenis.km)} {jenis.satuan} selesai
          </p>
        )}
      </div>

      {item === null ? (
        <p className="text-xs text-ink-muted">memuat…</p>
      ) : item.length === 0 ? (
        <p className="text-xs text-ink-muted">
          Belum ada WO {jenis.nama.replace(/^WO /, "")} {labelBulan(tahun, bulan)} ULP {ulp}. Tempel dulu lewat Cetak / Kirim WO.
        </p>
      ) : (
        <div className="rounded-xl border border-line overflow-auto max-h-[55vh]">
          <table className="w-full text-sm">
            <tbody>
              {item.map((it) => (
                <tr key={it.id} className="border-b border-line last:border-0">
                  <td className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={!!it.selesai_tgl}
                      onChange={(e) => void centang(it, e.target.checked ? hariIni() : null)}
                      className="w-4 h-4 accent-navy-600"
                      aria-label={`Selesai ${it.objek}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-ink">{it.objek}</p>
                    <p className="text-[11px] text-ink-muted">{[it.alamat, it.pelaksana].filter(Boolean).join(" · ")}</p>
                  </td>
                  {jenis.km && <td className="px-3 py-2 text-right tabular-nums">{fmtAngka(it.km === null ? null : Number(it.km), true)}</td>}
                  <td className="px-3 py-2 w-[160px]">
                    {it.selesai_tgl && (
                      <input
                        type="date"
                        value={it.selesai_tgl}
                        onChange={(e) => e.target.value && void centang(it, e.target.value)}
                        className={`${FIELD} h-8 w-full text-xs`}
                        aria-label="Tanggal selesai"
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalShell>
  );
}
