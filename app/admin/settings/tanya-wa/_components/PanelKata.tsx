"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import Tombol from "@/app/admin/_kit/Tombol";
import type { TanyaWa } from "../_hooks/useTanyaWa";

/** Kata kunci satu fungsi: chip + bobot (klik angka untuk ganti 1→2→3). */

const BOBOT = [
  { nilai: 1, label: "1 · biasa" },
  { nilai: 2, label: "2 · kuat" },
  { nilai: 3, label: "3 · sangat kuat" },
];
const WARNA_BOBOT: Record<number, string> = {
  1: "bg-slate-100 text-slate-600",
  2: "bg-brand-100 text-brand-700",
  3: "bg-brand-600 text-white",
};

interface Props {
  kode: string;
  data: TanyaWa;
  bisaUbah: boolean;
}

export default function PanelKata({ kode, data, bisaUbah }: Props) {
  const [teks, setTeks] = useState("");
  const [bobot, setBobot] = useState(2);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const kata = data.kata.filter((k) => k.fungsi_kode === kode);

  async function tambah() {
    // Beberapa sekaligus: "overload, beban lebih, ol"
    const daftar = teks.split(",").map((t) => t.trim()).filter(Boolean);
    if (!daftar.length) return;
    setSibuk(true);
    const gagal: string[] = [];
    for (const t of daftar) {
      const g = await data.tambahKata(kode, t, bobot);
      if (g) gagal.push(`${t}: ${g}`);
    }
    setSibuk(false);
    setGalat(gagal.join(" · ") || null);
    if (!gagal.length) setTeks("");
  }

  return (
    <div className={`${CARD} p-4 flex flex-col gap-3`}>
      <div className={EYEBROW}>Kata kunci ({kata.length})</div>
      <div className="flex flex-wrap gap-1.5">
        {kata.length === 0 && <span className="text-xs text-ink-muted">Belum ada — fungsi ini tidak akan pernah terpilih.</span>}
        {kata.map((k) => (
          <span key={k.id} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full border border-line bg-white text-[12.5px]">
            {k.kata}
            <button
              type="button"
              disabled={!bisaUbah}
              title="Bobot — klik untuk ganti"
              onClick={async () => setGalat(await data.ubahBobot(k.id, (k.bobot % 3) + 1))}
              className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-bold tabular-nums ${WARNA_BOBOT[k.bobot] ?? WARNA_BOBOT[1]}`}
            >
              {k.bobot}
            </button>
            {bisaUbah && (
              <button
                type="button"
                aria-label={`Hapus ${k.kata}`}
                onClick={async () => setGalat(await data.hapusKata(k.id))}
                className="p-0.5 rounded-full text-ink-muted hover:text-red-600 hover:bg-red-50"
              >
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>

      {bisaUbah && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void tambah();
          }}
        >
          <input
            value={teks}
            onChange={(e) => setTeks(e.target.value)}
            placeholder="Kata atau frasa baru — pisahkan dengan koma"
            className={`${FIELD} flex-1 min-w-[220px]`}
          />
          <select value={bobot} onChange={(e) => setBobot(Number(e.target.value))} className={`${FIELD} w-[150px]`} aria-label="Bobot">
            {BOBOT.map((b) => (
              <option key={b.nilai} value={b.nilai}>
                {b.label}
              </option>
            ))}
          </select>
          <Tombol type="submit" ragam="utama" ikon={<Plus size={15} />} disabled={sibuk || !teks.trim()}>
            Tambah
          </Tombol>
        </form>
      )}
      {galat && <p className="text-xs text-red-600">{galat}</p>}
    </div>
  );
}
