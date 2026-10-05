"use client";

import { useState } from "react";
import { ChevronDown, FilePlus2, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import type { BarisPratinjau } from "../_hooks/usePratinjauWo";
import type { HasilTerbit } from "../_hooks/useWoPengukuran";
import DaftarPengingat from "./DaftarPengingat";

/**
 * Terbitkan WO Pengukuran (manual). Per ULP: isi WO menurut penyusun server
 * (rencana + sisa, atau aturan sistem), lalu gardu "sudah masuk waktu ukur"
 * yang tidak ikut — boleh dicentang supaya ikut masuk (bawaan tidak).
 */

export interface RencanaUlp {
  ulp: string;
  wo: BarisPratinjau[];
  pengingat: BarisPratinjau[];
}

interface Props {
  periode: string;
  rencana: RencanaUlp[];
  onTerbit: (ulp: string, tambahan: string[]) => Promise<HasilTerbit>;
  onTutup: () => void;
  onSelesai: () => void;
}

const hitung = (wo: BarisPratinjau[], a: BarisPratinjau["alasan"]) => wo.filter((b) => b.alasan === a).length;

function Ringkas({ wo }: { wo: BarisPratinjau[] }) {
  const rencana = hitung(wo, "rencana");
  const sisa = hitung(wo, "sisa");
  const belum = hitung(wo, "belum_pernah");
  const waktu = hitung(wo, "kedaluwarsa");
  const bagian = [
    rencana && `${rencana} sesuai rencana ULP`,
    sisa && `${sisa} sisa bulan lalu`,
    belum && `${belum} belum pernah diukur`,
    waktu && `${waktu} sudah masuk waktu ukur`,
  ].filter(Boolean);
  return <span className="text-ink-soft">{bagian.join(" · ")}</span>;
}

export default function TerbitWoModal({ periode, rencana, onTerbit, onTutup, onSelesai }: Props) {
  const toast = useToast();
  const [pilih, setPilih] = useState<Map<string, Set<string>>>(new Map());
  const [buka, setBuka] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const ubah = (ulp: string) => (kode: string[], aktif: boolean) =>
    setPilih((m) => {
      const s = new Set(m.get(ulp) ?? []);
      for (const k of kode) {
        if (aktif) s.add(k);
        else s.delete(k);
      }
      return new Map(m).set(ulp, s);
    });

  const tambahan = [...pilih.values()].reduce((n, s) => n + s.size, 0);
  const total = rencana.reduce((n, r) => n + r.wo.length, 0) + tambahan;

  const terbitkan = async () => {
    setSibuk(true);
    const berhasil: string[] = [];
    try {
      for (const r of rencana) {
        const h = await onTerbit(r.ulp, [...(pilih.get(r.ulp) ?? [])]);
        berhasil.push(`${r.ulp} ${h.jumlah}`);
      }
      toast.success(`WO ${periode} terbit — ${berhasil.join(", ")} gardu.`);
      onTutup();
    } catch (e) {
      toast.error(
        `${e instanceof Error ? e.message : "Gagal menerbitkan WO."}${berhasil.length ? ` (Sudah terbit: ${berhasil.join(", ")}.)` : ""}`,
      );
    } finally {
      setSibuk(false);
      onSelesai();
    }
  };

  return (
    <ModalShell
      title={`Terbitkan WO Pengukuran ${periode}?`}
      subtitle="Tanggal WO 1 bulan itu · langsung tampil di HP petugas ukur"
      maxWidth="max-w-3xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={() => void terbitkan()} className={BTN_PRIMARY} disabled={sibuk || total === 0}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <FilePlus2 size={14} />}
            WO-kan {total} gardu
          </button>
        </>
      }
    >
      <div className="p-5 space-y-4">
        {rencana.map((r) => {
          const n = pilih.get(r.ulp)?.size ?? 0;
          return (
            <div key={r.ulp} className="space-y-2">
              <p className="text-sm">
                <b className="text-ink">{r.ulp}</b> — {r.wo.length + n} gardu: <Ringkas wo={r.wo} />
                {n > 0 && <span className="text-ink-soft"> · {n} tambahan dicentang</span>}
              </p>
              {r.pengingat.length > 0 && (
                <>
                  <button
                    onClick={() => setBuka((b) => (b === r.ulp ? null : r.ulp))}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800"
                  >
                    {r.pengingat.length} gardu sudah masuk waktu ukur tidak ikut WO ini — centang untuk ikut
                    <ChevronDown size={13} className={`transition-transform ${buka === r.ulp ? "rotate-180" : ""}`} />
                  </button>
                  {buka === r.ulp && (
                    <DaftarPengingat baris={r.pengingat} pilih={pilih.get(r.ulp) ?? new Set()} onUbah={ubah(r.ulp)} />
                  )}
                </>
              )}
            </div>
          );
        })}
        <p className="text-xs text-ink-muted">
          Setelah terbit, daftarnya tidak bisa disusun ulang — untuk menyusun ulang, WO-nya harus dibatalkan lebih dulu.
          Gardu yang sudah masuk waktu ukur tetap bisa ditambahkan sesudahnya.
        </p>
      </div>
    </ModalShell>
  );
}
