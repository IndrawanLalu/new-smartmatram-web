"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import Tombol from "@/app/admin/_kit/Tombol";
import type { TanyaWa } from "../_hooks/useTanyaWa";

/**
 * Contoh pertanyaan satu fungsi — tampil di balasan "@smart bantuan" dan saat
 * bot tidak paham. Urutan = urutan tampil; yang pertama paling sering muncul.
 */

interface Props {
  kode: string;
  data: TanyaWa;
  bisaUbah: boolean;
}

export default function PanelContoh({ kode, data, bisaUbah }: Props) {
  const [teks, setTeks] = useState("");
  const [galat, setGalat] = useState<string | null>(null);
  const contoh = data.contoh.filter((c) => c.fungsi_kode === kode).sort((a, b) => a.urutan - b.urutan);

  async function jalankan(p: Promise<string | null>) {
    setGalat(await p);
  }

  return (
    <div className={`${CARD} p-4 flex flex-col gap-3`}>
      <div className={EYEBROW}>Contoh pertanyaan ({contoh.length})</div>
      {contoh.length === 0 ? (
        <span className="text-xs text-ink-muted">Belum ada contoh.</span>
      ) : (
        <ol className="flex flex-col divide-y divide-line border border-line rounded-xl">
          {contoh.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
              <span className="w-5 text-[11px] text-ink-muted tabular-nums">{i + 1}.</span>
              <span className="flex-1">{c.teks}</span>
              {bisaUbah && (
                <span className="flex items-center gap-0.5 text-ink-muted">
                  <button type="button" aria-label="Naikkan" disabled={i === 0} onClick={() => jalankan(data.geserContoh(c.id, -1))} className="p-1 rounded hover:bg-surface disabled:opacity-30">
                    <ArrowUp size={14} />
                  </button>
                  <button type="button" aria-label="Turunkan" disabled={i === contoh.length - 1} onClick={() => jalankan(data.geserContoh(c.id, 1))} className="p-1 rounded hover:bg-surface disabled:opacity-30">
                    <ArrowDown size={14} />
                  </button>
                  <button type="button" aria-label="Hapus contoh" onClick={() => jalankan(data.hapusContoh(c.id))} className="p-1 rounded hover:bg-red-50 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {bisaUbah && (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const g = await data.tambahContoh(kode, teks);
            setGalat(g);
            if (!g) setTeks("");
          }}
        >
          <input value={teks} onChange={(e) => setTeks(e.target.value)} placeholder="mis. @smart gardu overload ampenan bulan ini" className={`${FIELD} flex-1 min-w-[220px]`} />
          <Tombol type="submit" ikon={<Plus size={15} />} disabled={!teks.trim()}>
            Tambah contoh
          </Tombol>
        </form>
      )}
      {galat && <p className="text-xs text-red-600">{galat}</p>}
    </div>
  );
}
