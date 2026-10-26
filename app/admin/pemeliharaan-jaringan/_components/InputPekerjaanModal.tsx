"use client";

import { useEffect, useState } from "react";
import { Camera, Loader2, Save } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { bacaKoordinat } from "@/lib/koordinat";
import type { InputAdmin, JenisJaringan, KategoriRef } from "../_hooks/usePemeliharaanJaringan";

/**
 * "Catat pekerjaan tim lain" (26 Okt 2026) — pekerjaan pemeliharaan jaringan
 * oleh tim yang TIDAK memakai aplikasi (PDKB, Yantek, kontraktor). Foto
 * sebelum + sesudah tetap wajib (dari laporan tim); foto proses opsional.
 * Tersimpan langsung Diverifikasi dan ikut realisasi, nama timnya tampil.
 *
 * Satu pekerjaan boleh beberapa kategori (arrester + FCO + jumperan …): foto
 * sekali unggah, tersimpan satu baris per kategori — tiap kategori satu
 * realisasi (pemeliharaan-jaringan-input-banyak.sql).
 */

const ID_FORM = "form-input-pekerjaan";
const JENIS: JenisJaringan[] = ["JTM", "JTR"];
const PELAKSANA = ["PDKB", "Yantek", "Kontraktor", "Lainnya"] as const;
/** Pelaksana yang wajib menyebut nama timnya. */
const WAJIB_NAMA = new Set<string>(["Kontraktor", "Lainnya"]);
const hariIni = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

interface Props {
  /** ULP terpilih di halaman; "SEMUA" = penyulang semua ULP (UP3). */
  ulp: string;
  kategori: KategoriRef[];
  onTutup: () => void;
  onSimpan: (v: InputAdmin) => Promise<void>;
}

