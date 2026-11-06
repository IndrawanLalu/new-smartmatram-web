"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import Tombol from "@/app/admin/_kit/Tombol";
import { useToast } from "@/app/admin/_components/Toast";
import type { HasilPrediksi } from "@/lib/prediksiGangguan/hitung";
import type { AsalPenyulang } from "@/lib/prediksiGangguan/penyulangTrip";

interface Props {
  kunci: string;
  /** Nama penyulang di laporan. */
  penyulangLaporan: string;
  hasil: HasilPrediksi;
  bolehIsi: boolean;
  onTersimpan: () => void;
}

const ASAL: Record<AsalPenyulang, string> = {
  koreksi: "dikoreksi di web",
  alias: "nama laporan disamakan",
  langsung: "nama sama dengan data JTM",
  outlet: "outlet Gardu Hubung dari keypoint",
  tidak: "belum ketemu di data JTM",
};
const INPUT = "h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15";

/**
 * Penyulang yang trip — jaringan tempat prediksi dihitung. Bisa dikoreksi
 * UP3/admin: nama laporan beda dari data JTM (OL. SHERATON sudah dititik
 * dengan nama lain), atau outlet GH yang belum dikenali.
 */
export default function KoreksiPenyulang({ kunci, penyulangLaporan, hasil, bolehIsi, onTersimpan }: Props) {
  const toast = useToast();
  const [buka, setBuka] = useState(false);
  const [daftar, setDaftar] = useState<string[] | null>(null);
  const [penyulang, setPenyulang] = useState(hasil.penyulangJtm ?? "");
  const [keypoint, setKeypoint] = useState(hasil.alat.kode ? hasil.alat.nama : "");
  const [samakan, setSamakan] = useState(false);
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    if (!buka || daftar) return;
    fetch(`/api/prediksi-lokasi/koreksi?kunci=${encodeURIComponent(kunci)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
        setDaftar(j.penyulang);
      })
      .catch((e: Error) => { setDaftar([]); setGalat(e.message); });
  }, [buka, daftar, kunci]);

  const kirim = async (cara: "POST" | "DELETE") => {
    setSibuk(true);
    try {
      const r = cara === "POST"
        ? await fetch("/api/prediksi-lokasi/koreksi", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kunci, penyulang, keypoint, samakanNama: samakan }),
          })
        : await fetch(`/api/prediksi-lokasi/koreksi?kunci=${encodeURIComponent(kunci)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
      toast.success(cara === "POST" ? `Dihitung ulang di jaringan ${penyulang}.` : "Koreksi dihapus — penyulang ditentukan otomatis lagi.");
      setBuka(false);
      onTersimpan();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="rounded-xl border border-line px-3 py-2 text-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-ink-muted">Dihitung di jaringan</span>
        <span className="font-semibold text-ink">{hasil.penyulangJtm ?? "–"}</span>
        {hasil.gh && <span className="text-ink-soft">keluaran {hasil.gh}</span>}
        <span className="text-ink-muted">· {ASAL[hasil.asalPenyulang]}</span>
        <span className="flex-1" />
        {bolehIsi && !buka && (
          <Tombol ukuran="sm" ragam="hantu" ikon={<Pencil size={13} />} onClick={() => setBuka(true)}>Koreksi penyulang yang trip</Tombol>
        )}
      </div>

      {buka && (
        <div className="space-y-2 border-t border-line pt-2">
          <div className="grid sm:grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-ink-soft">
              Penyulang di data JTM
              <select value={penyulang} onChange={(e) => setPenyulang(e.target.value)} className={INPUT} disabled={!daftar}>
                <option value="">{daftar ? "Pilih penyulang…" : "Memuat…"}</option>
                {daftar?.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-ink-soft">
              Peralatan yang trip (kosong = dari pangkal penyulang)
              <input value={keypoint} onChange={(e) => setKeypoint(e.target.value)} placeholder="mis. REC. ALANG-ALANG" className={INPUT} />
            </label>
          </div>
          {galat && <p className="text-red-700">Daftar penyulang gagal dimuat: {galat}</p>}
          <label className="flex items-center gap-2 text-ink-soft">
            <input type="checkbox" checked={samakan} onChange={(e) => setSamakan(e.target.checked)} />
            Samakan nama: semua laporan &quot;{penyulangLaporan}&quot; dihitung di penyulang ini
          </label>
          <p className="text-[11px] text-ink-muted">
            Jangan samakan nama penyulang yang masuk Gardu Hubung (mis. MVTIC TIGA GILI) — outletnya lebih dari satu;
            koreksi per gangguan saja.
          </p>
          <div className="flex flex-wrap gap-2 justify-end">
            {hasil.asalPenyulang === "koreksi" && (
              <Tombol ukuran="sm" onClick={() => void kirim("DELETE")} disabled={sibuk}>Hapus koreksi</Tombol>
            )}
            <Tombol ukuran="sm" ragam="hantu" onClick={() => setBuka(false)} disabled={sibuk}>Batal</Tombol>
            <Tombol ukuran="sm" ragam="utama" onClick={() => void kirim("POST")} disabled={sibuk || !penyulang}>Simpan & hitung ulang</Tombol>
          </div>
        </div>
      )}
    </div>
  );
}
