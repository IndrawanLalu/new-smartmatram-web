"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { JENIS_TITIK } from "@/app/admin/jtm/_hooks/useSegmen";

/**
 * Membetulkan titik ujung segmen lapangan. Nama segmennya tidak diketik —
 * tersusun ulang dari kedua titik (`ubah_titik_segmen`), dan segmen yang
 * bersambung di tiang yang sama ikut diperbarui.
 */

/** UJUNG bukan pilihan di sini: itu keadaan "masih dirintis", bukan tempat. */
const JENIS = JENIS_TITIK.filter((j) => j.kode !== "UJUNG");
const DENGAN_TITIK = new Set(["REC", "LBS", "PENG", "PMT"]);
const label = (jenis: string, nama: string) =>
  `${jenis}${DENGAN_TITIK.has(jenis) ? "." : ""} ${nama.trim().toUpperCase()}`.trim();

interface Titik {
  jenis: string;
  nama: string;
}

interface Props {
  segmenId: string;
  namaSegmen: string;
  onSimpan: (ujung: "awal" | "akhir", jenis: string, nama: string) => Promise<boolean>;
  onTutup: () => void;
}

export default function UbahTitikSegmen({ segmenId, namaSegmen, onSimpan, onTutup }: Props) {
  const [asal, setAsal] = useState<{ awal: Titik; akhir: Titik } | null>(null);
  const [awal, setAwal] = useState<Titik>({ jenis: "GI", nama: "" });
  const [akhir, setAkhir] = useState<Titik>({ jenis: "TIANG", nama: "" });
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .from("segmen")
      .select("titik_awal_jenis,titik_awal_nama,titik_akhir_jenis,titik_akhir_nama")
      .eq("id", segmenId)
      .single()
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error || !data) {
          setGalat(error?.message ?? "Segmen tidak ditemukan");
          return;
        }
        const a = { jenis: data.titik_awal_jenis as string, nama: (data.titik_awal_nama as string) ?? "" };
        const k = { jenis: data.titik_akhir_jenis as string, nama: (data.titik_akhir_nama as string) ?? "" };
        setAsal({ awal: a, akhir: k });
        setAwal(a);
        setAkhir(k);
      });
    return () => { hidup = false; };
  }, [segmenId]);

  const masihDirintis = asal?.akhir.jenis === "UJUNG";
  const beda = (x: Titik, y: Titik | undefined) =>
    !!y && (x.jenis !== y.jenis || x.nama.trim().toUpperCase() !== y.nama.trim().toUpperCase());
  const ubahAwal = beda(awal, asal?.awal);
  const ubahAkhir = !masihDirintis && beda(akhir, asal?.akhir);
  const siap = (ubahAwal || ubahAkhir) && !!awal.nama.trim() && (masihDirintis || !!akhir.nama.trim());

  const simpan = async () => {
    setSibuk(true);
    const ok =
      (!ubahAwal || (await onSimpan("awal", awal.jenis, awal.nama))) &&
      (!ubahAkhir || (await onSimpan("akhir", akhir.jenis, akhir.nama)));
    setSibuk(false);
    if (ok) onTutup();
  };

  const baris = (judul: string, v: Titik, set: (t: Titik) => void, kunci = false) => (
    <div className="space-y-1.5">
      <p className={EYEBROW}>{judul}</p>
      {kunci ? (
        <p className="text-sm text-ink-soft">Masih dirintis — ujungnya ditentukan regu saat menyimpan segmen di HP.</p>
      ) : (
        <div className="flex gap-2">
          <select value={v.jenis} onChange={(e) => set({ ...v, jenis: e.target.value })} className={`${FIELD} w-44`}>
            {JENIS.map((j) => <option key={j.kode} value={j.kode}>{j.label}</option>)}
          </select>
          <input
            value={v.nama}
            onChange={(e) => set({ ...v, nama: e.target.value })}
            placeholder={v.jenis === "REC" ? "KAMBOJA" : "nama titik"}
            className={`${FIELD} flex-1 uppercase`}
          />
        </div>
      )}
    </div>
  );

  return (
    <ModalShell
      title="Ubah titik ujung"
      subtitle={namaSegmen}
      maxWidth="max-w-xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>Batal</button>
          <button onClick={() => void simpan()} disabled={!siap || sibuk} className={`${BTN_PRIMARY} disabled:opacity-40`}>
            {sibuk && <Loader2 size={14} className="animate-spin" />} Simpan
          </button>
        </div>
      }
    >
      {galat ? (
        <p className="text-sm text-red-600">{galat}</p>
      ) : !asal ? (
        <Loader2 size={18} className="animate-spin text-ink-muted" />
      ) : (
        <div className="space-y-4">
          {baris("Pangkal", awal, setAwal)}
          {baris("Ujung", akhir, setAkhir, masihDirintis)}
          <div className="rounded-lg bg-surface px-3 py-2 text-sm">
            <span className="text-ink-muted">Nama segmen menjadi </span>
            <b className="text-ink">
              {label(awal.jenis, awal.nama)} - {masihDirintis ? "UJUNG" : label(akhir.jenis, akhir.nama)}
            </b>
          </div>
          <p className="text-xs text-ink-muted leading-relaxed">
            Segmen yang bersambung di tiang yang sama ikut diperbarui, supaya rantainya tidak putus. Tiangnya
            tidak berubah; jenis keypoint/gardu ikut menandai tiangnya.
          </p>
        </div>
      )}
    </ModalShell>
  );
}