function Isian({ label, wajib, children }: { label: string; wajib?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={EYEBROW}>
        {label} {wajib && <span className="text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function PilihFoto({ label, wajib, onFile }: { label: string; wajib?: boolean; onFile: (f: File | null) => void }) {
  const [pratinjau, setPratinjau] = useState<string | null>(null);
  const pilih = (f: File | null) => {
    setPratinjau((lama) => {
      if (lama) URL.revokeObjectURL(lama);
      return f ? URL.createObjectURL(f) : null;
    });
    onFile(f);
  };
  return (
    <label className="flex-1 min-w-35 cursor-pointer">
      <span className={EYEBROW}>
        {label} {wajib ? <span className="text-red-500">*</span> : <span className="normal-case font-normal">(tidak wajib)</span>}
      </span>
      <div className="mt-1 h-32 rounded-xl border border-dashed border-line bg-surface flex items-center justify-center overflow-hidden hover:border-brand-400">
        {pratinjau ? (
          // eslint-disable-next-line @next/next/no-img-element -- pratinjau berkas lokal (blob:)
          <img src={pratinjau} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-xs text-ink-muted"><Camera size={18} /> Pilih foto</span>
        )}
      </div>
      <input type="file" accept="image/*" className="hidden" onChange={(e) => pilih(e.target.files?.[0] ?? null)} />
    </label>
  );
}

export default function InputPekerjaanModal({ ulp, kategori, onTutup, onSimpan }: Props) {
  const toast = useToast();
  const [penyulang, setPenyulang] = useState<{ penyulang: string; ulp: string }[]>([]);
  const [jenis, setJenis] = useState<JenisJaringan | "">("");
  const [v, setV] = useState({ penyulang: "", tgl: hariIni(), alamat: "", titik: "", catatan: "" });
  /** Kategori terpilih, urut pilihan, masing-masing dengan uraian pekerjaannya. */
  const [item, setItem] = useState<{ kategori: string; pekerjaan: string }[]>([]);
  const [pelaksana, setPelaksana] = useState<string>("");
  const [namaTim, setNamaTim] = useState("");
  const [foto, setFoto] = useState<{ sebelum: File | null; sesudah: File | null; proses: File | null }>({ sebelum: null, sesudah: null, proses: null });
  const [sibuk, setSibuk] = useState(false);
  const ubah = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));

  useEffect(() => {
    let hidup = true;
    fetchAllRows<{ penyulang: string; ulp: string }>(() => {
      const q = supabaseBrowser.from("penyulang_ref").select("penyulang,ulp").order("penyulang").order("ulp");
      return ulp === "SEMUA" ? q : q.ilike("ulp", ulp);
    }).then((d) => { if (hidup) setPenyulang(d); }, () => {});
    return () => { hidup = false; };
  }, [ulp]);

  const kategoriJenis = kategori.filter((k) => k.aktif && (k.jenis === "SEMUA" || k.jenis === jenis));
  const titik = v.titik.trim() ? bacaKoordinat(v.titik) : null;
  const titikSalah = !!titik && "galat" in titik;
  const namaWajib = WAJIB_NAMA.has(pelaksana);
  const labelKat = (kode: string) => kategori.find((k) => k.kode === kode)?.label ?? kode;
  const pilihKat = (kode: string) =>
    setItem((x) => (x.some((i) => i.kategori === kode)
      ? x.filter((i) => i.kategori !== kode)
      : [...x, { kategori: kode, pekerjaan: labelKat(kode) }]));
  const siap =
    jenis !== "" && !!v.penyulang && item.length > 0 && item.every((i) => !!i.pekerjaan.trim()) && !!v.tgl && !!pelaksana &&
    (!namaWajib || !!namaTim.trim()) && !!foto.sebelum && !!foto.sesudah && !titikSalah;

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siap || !foto.sebelum || !foto.sesudah) return;
    const nama = namaTim.trim();
    setSibuk(true);
    try {
      await onSimpan({
        jenis,
        penyulang: v.penyulang,
        item: item.map((i) => ({ kategori: i.kategori, pekerjaan: i.pekerjaan.trim() })),
        pelaksana: pelaksana === "Lainnya" ? nama : nama ? `${pelaksana} · ${nama}` : pelaksana,
        tgl: v.tgl,
        alamat: v.alamat.trim(),
        lat: titik && "titik" in titik ? titik.titik.lat : null,
        lng: titik && "titik" in titik ? titik.titik.lng : null,
        catatan: v.catatan.trim(),
        fotoSebelum: foto.sebelum,
        fotoSesudah: foto.sesudah,
        fotoProses: foto.proses,
      });
      toast.success(`Pekerjaan ${pelaksana} di ${v.penyulang} tercatat — ${item.length} kategori.`);
      onTutup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title="Catat pekerjaan tim lain"
      subtitle="Untuk tim yang tidak memakai aplikasi · langsung terverifikasi & ikut realisasi"
      maxWidth="max-w-3xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button type="submit" form={ID_FORM} className={BTN_PRIMARY} disabled={!siap || sibuk}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </>
      }
    >
      <form id={ID_FORM} onSubmit={(e) => void kirim(e)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className={EYEBROW}>Tim pelaksana <span className="text-red-500">*</span></span>
          <div className="flex flex-wrap items-center gap-2">
            {PELAKSANA.map((p) => (
              <button key={p} type="button" onClick={() => setPelaksana(p)} className={`${CHIP} ${pelaksana === p ? CHIP_ON : CHIP_OFF}`}>
                {p}
              </button>
            ))}
            {pelaksana && (
              <input value={namaTim} onChange={(e) => setNamaTim(e.target.value)} className={`${FIELD} w-60`}
                placeholder={namaWajib ? "Nama tim / perusahaan (wajib)" : "Nama tim (tidak wajib)"} />
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <span className={EYEBROW}>Jenis jaringan <span className="text-red-500">*</span></span>
            <div className="flex gap-2">
              {JENIS.map((j) => (
                <button key={j} type="button" onClick={() => { setJenis(j); setItem([]); }} className={`${CHIP} ${jenis === j ? CHIP_ON : CHIP_OFF}`}>
                  {j}
                </button>
              ))}
            </div>
          </div>
          <Isian label="Penyulang" wajib>
            <select value={v.penyulang} onChange={(e) => ubah({ penyulang: e.target.value })} className={FIELD}>
              <option value="">{penyulang.length ? "Pilih penyulang" : "Memuat…"}</option>
              {penyulang.map((p) => (
                <option key={`${p.penyulang}|${p.ulp}`} value={p.penyulang}>
                  {p.penyulang}{ulp === "SEMUA" ? ` · ${p.ulp}` : ""}
                </option>
              ))}
            </select>
          </Isian>
          <Isian label="Tanggal pekerjaan" wajib>
            <input type="date" value={v.tgl} max={hariIni()} onChange={(e) => ubah({ tgl: e.target.value })} className={FIELD} />
          </Isian>
        </div>

        <div className="flex flex-col gap-1">
          <span className={EYEBROW}>
            Kategori pekerjaan <span className="text-red-500">*</span>{" "}
            <span className="normal-case font-normal">— boleh lebih dari satu, tiap kategori jadi satu baris realisasi</span>
          </span>
          {jenis === "" ? (
            <p className="text-xs text-ink-muted">Pilih jenis jaringan dulu.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {kategoriJenis.map((k) => {
                const on = item.some((i) => i.kategori === k.kode);
                return (
                  <button key={k.kode} type="button" onClick={() => pilihKat(k.kode)} className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`} aria-pressed={on}>
                    {k.label}
                  </button>
                );
              })}
            </div>
          )}
          {item.length > 0 && (
            <div className="mt-2 flex flex-col gap-2">
              {item.map((i, n) => (
                <div key={i.kategori} className="flex items-center gap-2">
                  <span className="w-6 text-right text-xs text-ink-muted tabular-nums">{n + 1}.</span>
                  <span className="w-36 shrink-0 text-xs font-semibold text-ink truncate" title={labelKat(i.kategori)}>{labelKat(i.kategori)}</span>
                  <input
                    value={i.pekerjaan}
                    onChange={(e) => setItem((x) => x.map((y) => (y.kategori === i.kategori ? { ...y, pekerjaan: e.target.value } : y)))}
                    className={`${FIELD} flex-1 ${i.pekerjaan.trim() ? "" : "border-red-400"}`}
                    placeholder="Uraian pekerjaan, mis. Penggantian arrester 3 fasa"
                    aria-label={`Pekerjaan ${labelKat(i.kategori)}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Isian label="Lokasi / alamat">
            <input value={v.alamat} onChange={(e) => ubah({ alamat: e.target.value })} className={FIELD} placeholder="Tiang, gardu, atau alamat" />
          </Isian>
          <Isian label="Titik (tidak wajib)">
            <input value={v.titik} onChange={(e) => ubah({ titik: e.target.value })} className={`${FIELD} ${titikSalah ? "border-red-400" : ""}`}
              placeholder="Tempel dari Google Maps, mis. -8.5833, 116.1167" />
            {titik && "galat" in titik && <span className="text-[11px] text-red-600">{titik.galat}</span>}
          </Isian>
        </div>

        <div className="flex flex-wrap gap-3">
          <PilihFoto label="Foto sebelum" wajib onFile={(f) => setFoto((x) => ({ ...x, sebelum: f }))} />
          <PilihFoto label="Foto proses" onFile={(f) => setFoto((x) => ({ ...x, proses: f }))} />
          <PilihFoto label="Foto sesudah" wajib onFile={(f) => setFoto((x) => ({ ...x, sesudah: f }))} />
        </div>

        <Isian label="Catatan">
          <textarea value={v.catatan} onChange={(e) => ubah({ catatan: e.target.value })} rows={2}
            className={`${FIELD} h-auto py-2`} placeholder="mis. nomor SPK / laporan tim" />
        </Isian>
      </form>
    </ModalShell>
  );
}
