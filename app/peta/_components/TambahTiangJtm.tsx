"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { jarakMeter } from "@/lib/geo";
import { INPUT } from "../_ui";
import { TOMBOL_PANEL } from "./InfoTiang";

/**
 * Tambah tiang JTM yang lolos dititik (T2, `tambah_tiang_meja_jtm`). Letaknya
 * = lingkaran hijau yang diseret (penggeser yang sama dengan Geser titik).
 *   • Lanjutan / cabang dari tiang ini — nama dari mesin yang sama dengan HP.
 *   • Sisipkan sebelum anaknya — nama tiang ini + huruf (GNS-018a); anaknya
 *     pindah menyambung dari tiang baru.
 */

interface Anak { id: string; kode: string; lat: number; lng: number }

export interface IsiTambah {
  anakId: string | null;
  batangBeda: boolean;
  alasan: string;
}

interface Props {
  induk: { id: string; kode: string; lat: number; lng: number };
  posisi: { lat: number; lng: number };
  onPosisi: (lat: number, lng: number) => void;
  onBatal: () => void;
  /** Mengembalikan pesan galat, atau null bila berhasil. */
  onSimpan: (isi: IsiTambah) => Promise<string | null>;
}

export default function TambahTiangJtm({ induk, posisi, onPosisi, onBatal, onSimpan }: Props) {
  const [anak, setAnak] = useState<Anak[]>([]);
  const [anakId, setAnakId] = useState<string | null>(null);
  const [alasan, setAlasan] = useState("");
  const [batangBeda, setBatangBeda] = useState(false);
  const [tanyaBeda, setTanyaBeda] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  // Anak = yang menyambung dari tiang ini di batang ATAU di salah satu penyulangnya.
  useEffect(() => {
    let hidup = true;
    void (async () => {
      const [{ data: batang }, { data: kp }] = await Promise.all([
        supabaseBrowser.from("tiang").select("id,kode,lat,lng").eq("induk_id", induk.id).eq("status_hidup", "aktif").is("gardu_kode", null),
        supabaseBrowser.from("tiang_kode_penyulang").select("tiang_id").eq("induk_id", induk.id),
      ]);
      const lain = ((kp ?? []) as { tiang_id: string }[]).map((x) => x.tiang_id).filter((id) => !(batang ?? []).some((b) => b.id === id));
      const { data: tambahan } = lain.length
        ? await supabaseBrowser.from("tiang").select("id,kode,lat,lng").in("id", lain).eq("status_hidup", "aktif")
        : { data: [] };
      if (hidup) setAnak([...((batang ?? []) as Anak[]), ...((tambahan ?? []) as Anak[])].filter((a) => a.lat !== null));
    })();
    return () => { hidup = false; };
  }, [induk.id]);

  const pilihAnak = (id: string | null) => {
    setAnakId(id);
    const a = anak.find((x) => x.id === id);
    if (a) onPosisi((induk.lat + a.lat) / 2, (induk.lng + a.lng) / 2);
  };

  const simpan = async () => {
    setSibuk(true);
    setGalat(null);
    const g = await onSimpan({ anakId, batangBeda, alasan: alasan.trim() });
    setSibuk(false);
    if (g) {
      setGalat(g);
      if (/sudah berdiri/.test(g)) setTanyaBeda(true);
    }
  };

  const jarak = Math.round(jarakMeter(induk.lat, induk.lng, posisi.lat, posisi.lng));
  const kodeAnak = anak.find((a) => a.id === anakId)?.kode;

  return (
    <div className="rounded-lg border border-[#00897B] p-3 space-y-2 text-xs text-[#e2e8f0]">
      <p>
        Seret lingkaran hijau ke letak tiang yang terlewat.
        <span className="block text-[#5eead4] font-semibold mt-1">{jarak} m dari {induk.kode}</span>
      </p>
      <label className="block space-y-1">
        <span className="text-gray-400">Letak</span>
        <select value={anakId ?? ""} onChange={(e) => pilihAnak(e.target.value || null)} className={INPUT}>
          <option value="">Lanjutan / cabang dari {induk.kode}</option>
          {anak.map((a) => (
            <option key={a.id} value={a.id}>Sisipkan di antara {induk.kode} → {a.kode}</option>
          ))}
        </select>
      </label>
      <p className="text-gray-400">
        {kodeAnak
          ? `Nama: ${induk.kode} + huruf (mis. ${induk.kode}a); ${kodeAnak} menyambung dari tiang baru.`
          : "Nama mengikuti aturan penamaan seperti dari HP (lanjut nomor / cabang R-L)."}
      </p>
      <input value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="Alasan — wajib, mis. tiang terlewat saat penyapuan" className={INPUT} />
      {tanyaBeda && (
        <label className="flex items-start gap-2 text-amber-200">
          <input type="checkbox" checked={batangBeda} onChange={(e) => setBatangBeda(e.target.checked)} className="mt-0.5" />
          Batang berbeda — memang dua tiang di tempat yang berdekatan
        </label>
      )}
      {galat && <p className="text-red-300">{galat}</p>}
      <div className="flex gap-2">
        <button
          onClick={() => void simpan()}
          disabled={sibuk || !alasan.trim() || jarak < 1}
          className={`${TOMBOL_PANEL} border-[#00897B] text-[#5eead4]`}
        >
          {sibuk ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Simpan tiang
        </button>
        <button onClick={onBatal} disabled={sibuk} className={TOMBOL_PANEL}>Batal</button>
      </div>
    </div>
  );
}
