"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { CARD, FIELD } from "@/app/admin/_ui";
import Tombol from "@/app/admin/_kit/Tombol";
import CatatanInfo from "@/app/admin/_kit/CatatanInfo";
import { KotakCari } from "@/app/admin/_kit/Field";
import type { KamusWa, TanyaWa } from "../_hooks/useTanyaWa";

/**
 * Kamus singkatan: ketikan di WA → bentuk baku yang dibaca bot, sebelum kata
 * kunci dinilai ("ckr" → "cakranegara", "trafo" → "gardu").
 */

interface Props {
  data: TanyaWa;
  bisaUbah: boolean;
}

export default function TabKamus({ data, bisaUbah }: Props) {
  const [cari, setCari] = useState("");
  const [dari, setDari] = useState("");
  const [jadi, setJadi] = useState("");
  const [ubah, setUbah] = useState<KamusWa | null>(null);
  const [galat, setGalat] = useState<string | null>(null);

  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return q ? data.kamus.filter((k) => k.dari.includes(q) || k.jadi.includes(q)) : data.kamus;
  }, [data.kamus, cari]);

  async function tambah() {
    const g = await data.simpanKamus(null, dari, jadi);
    setGalat(g);
    if (!g) {
      setDari("");
      setJadi("");
    }
  }

  async function simpanUbah() {
    if (!ubah) return;
    const g = await data.simpanKamus(ubah.id, ubah.dari, ubah.jadi);
    setGalat(g);
    if (!g) setUbah(null);
  }

  return (
    <div className="flex flex-col gap-3 max-w-3xl">
      <div className="flex flex-wrap items-center gap-2">
        <KotakCari nilai={cari} onUbah={setCari} placeholder="Cari singkatan atau artinya" />
      </div>

      {bisaUbah && (
        <form
          className={`${CARD} p-3 flex flex-wrap items-center gap-2`}
          onSubmit={(e) => {
            e.preventDefault();
            void tambah();
          }}
        >
          <input value={dari} onChange={(e) => setDari(e.target.value)} placeholder="Ketikan di WA, mis. ckr" className={`${FIELD} flex-1 min-w-[160px]`} />
          <ArrowRight size={16} className="text-ink-muted" />
          <input value={jadi} onChange={(e) => setJadi(e.target.value)} placeholder="Dibaca sebagai, mis. cakranegara" className={`${FIELD} flex-1 min-w-[160px]`} />
          <Tombol type="submit" ragam="utama" ikon={<Plus size={15} />} disabled={!dari.trim() || !jadi.trim()}>
            Tambah
          </Tombol>
        </form>
      )}
      {galat && <p className="text-xs text-red-600">{galat}</p>}

      <div className={`${CARD} overflow-hidden`}>
        <table className="w-full text-[13px]">
          <thead className="kepala-kit">
            <tr className="text-left text-xs font-semibold text-ink-soft">
              <th className="px-4 py-2.5">Ketikan di WA</th>
              <th className="px-4 py-2.5">Dibaca sebagai</th>
              {bisaUbah && <th className="px-4 py-2.5 w-24" />}
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-ink-muted">
                  {cari ? "Tidak ada yang cocok." : "Kamus masih kosong."}
                </td>
              </tr>
            )}
            {baris.map((k) =>
              ubah?.id === k.id ? (
                <tr key={k.id} className="border-t border-line bg-brand-50/40">
                  <td className="px-3 py-2">
                    <input autoFocus value={ubah.dari} onChange={(e) => setUbah({ ...ubah, dari: e.target.value })} className={`${FIELD} w-full`} />
                  </td>
                  <td className="px-3 py-2">
                    <input value={ubah.jadi} onChange={(e) => setUbah({ ...ubah, jadi: e.target.value })} onKeyDown={(e) => e.key === "Enter" && simpanUbah()} className={`${FIELD} w-full`} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex gap-1 justify-end">
                      <button type="button" aria-label="Simpan" onClick={simpanUbah} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50">
                        <Check size={15} />
                      </button>
                      <button type="button" aria-label="Batal" onClick={() => setUbah(null)} className="p-1.5 rounded-lg text-ink-muted hover:bg-surface">
                        <X size={15} />
                      </button>
                    </span>
                  </td>
                </tr>
              ) : (
                <tr key={k.id} className="border-t border-line hover:bg-surface/60">
                  <td className="px-4 py-2.5 font-medium">{k.dari}</td>
                  <td className="px-4 py-2.5 text-ink-soft">{k.jadi}</td>
                  {bisaUbah && (
                    <td className="px-3 py-2">
                      <span className="flex gap-1 justify-end text-ink-muted">
                        <button type="button" aria-label="Ubah" onClick={() => setUbah(k)} className="p-1.5 rounded-lg hover:bg-surface hover:text-ink">
                          <Pencil size={14} />
                        </button>
                        <button type="button" aria-label="Hapus" onClick={async () => setGalat(await data.hapusKamus(k.id))} className="p-1.5 rounded-lg hover:bg-red-50 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      </span>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>

      <CatatanInfo>
        Kamus dipakai sebelum kata kunci dinilai, untuk ULP, waktu, dan kata lain. Satu ketikan hanya punya satu arti. Frasa juga
        boleh, mis. &quot;bln lalu&quot; → &quot;bulan lalu&quot;.
      </CatatanInfo>
    </div>
  );
}
