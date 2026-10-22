"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, MapPinned, X } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { EYEBROW } from "@/app/admin/_ui";
import { fotoKecil } from "@/lib/fotoKecil";
import { perkecilFoto } from "@/lib/gambarSurvey/latar";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { SARAN_KET_FOTO, type FotoSurvey as Foto, type SurveyJaringan } from "@/lib/surveyJaringan";
import EditorFotoSurvey from "./EditorFotoSurvey";

/**
 * Foto kondisi lapangan satu survey (di bawah tabel material). Foto
 * diperkecil di peramban (1600 px) lalu disimpan di bucket `inspections`
 * folder survey/<id>/; 4 pertama ikut gambar survey PDF beserta keterangan
 * dan simbol yang ditempel (EditorFotoSurvey).
 */

const MAKS = 8;

interface Props {
  s: SurveyJaringan;
  boleh: boolean;
  onUbah: (foto: Foto[]) => Promise<void>;
}

export default function FotoSurvey({ s, boleh, onUbah }: Props) {
  const toast = useToast();
  const masukan = useRef<HTMLInputElement>(null);
  const [sibuk, setSibuk] = useState(false);
  const [sunting, setSunting] = useState<number | null>(null);
  /** Keterangan yang sedang diketik — disimpan saat kotaknya ditinggalkan. */
  const [ket, setKet] = useState<Record<string, string>>({});

  const simpan = async (foto: Foto[], pesan = "") => {
    setSibuk(true);
    try {
      await onUbah(foto);
      if (pesan) toast.success(pesan);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSibuk(false);
    }
  };

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
      await simpan([...s.foto, ...url.map((u) => ({ url: u, ket: "", tanda: [] }))], `${url.length} foto ditambahkan.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSibuk(false);
      if (masukan.current) masukan.current.value = "";
    }
  };

  const simpanKet = (i: number) => {
    const f = s.foto[i];
    const baru = (ket[f.url] ?? f.ket).trim();
    if (baru === f.ket) return;
    void simpan(s.foto.map((x, k) => (k === i ? { ...x, ket: baru } : x)));
  };

  return (
    <section className="space-y-1.5">
      <p className={EYEBROW}>Foto kondisi lapangan ({s.foto.length}/{MAKS}) — 4 pertama ikut gambar survey</p>
      <datalist id="saran-ket-foto-daftar">{SARAN_KET_FOTO.map((k) => <option key={k} value={k} />)}</datalist>
      <div className="flex flex-wrap gap-3">
        {s.foto.map((f, i) => (
          <div key={f.url} className="w-36 space-y-1">
            <div className="relative">
              {/* Bisa mengubah: klik = penyunting tanda; tidak: buka fotonya. */}
              <a
                href={f.url} target="_blank" rel="noopener" title={boleh ? "Tandai foto" : "Buka foto"} className="block"
                onClick={(e) => { if (boleh) { e.preventDefault(); setSunting(i); } }}
              >
                {/* Gambar mini lewat pengecil Next.js (lib/fotoKecil). */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotoKecil(f.url, 160)} alt={f.ket || `Foto ${i + 1}`} className="h-24 w-36 object-cover rounded-lg border border-line" />
              </a>
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 text-[10px] font-semibold text-white">
                {i + 1}{f.tanda.length ? ` · ${f.tanda.length} tanda` : ""}
              </span>
              {boleh && (
                <button
                  disabled={sibuk} onClick={() => void simpan(s.foto.filter((_, k) => k !== i))} title="Hapus foto"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 grid place-items-center rounded-full bg-red-600 text-white shadow"
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {boleh ? (
              <>
                <input
                  value={ket[f.url] ?? f.ket} list="saran-ket-foto-daftar" placeholder="Keterangan foto"
                  onChange={(e) => setKet((k) => ({ ...k, [f.url]: e.target.value }))}
                  onBlur={() => simpanKet(i)}
                  className="w-full rounded-lg border border-line px-2 py-1 text-xs focus:outline-none focus:border-navy-500"
                />
                <button onClick={() => setSunting(i)} className="inline-flex items-center gap-1 text-xs font-semibold text-navy-600 hover:underline">
                  <MapPinned size={12} /> Tandai di foto
                </button>
              </>
            ) : (
              <p className="text-xs text-ink-soft">{f.ket || "—"}</p>
            )}
          </div>
        ))}
        {boleh && s.foto.length < MAKS && (
          <button
            disabled={sibuk} onClick={() => masukan.current?.click()}
            className="h-24 w-36 grid place-items-center rounded-lg border-2 border-dashed border-line text-ink-soft hover:border-navy-300 hover:text-navy-600"
          >
            {sibuk ? <Loader2 size={18} className="animate-spin" /> : <span className="flex flex-col items-center gap-1 text-xs"><ImagePlus size={18} /> Tambah foto</span>}
          </button>
        )}
        {!boleh && s.foto.length === 0 && <p className="text-sm text-ink-muted">Belum ada foto.</p>}
      </div>
      <input ref={masukan} type="file" accept="image/*" multiple hidden onChange={(e) => e.target.files && void unggah(e.target.files)} />

      {sunting !== null && s.foto[sunting] && boleh && (
        <EditorFotoSurvey
          foto={s.foto[sunting]}
          nomor={sunting + 1}
          onTutup={() => setSunting(null)}
          onSimpan={(k, tanda) => simpan(s.foto.map((x, i) => (i === sunting ? { ...x, ket: k, tanda } : x)), "Foto disimpan.")}
        />
      )}
    </section>
  );
}
