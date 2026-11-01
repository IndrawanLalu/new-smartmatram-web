"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import Tombol from "@/app/admin/_kit/Tombol";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { useToast } from "@/app/admin/_components/Toast";
import type { BarisTemuan } from "@/lib/prediksiGangguan/temuan";

interface PilihanTiang { id: string; kode: string; km: number }

interface Props {
  kunci: string;
  penyulang: string;
  temuan: BarisTemuan | null;
  onTersimpan: (t: BarisTemuan | null) => void;
}

const INPUT = "h-9 rounded-xl border border-line bg-white px-3 text-sm text-ink focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15";

/** Isian tiang lokasi temuan (UP3/admin). Simpan → dinilai & menjadi kalibrasi sumber. */
export default function FormTemuan({ kunci, penyulang, temuan, onTersimpan }: Props) {
  const toast = useToast();
  const [tiang, setTiang] = useState<PilihanTiang[] | null>(null);
  const [galatTiang, setGalatTiang] = useState<string | null>(null);
  const [kode, setKode] = useState(temuan?.tiang_kode ?? "");
  const [catatan, setCatatan] = useState(temuan?.catatan ?? "");
  const [sibuk, setSibuk] = useState(false);
  const [tanyaHapus, setTanyaHapus] = useState(false);

  useEffect(() => {
    fetch(`/api/prediksi-lokasi/tiang?penyulang=${encodeURIComponent(penyulang)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
        setTiang(j.tiang);
      })
      .catch((e: Error) => setGalatTiang(e.message));
  }, [penyulang]);

  const pilihan = tiang?.find((t) => t.kode.toUpperCase() === kode.trim().toUpperCase()) ?? null;

  const kirim = async (cara: "POST" | "DELETE") => {
    setSibuk(true);
    try {
      const r = cara === "POST"
        ? await fetch("/api/prediksi-lokasi/temuan", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kunci, tiangId: pilihan?.id, catatan }),
          })
        : await fetch(`/api/prediksi-lokasi/temuan?kunci=${encodeURIComponent(kunci)}`, { method: "DELETE" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
      if (cara === "POST") {
        toast.success(`Lokasi temuan ${j.temuan.tiang_kode} tersimpan dan dinilai.`);
        onTersimpan(j.temuan);
      } else {
        toast.success("Lokasi temuan dihapus.");
        setKode(""); setCatatan("");
        onTersimpan(null);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSibuk(false);
      setTanyaHapus(false);
    }
  };

  return (
    <div className="rounded-xl border border-line p-3 space-y-2">
      <p className="text-xs font-semibold text-ink flex items-center gap-1.5"><MapPin size={14} className="text-brand-600" /> Lokasi temuan sebenarnya</p>
      {galatTiang ? (
        <p className="text-xs text-red-600">Daftar tiang gagal dimuat: {galatTiang}</p>
      ) : tiang && !tiang.length ? (
        <p className="text-xs text-ink-soft">Penyulang {penyulang} belum punya tiang di data JTM — lokasi temuan belum bisa diisi.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <input
              list="pilihan-tiang-temuan" value={kode} onChange={(e) => setKode(e.target.value)}
              placeholder={tiang ? "Nomor tiang, mis. BKR-122R003" : "Memuat tiang…"} disabled={!tiang}
              className={`${INPUT} w-[240px]`}
            />
            <datalist id="pilihan-tiang-temuan">
              {tiang?.map((t) => <option key={t.id} value={t.kode}>{t.km.toFixed(2)} km dari GI</option>)}
            </datalist>
            <input value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="Catatan (penyebab, posisi persis)" className={`${INPUT} flex-1 min-w-[200px]`} />
          </div>
          {kode.trim() && !pilihan && tiang && <p className="text-xs text-amber-700">Tiang {kode} tidak ada di jaringan {penyulang}.</p>}
          <div className="flex items-center gap-2">
            <Tombol ragam="utama" ukuran="sm" disabled={!pilihan || sibuk} onClick={() => kirim("POST")}>
              {sibuk ? "Menyimpan…" : temuan ? "Simpan perubahan" : "Simpan lokasi temuan"}
            </Tombol>
            {temuan && <Tombol ukuran="sm" disabled={sibuk} onClick={() => setTanyaHapus(true)}>Hapus lokasi</Tombol>}
            {temuan && <span className="text-[11px] text-ink-muted">diisi {temuan.diisi_oleh ?? "–"}</span>}
          </div>
        </>
      )}
      {tanyaHapus && (
        <ConfirmDialog
          title="Hapus lokasi temuan?"
          message={`Lokasi ${temuan?.tiang_kode} untuk gangguan ini dihapus. Kalibrasi sumber dan rapor akurasi tidak lagi memakai temuan ini.`}
          confirmLabel="Hapus" tone="danger"
          onConfirm={() => kirim("DELETE")} onClose={() => setTanyaHapus(false)}
        />
      )}
    </div>
  );
}
