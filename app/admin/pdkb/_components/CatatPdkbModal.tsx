"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import { bacaKoordinat } from "@/lib/koordinat";
import { Isian, PilihFoto } from "@/app/admin/pemeliharaan-jaringan/_components/InputPekerjaanModal";
import type { KategoriRef } from "@/app/admin/pemeliharaan-jaringan/_hooks/usePemeliharaanJaringan";
import { JENIS_PDKB, UNIT, type IsianPdkb, type JenisPdkb } from "../_hooks/usePdkb";
import PilihKategoriLain from "@/app/admin/_components/PilihKategoriLain";
import type { TugasPdkb } from "../_hooks/useTugasPdkb";

/**
 * Catat pekerjaan PDKB (24 Nov 2026). Dari tab Temuan ditugaskan ("Catat
 * hasil") isiannya terisi dari tugas itu dan menyimpannya MENUTUP tugasnya;
 * foto sebelum boleh kosong bila tugasnya punya foto temuan. Tanpa tugas =
 * pekerjaan di luar tugas. Foto sesudah selalu wajib.
 */

const ID_FORM = "form-catat-pdkb";
const hariIni = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

interface Props {
  /** ULP terpilih di halaman; "SEMUA" = pilih ULP di formulir (UP3). */
  ulp: string;
  kategori: KategoriRef[];
  tugas: TugasPdkb | null;
  onTutup: () => void;
  onSimpan: (v: IsianPdkb) => Promise<void>;
}

