"use client";

import { useEffect, useState } from "react";
import { Combine, Pencil, Scissors, TriangleAlert } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { km } from "@/app/admin/jtm/_lib/tampilan";
import { INPUT } from "../_ui";

/**
 * Satu segmen di panel Section + suntingannya (X3): Pecah (di peta), Gabung
 * dengan segmen lain di section yang sama, Ubah nama. Penjaga "tetap satu
 * section", bersebelahan, dan nama unik ada di database — pesannya diteruskan.
 */

export interface SegmenDi { segmen_id: string; segmen_nama: string; jumlah_isi: number }

interface HasilGabung {
  hulu: { id: string; nama: string };
  hilir: { id: string; nama: string };
  nama: string;
  jumlah_tiang: number;
  panjang_km: number;
  galat: string[];
}

interface Props {
  x: SegmenDi;
  lintas: boolean;
  /** Segmen lain di section ini — calon pasangan Gabung. */
  lain: SegmenDi[];
  boleh: boolean;
  oleh: string;
  onPecah: () => void;
  onBerubah: () => void;
}

const TOMBOL = "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-gray-400 hover:text-white hover:bg-white/5";
const TOMBOL_UTAMA = "rounded-lg bg-linear-to-r from-[#004D40] to-[#00897B] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40";

export default function BarisSegmenSection({ x, lintas, lain, boleh, oleh, onPecah, onBerubah }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<"nama" | "gabung" | null>(null);
  const [nama, setNama] = useState(x.segmen_nama);
  const [pasangan, setPasangan] = useState("");
  const [gabung, setGabung] = useState<HasilGabung | null>(null);
  const [namaGabung, setNamaGabung] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // Pratinjau gabung begitu pasangannya dipilih.
  useEffect(() => {
    if (mode !== "gabung" || !pasangan) return;
    let hidup = true;
    void supabaseBrowser
      .rpc("gabung_segmen_section", { p_a: x.segmen_id, p_b: pasangan, p_nama: null, p_oleh: oleh, p_uji: true })
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error) return toast.error(error.message);
        const h = data as HasilGabung;
        setGabung(h);
        setNamaGabung(h.nama);
      });
    return () => { hidup = false; };
  }, [mode, pasangan, x.segmen_id, oleh, toast]);

  const simpanNama = async () => {
    setSibuk(true);
    const { error } = await supabaseBrowser.rpc("ubah_nama_segmen", { p_segmen_id: x.segmen_id, p_nama: nama, p_oleh: oleh });
    setSibuk(false);
    if (error) return toast.error(error.message);
    toast.success("Nama segmen diubah.");
    setMode(null);
    onBerubah();
  };

  const terapkanGabung = async () => {
    setSibuk(true);
    const { error } = await supabaseBrowser.rpc("gabung_segmen_section", {
      p_a: x.segmen_id, p_b: pasangan, p_nama: namaGabung, p_oleh: oleh, p_uji: false,
    });
    setSibuk(false);
    if (error) return toast.error(error.message);
    toast.success(`Digabung menjadi ${namaGabung.toUpperCase()}.`);
    setMode(null);
    onBerubah();
  };

  return (
    <li className="space-y-1">
      <div className="flex gap-2">
        <span className="flex-1 min-w-0 break-words">
          {x.segmen_nama}
          {lintas && (
            <span className="flex items-center gap-1 text-[11px] text-amber-300">
              <TriangleAlert size={11} /> isinya juga di section lain — pecah di keypoint-nya
            </span>
          )}
        </span>
        <span className="tabular-nums text-gray-400 shrink-0">{x.jumlah_isi} tiang</span>
      </div>
      {boleh && (
        <div className="flex flex-wrap gap-1">
          <button className={TOMBOL} onClick={onPecah}><Scissors size={11} /> Pecah</button>
          {lain.length > 0 && (
            <button className={TOMBOL} onClick={() => setMode(mode === "gabung" ? null : "gabung")}><Combine size={11} /> Gabung</button>
          )}
          <button className={TOMBOL} onClick={() => { setNama(x.segmen_nama); setMode(mode === "nama" ? null : "nama"); }}>
            <Pencil size={11} /> Ubah nama
          </button>
        </div>
      )}

      {mode === "nama" && (
        <div className="flex gap-1.5">
          <input className={INPUT} value={nama} onChange={(e) => setNama(e.target.value)} autoFocus />
          <button className={TOMBOL_UTAMA} disabled={sibuk || !nama.trim()} onClick={() => void simpanNama()}>Simpan</button>
        </div>
      )}

      {mode === "gabung" && (
        <div className="space-y-1.5 rounded-lg bg-white/5 p-2">
          <select className={INPUT} value={pasangan} onChange={(e) => { setGabung(null); setPasangan(e.target.value); }}>
            <option value="">Gabung dengan…</option>
            {lain.map((s) => <option key={s.segmen_id} value={s.segmen_id}>{s.segmen_nama}</option>)}
          </select>
          {pasangan && !gabung && <p className="text-[11px] text-gray-400">Memeriksa…</p>}
          {gabung && (
            <>
              <p className="text-[11px] text-gray-400">
                Dipertahankan: <span className="text-gray-200">{gabung.hulu.nama}</span> (hulu) · {gabung.jumlah_tiang} tiang · {km(gabung.panjang_km, 3)}
              </p>
              <input className={INPUT} value={namaGabung} onChange={(e) => setNamaGabung(e.target.value)} />
              {gabung.galat.map((g) => (
                <p key={g} className="flex gap-1.5 text-[11px] text-amber-300"><TriangleAlert size={12} className="mt-0.5 shrink-0" /> {g}</p>
              ))}
              <button
                className={`${TOMBOL_UTAMA} w-full`}
                disabled={sibuk || gabung.galat.length > 0 || !namaGabung.trim()}
                onClick={() => void terapkanGabung()}
              >
                {sibuk ? "Menyimpan…" : "Gabungkan"}
              </button>
            </>
          )}
        </div>
      )}
    </li>
  );
}
