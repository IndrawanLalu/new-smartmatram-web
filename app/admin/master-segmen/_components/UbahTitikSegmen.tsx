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

/** Tiang segmen, calon tiang penutup. */
interface TiangSegmen {
  id: string;
  kode: string;
  penanda: string | null;
}

/** Penanda tiang → jenis ujung (sama dengan layar Simpan segmen di HP). */
const JENIS_DARI_PENANDA: Record<string, string> = {
  recloser: "REC", lbs: "LBS", lbsm: "LBS", pmt: "PMT", peng: "PENG", gardu: "GARDU",
};
/** Jenis ujung → penanda yang ditulis ke tiang penutup (bila belum bertanda). */
const PENANDA_DARI_JENIS: Record<string, string> = {
  REC: "recloser", LBS: "lbs", PMT: "pmt", PENG: "peng", GARDU: "gardu",
};

interface Props {
  segmenId: string;
  namaSegmen: string;
  onSimpan: (ujung: "awal" | "akhir", jenis: string, nama: string) => Promise<boolean>;
  /** Segmen yang masih dirintis (ujung "UJUNG"): tutup di tiang pilihan. */
  onTutupSegmen: (tiangId: string, jenis: string, nama: string, penanda: string | null) => Promise<boolean>;
  onTutup: () => void;
}

export default function UbahTitikSegmen({ segmenId, namaSegmen, onSimpan, onTutupSegmen, onTutup }: Props) {
  const [asal, setAsal] = useState<{ awal: Titik; akhir: Titik } | null>(null);
  const [awal, setAwal] = useState<Titik>({ jenis: "GI", nama: "" });
  const [akhir, setAkhir] = useState<Titik>({ jenis: "TIANG", nama: "" });
  const [galat, setGalat] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [tiangSegmen, setTiangSegmen] = useState<TiangSegmen[]>([]);
  const [penutup, setPenutup] = useState<string>("");

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
    // Tiang segmen — untuk menutup segmen yang masih dirintis. Terbaru dulu;
    // usulan bawaan = tiang keypoint terakhir (mis. recloser di ujung ruas).
    void supabaseBrowser
      .from("segmen_tiang")
      .select("tiang(id,kode,penanda,status_hidup,created_at)")
      .eq("segmen_id", segmenId)
      .then(({ data }) => {
        if (!hidup) return;
        const isi = (data ?? [])
          .map((r) => (Array.isArray(r.tiang) ? r.tiang[0] : r.tiang) as unknown as
            { id: string; kode: string; penanda: string | null; status_hidup: string; created_at: string } | null)
          .filter((t): t is NonNullable<typeof t> => !!t && t.status_hidup === "aktif")
          .sort((x, y) => y.created_at.localeCompare(x.created_at));
        setTiangSegmen(isi.map((t) => ({ id: t.id, kode: t.kode, penanda: t.penanda })));
        const usul = isi.find((t) => t.penanda && JENIS_DARI_PENANDA[t.penanda]) ?? isi[0];
        if (usul) pilihPenutup(usul.id, isi);
      });
    return () => { hidup = false; };
    // pilihPenutup hanya menyetel state; dipanggil sekali dengan daftar segar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmenId]);

  /** Tiang penutup dipilih → jenis & nama ujung diusulkan dari penandanya. */
  function pilihPenutup(id: string, daftar: TiangSegmen[] = tiangSegmen) {
    const t = daftar.find((x) => x.id === id);
    setPenutup(id);
    if (!t) return;
    const j = t.penanda ? JENIS_DARI_PENANDA[t.penanda] : undefined;
    setAkhir({ jenis: j ?? "TIANG", nama: j ? "" : t.kode });
  }

  const masihDirintis = asal?.akhir.jenis === "UJUNG";
  const beda = (x: Titik, y: Titik | undefined) =>
    !!y && (x.jenis !== y.jenis || x.nama.trim().toUpperCase() !== y.nama.trim().toUpperCase());
  const ubahAwal = beda(awal, asal?.awal);
  const ubahAkhir = !masihDirintis && beda(akhir, asal?.akhir);
  const tutupSegmen = masihDirintis && !!penutup && !!akhir.nama.trim();
  const siap = (ubahAwal || ubahAkhir || tutupSegmen) && !!awal.nama.trim() && (masihDirintis || !!akhir.nama.trim());

  const simpan = async () => {
    setSibuk(true);
    const t = tiangSegmen.find((x) => x.id === penutup);
    const ok =
      (!ubahAwal || (await onSimpan("awal", awal.jenis, awal.nama))) &&
      (!ubahAkhir || (await onSimpan("akhir", akhir.jenis, akhir.nama))) &&
      (!tutupSegmen ||
        (await onTutupSegmen(
          penutup,
          akhir.jenis,
          akhir.nama.trim().toUpperCase(),
          // Tiang yang sudah bertanda tidak ditimpa (mis. LBS motorized tetap lbsm).
          t?.penanda ? null : (PENANDA_DARI_JENIS[akhir.jenis] ?? null),
        )));
    setSibuk(false);
    if (ok) onTutup();
  };

  const baris = (judul: string, v: Titik, set: (t: Titik) => void) => (
    <div className="space-y-1.5">
      {judul && <p className={EYEBROW}>{judul}</p>}
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
          {masihDirintis ? (
            <div className="space-y-1.5">
              <p className={EYEBROW}>Ujung — segmen ini belum ditutup</p>
              <p className="text-xs text-ink-muted">
                Pilih tiang penutupnya. Jenis & nama ujung diusulkan dari penanda tiang itu.
              </p>
              <select value={penutup} onChange={(e) => pilihPenutup(e.target.value)} className={FIELD}>
                {tiangSegmen.length === 0 && <option value="">— segmen belum punya tiang —</option>}
                {tiangSegmen.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.kode}{t.penanda ? ` · ${t.penanda}` : ""}
                  </option>
                ))}
              </select>
              {penutup && baris("", akhir, setAkhir)}
            </div>
          ) : (
            baris("Ujung", akhir, setAkhir)
          )}
          <div className="rounded-lg bg-surface px-3 py-2 text-sm">
            <span className="text-ink-muted">Nama segmen menjadi </span>
            <b className="text-ink">
              {label(awal.jenis, awal.nama)} - {masihDirintis && !penutup ? "UJUNG" : label(akhir.jenis, akhir.nama)}
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