export default function CatatPdkbModal({ ulp, kategori, tugas, onTutup, onSimpan }: Props) {
  const toast = useToast();
  const ulpTetap = tugas?.ulp ?? (ulp === "SEMUA" ? "" : ulp);
  const [penyulang, setPenyulang] = useState<{ penyulang: string; ulp: string }[]>([]);
  const [jenis, setJenis] = useState<JenisPdkb | "">(tugas?.jenis ?? "");
  const [v, setV] = useState({
    ulp: ulpTetap,
    penyulang: tugas?.penyulang ?? "",
    gardu: tugas?.garduKode ?? "",
    kategori: "",
    pekerjaan: tugas?.uraian ?? "",
    tgl: hariIni(),
    pelaksana: "PDKB",
    alamat: tugas?.lokasi ?? "",
    titik: tugas?.koordinat ?? "",
    catatan: "",
  });
  const [foto, setFoto] = useState<{ sebelum: File | null; sesudah: File | null; proses: File | null }>({ sebelum: null, sesudah: null, proses: null });
  const [sibuk, setSibuk] = useState(false);
  const [kategoriLain, setKategoriLain] = useState<string[]>([]);
  const ubah = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));

  const ulpPenyulang = ulpTetap || "SEMUA";
  useEffect(() => {
    let hidup = true;
    fetchAllRows<{ penyulang: string; ulp: string }>(() => {
      const q = supabaseBrowser.from("penyulang_ref").select("penyulang,ulp").order("penyulang").order("ulp");
      return ulpPenyulang === "SEMUA" ? q : q.ilike("ulp", ulpPenyulang);
    }).then((d) => { if (hidup) setPenyulang(d); }, () => {});
    return () => { hidup = false; };
  }, [ulpPenyulang]);

  // Sama dengan aturan server (_periksa_isian_pdkb): aktif, jenis SEMUA atau jenis catatan.
  const kategoriJenis = jenis === ""
    ? []
    : kategori.filter((k) => k.aktif && (k.jenis === "SEMUA" || k.jenis === jenis));
  const titik = v.titik.trim() ? bacaKoordinat(v.titik) : null;
  const titikSalah = !!titik && "galat" in titik;
  const sebelumAda = !!foto.sebelum || !!tugas?.foto;
  const siap =
    jenis !== "" && !!v.ulp && (jenis === "GARDU" ? !!v.gardu.trim() : !!v.penyulang) &&
    !!v.pekerjaan.trim() && !!v.tgl && !!v.pelaksana.trim() && sebelumAda && !!foto.sesudah && !titikSalah;

  const kirim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siap || !foto.sesudah) return;
    setSibuk(true);
    try {
      await onSimpan({
        ulp: v.ulp,
        jenis,
        penyulang: v.penyulang,
        garduKode: v.gardu.trim().toUpperCase(),
        kategori: v.kategori,
        pekerjaan: v.pekerjaan.trim(),
        alamat: v.alamat.trim(),
        lat: titik && "titik" in titik ? titik.titik.lat : null,
        lng: titik && "titik" in titik ? titik.titik.lng : null,
        tgl: v.tgl,
        pelaksana: v.pelaksana.trim(),
        catatan: v.catatan.trim(),
        inspeksiId: tugas?.id ?? null,
        tugasTabel: tugas?.tabel ?? null,
        kategoriTambahan: v.kategori ? kategoriLain.filter((k) => kategoriJenis.some((x) => x.kode === k)) : [],
        fotoSebelum: foto.sebelum,
        fotoSesudah: foto.sesudah,
        fotoProses: foto.proses,
      });
      toast.success(tugas ? "Hasil tercatat — tugasnya ditutup Selesai." : "Pekerjaan PDKB tercatat.");
      onTutup();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title={tugas ? "Catat hasil tugas PDKB" : "Catat pekerjaan PDKB"}
      subtitle={tugas ? `${tugas.sumber} · ${tugas.ulp} · menyimpan = tugas Selesai` : "Dicatat admin · tidak dihitung realisasi Pemeliharaan Jaringan"}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <span className={EYEBROW}>Jenis <span className="text-red-500">*</span></span>
            <div className="flex gap-2">
              {JENIS_PDKB.map((j) => (
                <button key={j} type="button" disabled={!!tugas?.jenis}
                  onClick={() => { setJenis(j); ubah({ kategori: "" }); setKategoriLain([]); }}
                  className={`${CHIP} ${jenis === j ? CHIP_ON : CHIP_OFF} disabled:opacity-60`}>
                  {j === "GARDU" ? "Gardu" : j}
                </button>
              ))}
            </div>
          </div>
          {!ulpTetap && (
            <Isian label="ULP" wajib>
              <select value={v.ulp} onChange={(e) => ubah({ ulp: e.target.value, penyulang: "" })} className={FIELD}>
                <option value="">Pilih ULP</option>
                {UNIT.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </Isian>
          )}
          {jenis === "GARDU" ? (
            <Isian label="Kode gardu" wajib>
              <input value={v.gardu} onChange={(e) => ubah({ gardu: e.target.value })} className={FIELD} placeholder="mis. AM136" />
            </Isian>
          ) : (
            <Isian label="Penyulang" wajib>
              <select value={v.penyulang} onChange={(e) => ubah({ penyulang: e.target.value })} className={FIELD}>
                <option value="">{penyulang.length ? "Pilih penyulang" : "Memuat…"}</option>
                {penyulang
                  .filter((p) => !v.ulp || p.ulp.toUpperCase() === v.ulp.toUpperCase())
                  .map((p) => <option key={`${p.penyulang}|${p.ulp}`} value={p.penyulang}>{p.penyulang}</option>)}
              </select>
            </Isian>
          )}
          <Isian label="Tanggal pekerjaan" wajib>
            <input type="date" value={v.tgl} max={hariIni()} onChange={(e) => ubah({ tgl: e.target.value })} className={FIELD} />
          </Isian>
        </div>

        {kategoriJenis.length > 0 && (
          <Isian label="Kategori (tidak wajib)">
            <select
              value={v.kategori}
              onChange={(e) => { ubah({ kategori: e.target.value }); setKategoriLain((x) => x.filter((k) => k !== e.target.value)); }}
              className={FIELD}
            >
              <option value="">— Tanpa kategori —</option>
              {kategoriJenis.map((k) => <option key={k.kode} value={k.kode}>{k.label}</option>)}
            </select>
          </Isian>
        )}
        {kategoriJenis.length > 1 && (
          <PilihKategoriLain
            pilihan={kategoriJenis}
            sudah={v.kategori ? [v.kategori] : []}
            nilai={kategoriLain}
            onUbah={setKategoriLain}
            kunci={v.kategori ? null : "Pilih kategori utama dulu."}
          />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <Isian label="Uraian pekerjaan" wajib>
              <input value={v.pekerjaan} onChange={(e) => ubah({ pekerjaan: e.target.value })} className={FIELD}
                placeholder="mis. Penggantian isolator tumpu (PDKB sentuh langsung)" />
            </Isian>
          </div>
          <Isian label="Tim pelaksana" wajib>
            <input value={v.pelaksana} onChange={(e) => ubah({ pelaksana: e.target.value })} className={FIELD} placeholder="mis. PDKB TM 1" />
          </Isian>
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
          <PilihFoto label={tugas?.foto ? "Foto sebelum (bawaan: foto temuan)" : "Foto sebelum"} wajib={!tugas?.foto}
            onFile={(f) => setFoto((x) => ({ ...x, sebelum: f }))} />
          <PilihFoto label="Foto proses" onFile={(f) => setFoto((x) => ({ ...x, proses: f }))} />
          <PilihFoto label="Foto sesudah" wajib onFile={(f) => setFoto((x) => ({ ...x, sesudah: f }))} />
        </div>

        <Isian label="Catatan">
          <textarea value={v.catatan} onChange={(e) => ubah({ catatan: e.target.value })} rows={2}
            className={`${FIELD} h-auto py-2`} placeholder="mis. nomor SPK / laporan PDKB" />
        </Isian>
      </form>
    </ModalShell>
  );
}
