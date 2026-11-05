"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CARD, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { NAMA_MODUL_TINDAKAN, type Tindakan } from "@/app/admin/kinerja-yantek/_lib/lm4dx";

/**
 * Daftar "Pekerjaan yang dikerjakan" per modul (`tindakan_ref`). Tampil di HP
 * sebagai langkah tersendiri; regu mencentang, mengisi jumlah, dan memotret.
 * Tidak dihapus — dinonaktifkan, supaya catatan lama tetap bernama.
 * Baris Realisasi Harian LM memakainya lewat Atur baris → sumber.
 */

const MODUL = ["hargardu", "penyeimbangan"] as const;
const IKON = "p-1 rounded text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-30";

const kodeDari = (modul: string, nama: string) =>
  `${modul === "hargardu" ? "gardu" : "rata"}_${nama.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40)}`;

export default function PengaturanTindakan({ oleh }: { oleh: string }) {
  const toast = useToast();
  const [isi, setIsi] = useState<(Tindakan & { baru?: boolean })[] | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [nonce, setNonce] = useState(0);
  const [galat, setGalat] = useState<string | null>(null);

  useEffect(() => {
    void supabaseBrowser.from("tindakan_ref").select("kode,modul,nama,satuan,urutan,aktif").order("urutan").order("kode")
      .then(({ data, error }) => {
        setGalat(error ? `Daftar pekerjaan gagal dibaca: ${error.message}` : null);
        if (!error) setIsi(data as Tindakan[]);
      });
  }, [nonce]);

  if (galat) return <p className="text-sm text-amber-800 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">{galat}</p>;
  if (!isi) return <div className="p-8 flex justify-center"><Loader2 size={16} className="animate-spin text-ink-soft" /></div>;

  const ubah = (kode: string, patch: Partial<Tindakan>) => setIsi((xs) => xs!.map((x) => (x.kode === kode ? { ...x, ...patch } : x)));
  const geser = (modul: string, i: number, arah: -1 | 1) => setIsi((xs) => {
    const per = xs!.filter((x) => x.modul === modul);
    [per[i], per[i + arah]] = [per[i + arah], per[i]];
    const urut = new Map(per.map((x, j) => [x.kode, (j + 1) * 10]));
    return xs!.map((x) => (urut.has(x.kode) ? { ...x, urutan: urut.get(x.kode)! } : x)).sort((a, b) => a.urutan - b.urutan);
  });
  const tambah = (modul: Tindakan["modul"]) => setIsi((xs) => [
    ...xs!, { kode: crypto.randomUUID(), modul, nama: "", satuan: "titik", urutan: 999, aktif: true, baru: true },
  ]);

  const kosong = isi.some((x) => !x.nama.trim() || !x.satuan.trim());

  const simpan = async () => {
    setSibuk(true);
    // Kode baru dari nama; bila bentrok dengan yang sudah ada diberi akhiran,
    // supaya pekerjaan lain tidak tertimpa.
    const terpakai = new Set(isi.filter((x) => !x.baru).map((x) => x.kode));
    const kodeBaru = (x: Tindakan) => {
      const dasar = kodeDari(x.modul, x.nama);
      let k = dasar;
      for (let n = 2; terpakai.has(k); n++) k = `${dasar}_${n}`;
      terpakai.add(k);
      return k;
    };
    const { error } = await supabaseBrowser.from("tindakan_ref").upsert(
      isi.map((x) => ({
        kode: x.baru ? kodeBaru(x) : x.kode, modul: x.modul, nama: x.nama.trim(), satuan: x.satuan.trim(),
        urutan: x.urutan, aktif: x.aktif, updated_at: new Date().toISOString(), updated_by: oleh,
      })),
    );
    setSibuk(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Daftar pekerjaan tersimpan — tampil di HP saat formulir dibuka berikutnya.`);
    setNonce((n) => n + 1);
  };

  return (
    <div className="flex flex-col gap-4">
      {MODUL.map((m) => {
        const per = isi.filter((x) => x.modul === m);
        return (
          <div key={m} className={`${CARD} p-4`}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-ink">{NAMA_MODUL_TINDAKAN[m]} · pekerjaan yang dikerjakan</h3>
              <button onClick={() => tambah(m)} className={BTN_GHOST}><Plus size={14} /> Tambah</button>
            </div>
            {per.length === 0 && <p className="text-xs text-ink-muted">Belum ada — langkah ini tidak tampil di HP.</p>}
            <div className="flex flex-col divide-y divide-line">
              {per.map((x, i) => (
                <div key={x.kode} className={`py-2 flex items-center gap-2 ${x.aktif ? "" : "opacity-60"}`}>
                  <input value={x.nama} onChange={(e) => ubah(x.kode, { nama: e.target.value })} placeholder="Nama pekerjaan" className={`${FIELD} flex-1 text-xs`} />
                  <input value={x.satuan} onChange={(e) => ubah(x.kode, { satuan: e.target.value })} placeholder="satuan" className={`${FIELD} w-24 text-xs`} />
                  <label className="flex items-center gap-1 text-xs text-ink-soft">
                    <input type="checkbox" checked={x.aktif} onChange={(e) => ubah(x.kode, { aktif: e.target.checked })} /> aktif
                  </label>
                  <button onClick={() => geser(m, i, -1)} disabled={i === 0} className={IKON} aria-label="Naik"><ArrowUp size={14} /></button>
                  <button onClick={() => geser(m, i, 1)} disabled={i === per.length - 1} className={IKON} aria-label="Turun"><ArrowDown size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-end gap-2">
        <p className="text-[11px] text-ink-soft mr-auto">
          Jumlah yang diisi regu dihitung apa adanya (3 jurusan = 3). Nonaktif = tidak tampil di HP; catatan lama tetap.
        </p>
        <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk || kosong}>
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
        </button>
      </div>
    </div>
  );
}
