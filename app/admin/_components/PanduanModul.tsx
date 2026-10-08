"use client";

import { useMemo, useState } from "react";
import { BookOpen, Loader2, Pencil, Plus, Search } from "lucide-react";
import { BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useToast } from "@/app/admin/_components/Toast";
import { usePanduan, type ItemPanduan } from "@/app/admin/_hooks/usePanduan";
import FormPanduan from "./FormPanduan";

/**
 * Halaman Panduan satu modul: istilah, maksudnya, kapan dipakai — semacam FAQ
 * (permintaan user 8 Okt 2026: "saya juga sering lupa jika ditanya tim").
 * Isinya sama dengan halaman Panduan di HP; disunting di sini oleh UP3/admin.
 */

interface Props {
  modul: string;
  oleh: string;
  bolehUbah: boolean;
}

export default function PanduanModul({ modul, oleh, bolehUbah }: Props) {
  const toast = useToast();
  const { daftar, galat, simpan, hapus } = usePanduan(modul);
  const [cari, setCari] = useState("");
  const [form, setForm] = useState<{ awal: ItemPanduan | null } | null>(null);

  const kelompok = useMemo(() => {
    const q = cari.trim().toLowerCase();
    const m = new Map<string, ItemPanduan[]>();
    for (const x of daftar ?? []) {
      if (!bolehUbah && !x.aktif) continue;
      if (q && ![x.istilah, x.maksud, x.kapan, x.contoh].some((t) => t?.toLowerCase().includes(q))) continue;
      m.set(x.kelompok, [...(m.get(x.kelompok) ?? []), x]);
    }
    return [...m.entries()];
  }, [daftar, cari, bolehUbah]);

  const namaKelompok = useMemo(() => [...new Set((daftar ?? []).map((x) => x.kelompok))], [daftar]);
  const urutanBaru = Math.max(0, ...(daftar ?? []).map((x) => x.urutan)) + 10;

  if (galat) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Panduan gagal dimuat: {galat}
        {/relation .*panduan.* does not exist|schema cache/i.test(galat) && " — jalankan dulu scripts/panduan.sql."}
      </div>
    );
  }
  if (!daftar) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat panduan…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input
            id="panduan-cari"
            value={cari}
            onChange={(e) => setCari(e.target.value)}
            placeholder="Cari istilah, mis. menumpang, underbuild, C2-2"
            className={`${FIELD} w-full pl-9`}
          />
        </div>
        <p className="text-xs text-ink-soft">Tampil juga di HP: tombol Panduan di samping judul Inspeksi JTR.</p>
        {bolehUbah && (
          <button onClick={() => setForm({ awal: null })} className={`${BTN_PRIMARY} ml-auto`}>
            <Plus size={15} /> Tambah istilah
          </button>
        )}
      </div>

      {kelompok.length === 0 && (
        <div className={`${CARD} p-8 text-center text-sm text-ink-soft`}>
          {cari ? `Tidak ada istilah yang cocok dengan "${cari}".` : "Belum ada isi panduan."}
        </div>
      )}

      {kelompok.map(([nama, isi]) => (
        <section key={nama} className="space-y-2">
          <h3 className={EYEBROW}>{nama}</h3>
          <div className={`${CARD} divide-y divide-line`}>
            {isi.map((x) => (
              <article key={x.id} className={`px-5 py-4 flex gap-3 ${x.aktif ? "" : "opacity-50"}`}>
                <BookOpen size={16} className="text-navy-500 mt-1 shrink-0" />
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="font-semibold text-ink">
                    {x.istilah}
                    {!x.aktif && <span className="ml-2 text-[11px] font-normal text-ink-muted">(disembunyikan)</span>}
                  </h4>
                  <p className="text-sm text-ink leading-relaxed">{x.maksud}</p>
                  {x.kapan && (
                    <p className="text-sm text-ink-soft leading-relaxed">
                      <span className="font-semibold text-ink">Kapan dipakai: </span>{x.kapan}
                    </p>
                  )}
                  {x.contoh && (
                    <p className="text-sm text-ink-soft">
                      <span className="font-semibold text-ink">Contoh: </span>
                      <span className="font-mono text-[13px]">{x.contoh}</span>
                    </p>
                  )}
                </div>
                {bolehUbah && (
                  <button onClick={() => setForm({ awal: x })} className="self-start p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-surface" aria-label={`Ubah ${x.istilah}`}>
                    <Pencil size={15} />
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      ))}

      {form && (
        <FormPanduan
          awal={form.awal}
          kelompokAda={namaKelompok}
          urutanBaru={urutanBaru}
          onSimpan={async (isi) => {
            const g = await simpan(isi, oleh, form.awal?.id);
            if (!g) toast.success(`"${isi.istilah.trim()}" tersimpan.`);
            return g;
          }}
          onHapus={
            form.awal
              ? async () => {
                  const g = await hapus(form.awal!.id);
                  if (!g) toast.success(`"${form.awal!.istilah}" dihapus.`);
                  return g;
                }
              : undefined
          }
          onTutup={() => setForm(null)}
        />
      )}
    </div>
  );
}
