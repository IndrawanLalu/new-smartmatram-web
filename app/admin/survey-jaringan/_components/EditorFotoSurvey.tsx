"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Save, Trash2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { gambarTanda, kenaTanda, LABEL_TANDA, labelBawaan, muatFoto } from "@/lib/gambarSurvey/tandaFoto";
import { LABEL_JENIS_GARDU, SARAN_KET_FOTO, type FotoSurvey, type JenisGardu, type JenisTanda, type TandaFoto } from "@/lib/surveyJaringan";

/**
 * Menandai satu foto survey: pilih simbol (gardu baru cantol/portal, Tiang
 * JTM, Tiang JTR, teks) lalu klik KAKI tiangnya di foto; seret untuk memindah,
 * atur besarnya supaya pas dengan jarak di foto. Yang disimpan hanya letak
 * simbol — fotonya tidak diubah. Ikut gambar survey PDF.
 */

const LEBAR_MAKS = 860;
const ALAT: JenisTanda[] = ["gardu", "tiang_jtm", "tiang_jtr", "teks"];

interface Props {
  foto: FotoSurvey;
  nomor: number;
  onTutup: () => void;
  onSimpan: (ket: string, tanda: TandaFoto[]) => Promise<boolean>;
}

export default function EditorFotoSurvey({ foto, nomor, onTutup, onSimpan }: Props) {
  const kanvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [tanda, setTanda] = useState<TandaFoto[]>(foto.tanda);
  const [ket, setKet] = useState(foto.ket);
  const [alat, setAlat] = useState<JenisTanda | null>("gardu");
  const [pilih, setPilih] = useState<number | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const seret = useRef<number | null>(null);

  useEffect(() => {
    let hidup = true;
    muatFoto(foto.url).then((i) => hidup && setImg(i)).catch((e: Error) => hidup && setGalat(e.message));
    return () => { hidup = false; };
  }, [foto.url]);

  const w = img ? Math.min(LEBAR_MAKS, img.naturalWidth) : 0;
  const h = img ? Math.round((w * img.naturalHeight) / img.naturalWidth) : 0;

  useEffect(() => {
    const c = kanvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !img) return;
    ctx.drawImage(img, 0, 0, w, h);
    gambarTanda(ctx, tanda, w, h, pilih);
  }, [img, tanda, pilih, w, h]);

  const posisi = (e: React.PointerEvent) => {
    const r = kanvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * w, y: ((e.clientY - r.top) / r.height) * h };
  };

  const tekan = (e: React.PointerEvent) => {
    const p = posisi(e);
    const kena = kenaTanda(tanda, p.x, p.y, w, h);
    if (kena >= 0) {
      setPilih(kena);
      seret.current = kena;
      kanvas.current!.setPointerCapture(e.pointerId);
      return;
    }
    if (!alat) {
      setPilih(null);
      return;
    }
    const baru: TandaFoto = { jenis: alat, x: p.x / w, y: p.y / h, ...(alat === "gardu" ? { gardu: "cantol" as JenisGardu } : {}), ...(alat === "teks" ? { teks: ket || "Teks" } : {}) };
    setTanda((ts) => [...ts, baru]);
    setPilih(tanda.length);
  };

  const gerak = (e: React.PointerEvent) => {
    const i = seret.current;
    if (i === null) return;
    const p = posisi(e);
    const x = Math.min(1, Math.max(0, p.x / w));
    const y = Math.min(1, Math.max(0, p.y / h));
    setTanda((ts) => ts.map((t, k) => (k === i ? { ...t, x, y } : t)));
  };

  const ubah = (patch: Partial<TandaFoto>) => pilih !== null && setTanda((ts) => ts.map((t, k) => (k === pilih ? { ...t, ...patch } : t)));
  const terpilih = pilih !== null ? tanda[pilih] : undefined;

  const simpan = async () => {
    setSibuk(true);
    const ok = await onSimpan(ket.trim(), tanda);
    setSibuk(false);
    if (ok) onTutup();
  };

  return (
    <ModalShell
      title={`Foto ${nomor}`}
      subtitle="Pilih simbol lalu klik kaki tiangnya di foto · seret untuk memindah · klik simbol untuk memilih"
      maxWidth="max-w-4xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk || !img}>
            {sibuk ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Simpan
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-3">
        <label className="block space-y-1">
          <span className={EYEBROW}>Keterangan foto</span>
          <input value={ket} onChange={(e) => setKet(e.target.value)} list="saran-ket-foto" placeholder="mis. Lokasi gardu" className={`${FIELD} w-full`} />
          <datalist id="saran-ket-foto">{SARAN_KET_FOTO.map((k) => <option key={k} value={k} />)}</datalist>
        </label>

        <div className="flex flex-wrap items-center gap-1.5">
          {ALAT.map((a) => (
            <button
              key={a} onClick={() => setAlat(alat === a ? null : a)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${alat === a ? "bg-navy-600 border-navy-600 text-white" : "border-line text-ink-soft hover:bg-gray-50"}`}
            >
              {LABEL_TANDA[a]}
            </button>
          ))}
          <span className="text-xs text-ink-muted ml-1">{alat ? `Klik di foto untuk menaruh ${LABEL_TANDA[alat].toLowerCase()}.` : "Klik simbol untuk memilih / menyeret."}</span>
        </div>

        {galat && <p className="text-sm text-red-600">{galat}</p>}
        {!img && !galat && <p className="text-sm text-ink-soft flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Memuat foto…</p>}
        {img && (
          <canvas
            ref={kanvas} width={w} height={h}
            onPointerDown={tekan} onPointerMove={gerak} onPointerUp={() => { seret.current = null; }}
            className="w-full h-auto rounded-lg border border-line touch-none cursor-crosshair"
          />
        )}

        {terpilih && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
            <span className="text-xs font-semibold text-ink">{LABEL_TANDA[terpilih.jenis]}</span>
            <input
              value={terpilih.teks ?? labelBawaan(terpilih)}
              onChange={(e) => ubah({ teks: e.target.value })}
              placeholder="Tulisan (kosongkan untuk tanpa tulisan)"
              className={`${FIELD} flex-1 min-w-40`}
            />
            {terpilih.jenis === "gardu" && (
              <select value={terpilih.gardu ?? "cantol"} onChange={(e) => ubah({ gardu: e.target.value as JenisGardu })} className={FIELD}>
                {(Object.keys(LABEL_JENIS_GARDU) as JenisGardu[]).map((k) => <option key={k} value={k}>{LABEL_JENIS_GARDU[k]}</option>)}
              </select>
            )}
            {terpilih.jenis !== "teks" && (
              <label className="flex items-center gap-1.5 text-xs text-ink-soft">
                Besar
                <input
                  type="range" min={0.3} max={2.5} step={0.05} value={terpilih.skala ?? 1}
                  onChange={(e) => ubah({ skala: Number(e.target.value) })}
                  className="w-28 accent-navy-600"
                />
              </label>
            )}
            <button
              onClick={() => { setTanda((ts) => ts.filter((_, k) => k !== pilih)); setPilih(null); }}
              className={`${BTN_GHOST} text-red-600`}
            >
              <Trash2 size={14} /> Hapus
            </button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}
