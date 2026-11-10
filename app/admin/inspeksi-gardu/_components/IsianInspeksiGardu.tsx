"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { EYEBROW } from "@/app/admin/_ui";
import { fotoKecil } from "@/lib/fotoKecil";
import type { ItemIsian, JawabanIsian } from "../_hooks/useIsianIgardu";

/**
 * Isian lengkap Tier 1 di rincian inspeksi (inspeksi-gardu-isian.sql),
 * dikelompokkan per bagian. Jawaban tidak normal diberi warna — temuannya
 * sendiri tampil di daftar Temuan di bawahnya.
 */

interface Props {
  id: string;
  katalog: ItemIsian[];
  jawabanDari: (id: string) => Promise<JawabanIsian[]>;
}

const JURUSAN = ["1", "2", "3", "4"];

export default function IsianInspeksiGardu({ id, katalog, jawabanDari }: Props) {
  const [jawaban, setJawaban] = useState<JawabanIsian[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    let hidup = true;
    jawabanDari(id).then(
      (j) => { if (hidup) setJawaban(j); },
      (e: Error) => { if (hidup) { setJawaban([]); setGalat(e.message); } },
    );
    return () => { hidup = false; };
  }, [id, jawabanDari]);

  if (jawaban === null) return <p className="text-xs text-ink-muted"><Loader2 size={12} className="inline animate-spin" /> Memuat isian…</p>;
  if (galat) return <p className="text-xs text-red-700">{galat}</p>;
  if (jawaban.length === 0) return null;

  const peta = new Map(jawaban.map((j) => [`${j.item}|${j.rincian}`, j]));
  const dipakai = katalog.filter((k) => jawaban.some((j) => j.item === k.kode));
  const bagian = [...new Set(dipakai.map((k) => k.bagian))];

  const nilai = (k: ItemIsian, j: JawabanIsian | undefined, satuan = true) => {
    if (!j) return { teks: "—", buruk: false };
    if (j.nilai) {
      const o = k.opsi.find((x) => x.kode === j.nilai);
      return { teks: o?.label ?? j.nilai, buruk: o ? !o.normal : false };
    }
    return { teks: j.angka === null ? "—" : `${j.angka.toLocaleString("id-ID")}${satuan && k.satuan ? ` ${k.satuan}` : ""}`, buruk: false };
  };

  return (
    <div>
      <p className={`${EYEBROW} mb-2`}>Isian inspeksi</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {bagian.map((bg) => (
          <div key={bg} className="rounded-xl border border-line p-3 text-xs flex flex-col gap-1.5">
            <p className="font-semibold text-ink text-sm">{bg}</p>
            {dipakai.filter((k) => k.bagian === bg).map((k) => {
              if (k.rincian.length === 0) {
                const j = peta.get(`${k.kode}|-`);
                const v = nilai(k, j);
                return (
                  <div key={k.kode} className="flex gap-2">
                    {j?.foto && (
                      <a href={j.foto} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- gambar mini (lib/fotoKecil) */}
                        <img src={fotoKecil(j.foto, 160)} alt={k.nama} className="w-14 h-14 object-cover rounded-lg border border-line" />
                      </a>
                    )}
                    <div>
                      <p className="text-ink-muted">{k.nama}</p>
                      <p className={`font-semibold ${v.buruk ? "text-attention" : "text-ink"}`}>{v.teks}</p>
                      {j?.catatan && <p className="text-ink-soft italic">{j.catatan}</p>}
                    </div>
                  </div>
                );
              }
              const baris = k.perJurusan ? JURUSAN.filter((jr) => k.rincian.some((r) => peta.has(`${k.kode}|${jr}:${r}`))) : [null];
              return (
                <div key={k.kode}>
                  <p className="text-ink-muted">{k.nama}{k.satuan ? ` (${k.satuan})` : ""}</p>
                  <table className="mt-0.5 tabular-nums">
                    <thead>
                      <tr className="text-[10px] text-ink-muted">
                        {k.perJurusan && <th className="pr-3 text-left font-normal">Jurusan</th>}
                        {k.rincian.map((r) => <th key={r} className="pr-3 text-right font-normal">{r}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {baris.map((jr) => (
                        <tr key={jr ?? "-"}>
                          {k.perJurusan && <td className="pr-3 font-semibold">{jr}</td>}
                          {k.rincian.map((r) => {
                            const v = nilai(k, peta.get(`${k.kode}|${jr ? `${jr}:` : ""}${r}`), false);
                            return <td key={r} className={`pr-3 text-right font-semibold ${v.buruk ? "text-attention" : "text-ink"}`}>{v.teks}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
