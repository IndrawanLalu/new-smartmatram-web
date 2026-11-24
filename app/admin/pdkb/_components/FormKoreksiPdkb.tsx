"use client";

import { useEffect, useState } from "react";
import { CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Isian } from "@/app/admin/pemeliharaan-jaringan/_components/InputPekerjaanModal";
import type { KategoriRef } from "@/app/admin/pemeliharaan-jaringan/_hooks/usePemeliharaanJaringan";
import { JENIS_PDKB, type KoreksiPdkb, type PekerjaanPdkb } from "../_hooks/usePdkb";

/**
 * Koreksi catatan PDKB (pola Pemeliharaan Jaringan). Foto, titik, dan ULP
 * tidak bisa diubah di sini — bukti dan hak akses. Tombol simpan ada di kaki
 * modal (`form={ID_FORM_KOREKSI_PDKB}`).
 */

export const ID_FORM_KOREKSI_PDKB = "form-koreksi-pdkb";
const hariIni = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

interface Props {
  b: PekerjaanPdkb;
  kategori: KategoriRef[];
  onSimpan: (v: KoreksiPdkb) => void;
}

export default function FormKoreksiPdkb({ b, kategori, onSimpan }: Props) {
  const [v, setV] = useState<KoreksiPdkb>({
    jenis: b.jenis,
    penyulang: b.penyulang ?? "",
    garduKode: b.garduKode ?? "",
    kategori: b.kategori ?? "",
    pekerjaan: b.pekerjaan,
    alamat: b.alamat ?? "",
    tgl: b.tgl,
    pelaksana: b.pelaksana,
    catatan: b.catatan ?? "",
  });
  const [penyulang, setPenyulang] = useState<string[]>(b.penyulang ? [b.penyulang] : []);
  const ubah = (p: Partial<KoreksiPdkb>) => setV((x) => ({ ...x, ...p }));

  // Penyulang ULP catatan ini; yang tersimpan tetap ada walau tidak di master.
  useEffect(() => {
    let hidup = true;
    void supabaseBrowser.from("penyulang_ref").select("penyulang").ilike("ulp", b.ulp).order("penyulang")
      .then(({ data }) => {
        if (!hidup) return;
        const d = (data ?? []).map((r) => String(r.penyulang));
        setPenyulang([...new Set([...(b.penyulang ? [b.penyulang] : []), ...d])].sort());
      });
    return () => { hidup = false; };
  }, [b.ulp, b.penyulang]);

  const kat = v.jenis === "GARDU" ? [] : kategori.filter((k) => (k.aktif || k.kode === b.kategori) && (k.jenis === "SEMUA" || k.jenis === v.jenis));

  return (
    <form
      id={ID_FORM_KOREKSI_PDKB}
      onSubmit={(e) => { e.preventDefault(); onSimpan({ ...v, pekerjaan: v.pekerjaan.trim(), pelaksana: v.pelaksana.trim() }); }}
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1">
          <span className={EYEBROW}>Jenis</span>
          <div className="flex gap-2">
            {JENIS_PDKB.map((j) => (
              <button key={j} type="button" onClick={() => ubah({ jenis: j, kategori: "" })}
                className={`${CHIP} ${v.jenis === j ? CHIP_ON : CHIP_OFF}`}>
                {j === "GARDU" ? "Gardu" : j}
              </button>
            ))}
          </div>
        </div>
        {v.jenis === "GARDU" ? (
          <Isian label="Kode gardu" wajib>
            <input value={v.garduKode} onChange={(e) => ubah({ garduKode: e.target.value })} className={FIELD} required />
          </Isian>
        ) : (
          <Isian label="Penyulang" wajib>
            <select value={v.penyulang} onChange={(e) => ubah({ penyulang: e.target.value })} className={FIELD} required>
              <option value="">Pilih penyulang</option>
              {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Isian>
        )}
        <Isian label="Tanggal pekerjaan" wajib>
          <input type="date" value={v.tgl} max={hariIni()} onChange={(e) => ubah({ tgl: e.target.value })} className={FIELD} required />
        </Isian>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {kat.length > 0 && (
          <Isian label="Kategori (tidak wajib)">
            <select value={v.kategori} onChange={(e) => ubah({ kategori: e.target.value })} className={FIELD}>
              <option value="">— Tanpa kategori —</option>
              {kat.map((k) => <option key={k.kode} value={k.kode}>{k.label}</option>)}
            </select>
          </Isian>
        )}
        <div className={kat.length > 0 ? "sm:col-span-2" : "sm:col-span-3"}>
          <Isian label="Uraian pekerjaan" wajib>
            <input value={v.pekerjaan} onChange={(e) => ubah({ pekerjaan: e.target.value })} className={FIELD} required />
          </Isian>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Isian label="Tim pelaksana" wajib>
          <input value={v.pelaksana} onChange={(e) => ubah({ pelaksana: e.target.value })} className={FIELD} required />
        </Isian>
        <Isian label="Lokasi / alamat">
          <input value={v.alamat} onChange={(e) => ubah({ alamat: e.target.value })} className={FIELD} />
        </Isian>
      </div>

      <Isian label="Catatan">
        <textarea value={v.catatan} onChange={(e) => ubah({ catatan: e.target.value })} rows={2} className={`${FIELD} h-auto py-2`} />
      </Isian>
      <p className="text-[11px] text-ink-muted">Foto dan titik tidak bisa diubah — bukti pekerjaan. Salah foto: batalkan catatan lalu catat ulang.</p>
    </form>
  );
}
