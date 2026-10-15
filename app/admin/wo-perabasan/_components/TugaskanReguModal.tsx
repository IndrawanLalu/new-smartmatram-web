"use client";

import { useState } from "react";
import { Loader2, Users } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import Tombol from "@/app/admin/_kit/Tombol";
import type { Regu } from "../_hooks/useWoPerabasan";
import type { BarisRabas } from "../_hooks/useDaftarPerabasan";

/**
 * Tugaskan / ganti regu langsung dari menu ⋯ baris tabel. Penugasan bukan
 * keputusan atas hasil kerja (teknisaplikasi.md butir 7 — verifikasi, koreksi,
 * batal tetap di kaki modal rincian), jadi boleh tanpa membuka rinciannya.
 */

interface Props {
  b: BarisRabas;
  regu: Regu[];
  onSimpan: (regu: string) => Promise<boolean>;
  onTutup: () => void;
}

export default function TugaskanReguModal({ b, regu, onSimpan, onTutup }: Props) {
  const pilihan = regu.filter((g) => g.ulp === b.ulp);
  const [nama, setNama] = useState(b.regu ?? "");
  const [sibuk, setSibuk] = useState(false);

  const simpan = async () => {
    setSibuk(true);
    const ok = await onSimpan(nama);
    setSibuk(false);
    if (ok) onTutup();
  };

  return (
    <ModalShell
      title={b.regu ? "Ganti regu" : "Tugaskan regu"}
      subtitle={`${b.penyulang} · ${b.segmenNama}`}
      maxWidth="max-w-md"
      onClose={onTutup}
      footer={
        <>
          <Tombol onClick={onTutup} disabled={sibuk}>Batal</Tombol>
          <Tombol
            ragam="utama"
            ikon={sibuk ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />}
            onClick={() => void simpan()}
            disabled={sibuk || !nama || nama === b.regu}
          >
            Simpan
          </Tombol>
        </>
      }
    >
      {pilihan.length === 0 ? (
        <p className="text-sm text-ink-soft">ULP {b.ulp} belum punya regu rabas aktif di Manajemen Petugas (grup PERABASAN).</p>
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
    </ModalShell>
  );
}
