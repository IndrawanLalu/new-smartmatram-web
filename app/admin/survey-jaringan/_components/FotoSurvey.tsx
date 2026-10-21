"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { EYEBROW } from "@/app/admin/_ui";
import { fotoKecil } from "@/lib/fotoKecil";
import { perkecilFoto } from "@/lib/gambarSurvey/latar";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { SurveyJaringan } from "@/lib/surveyJaringan";

/**
 * Foto kondisi lapangan satu survey (di bawah tabel material). Foto
 * diperkecil di peramban (1600 px) lalu disimpan di bucket `inspections`
 * folder survey/<id>/; 4 pertama ikut gambar survey PDF.
 */

const MAKS = 8;

interface Props {
  s: SurveyJaringan;
  boleh: boolean;
  onUbah: (foto: string[]) => Promise<void>;
}

export default function FotoSurvey({ s, boleh, onUbah }: Props) {
  const toast = useToast();
  const masukan = useRef<HTMLInputElement>(null);
  const [sibuk, setSibuk] = useState(false);

  const unggah = async (berkas: FileList) => {
    const daftar = [...berkas].slice(0, MAKS - s.foto.length);
    if (!daftar.length) return;
    setSibuk(true);
    try {
      const url = await Promise.all(
        daftar.map(async (f, i) => {
          const jalur = `survey/${s.id}/${Date.now()}-${i}.jpg`;
          const { error } = await supabaseBrowser.storage.from("inspections").upload(jalur, await perkecilFoto(f, 1600), { contentType: "image/jpeg" });
          if (error) throw error;
          return supabaseBrowser.storage.from("inspections").getPublicUrl(jalur).data.publicUrl;
        }),
      );
      await onUbah([...s.foto, ...url]);
      toast.success(`${url.length} foto ditambahkan.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSibuk(false);
      if (masukan.current) masukan.current.value = "";
    }
  };

  const hapus = async (u: string) => {
    setSibuk(true);
    try {
      await onUbah(s.foto.filter((x) => x !== u));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <section className="space-y-1.5">
      <p className={EYEBROW}>Foto kondisi lapangan ({s.foto.length}/{MAKS}) — 4 pertama ikut gambar survey</p>
      <div className="flex flex-wrap gap-2">
        {s.foto.map((u) => (
          <div key={u} className="relative">
            <a href={u} target="_blank" rel="noopener">
              {/* Gambar mini lewat pengecil Next.js (lib/fotoKecil). */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fotoKecil(u, 120)} alt="Foto kondisi lapangan" className="h-20 w-28 object-cover rounded-lg border border-line" />
            </a>
            {boleh && (
              <button
                disabled={sibuk} onClick={() => void hapus(u)} title="Hapus foto"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full bg-red-600 text-white shadow"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {boleh && s.foto.length < MAKS && (
          <button
            disabled={sibuk} onClick={() => masukan.current?.click()}
            className="h-20 w-28 grid place-items-center rounded-lg border-2 border-dashed border-line text-ink-soft hover:border-navy-300 hover:text-navy-600"
          >
            {sibuk ? <Loader2 size={18} className="animate-spin" /> : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus size={18} /> Tambah foto</span>}
          </button>
        )}
        {!boleh && s.foto.length === 0 && <p className="text-sm text-ink-muted">Belum ada foto.</p>}
      </div>
      <input ref={masukan} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void unggah(e.target.files)} />
    </section>
  );
}
