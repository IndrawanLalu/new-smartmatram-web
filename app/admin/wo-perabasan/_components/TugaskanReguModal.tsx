"use client";

import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import Tombol from "@/app/admin/_kit/Tombol";
import type { Regu } from "../_hooks/useWoPerabasan";
import type { BarisRabas } from "../_hooks/useDaftarPerabasan";

/**
 * Tugaskan / ganti regu langsung dari menu ⋯ baris tabel, atau untuk beberapa
 * segmen yang dicentang sekaligus (27 Okt 2026) — semuanya ke SATU regu, jadi
 * semuanya harus satu ULP. Penugasan bukan keputusan atas hasil kerja
 * (teknisaplikasi.md butir 7 — verifikasi, koreksi, batal tetap di kaki modal
 * rincian), jadi boleh tanpa membuka rinciannya.
 */

interface Props {
  daftar: BarisRabas[];
  regu: Regu[];
  onSimpan: (regu: string) => Promise<boolean>;
  onTutup: () => void;
}

const kmTeks = (v: number) => v.toFixed(2).replace(".", ",");

export default function TugaskanReguModal({ daftar, regu, onSimpan, onTutup }: Props) {
  const satu = daftar.length === 1 ? daftar[0] : null;
  const ulp = [...new Set(daftar.map((b) => b.ulp))];
  const pilihan = ulp.length === 1 ? regu.filter((g) => g.ulp === ulp[0]) : [];
  const [nama, setNama] = useState(satu?.regu ?? "");
  const [sibuk, setSibuk] = useState(false);

  const simpan = async () => {
    setSibuk(true);
    const ok = await onSimpan(nama);
    setSibuk(false);
    if (ok) onTutup();
  };

  return (
    <ModalShell
      title={satu ? (satu.regu ? "Ganti regu" : "Tugaskan regu") : `Tugaskan ${daftar.length} segmen ke regu`}
      subtitle={satu
        ? `${satu.penyulang} · ${satu.segmenNama}`
        : `${kmTeks(daftar.reduce((a, b) => a + (b.panjangKm ?? 0), 0))} km · semua ke satu regu`}
      maxWidth="max-w-md"
      onClose={onTutup}
      footer={
        <>
          <Tombol onClick={onTutup} disabled={sibuk}>Batal</Tombol>
          <Tombol
            ragam="utama"
            ikon={sibuk ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
            onClick={() => void simpan()}
            disabled={sibuk || !nama || (!!satu && nama === satu.regu)}
          >
            {satu ? "Simpan" : `Tugaskan ${daftar.length} segmen`}
          </Tombol>
        </>
      }
    >
      {ulp.length > 1 ? (
        <p className="text-sm text-amber-800 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
          Segmen terpilih berasal dari {ulp.length} ULP ({ulp.join(", ")}). Regu rabas berbeda per ULP — pilih ULP dulu
          di atas daftar, lalu centang ulang.
        </p>
      ) : pilihan.length === 0 ? (
        <p className="text-sm text-ink-soft">ULP {ulp[0]} belum punya regu rabas aktif di Manajemen Petugas (grup PERABASAN).</p>
      ) : (
        <div className="space-y-2">
          {pilihan.map((g) => (
            <label
              key={g.regu}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${
                nama === g.regu ? "border-brand-500 bg-brand-50" : "border-line hover:border-brand-300"
              }`}
            >
              <input type="radio" name="regu" checked={nama === g.regu} onChange={() => setNama(g.regu)} className="accent-brand-600" />
              <span className="flex-1 font-semibold text-ink">{g.regu}</span>
              <span className="text-xs text-ink-muted tabular-nums">{g.segmen_berjalan} segmen berjalan</span>
            </label>
          ))}
          <p className="text-xs text-ink-muted">Segmen langsung muncul di HP regu yang dipilih.</p>
        </div>
      )}

      {!satu && (
        <ul className="max-h-48 overflow-y-auto rounded-xl border border-line divide-y divide-line text-xs">
          {daftar.map((b) => (
            <li key={b.id} className="px-3 py-1.5 flex gap-2">
              <span className="flex-1 min-w-0 truncate text-ink">{b.penyulang} · {b.segmenNama}</span>
              <span className="text-ink-muted whitespace-nowrap">{b.regu ?? "belum dibagi"}</span>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}
