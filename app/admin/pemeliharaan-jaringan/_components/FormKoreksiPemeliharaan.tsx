"use client";

import { useEffect, useState } from "react";
import { EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { BarisPemeliharaan, JenisJaringan, KategoriRef, KoreksiPemeliharaan } from "../_hooks/usePemeliharaanJaringan";
import PilihTerdekat from "./PilihTerdekat";

/**
 * Koreksi admin atas salah input — selama menunggu verifikasi, atau sesudah
 * disetujui (server: UP3 / admin ULP itu).
 * Foto dan titik tidak bisa diubah di sini: keduanya bukti dari lapangan.
 */

export const ID_FORM_KOREKSI = "form-koreksi-pemeliharaan";

interface Props {
  b: BarisPemeliharaan;
  kategori: KategoriRef[];
  onSimpan: (v: KoreksiPemeliharaan) => void;
}

function Kolom({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export default function FormKoreksiPemeliharaan({ b, kategori, onSimpan }: Props) {
  const [v, setV] = useState<KoreksiPemeliharaan>({
    jenis: b.jenis,
    penyulang: b.penyulang,
    kategori: b.kategori,
    pekerjaan: b.pekerjaan,
    alamat: b.alamat,
    catatan: b.catatan,
    terdekatTiangId: b.terdekatTiangId,
    terdekatGarduKode: b.terdekatGarduKode,
  });
  const [penyulang, setPenyulang] = useState<string[]>([b.penyulang]);
  const ubah = (p: Partial<KoreksiPemeliharaan>) => setV((x) => ({ ...x, ...p }));

  // Penyulang dari master, dibatasi ULP catatan ini. Yang tersimpan tetap ikut
  // di daftar walau tidak ada di master — kalau tidak, pilihannya lenyap.
  useEffect(() => {
    let hidup = true;
    supabaseBrowser
      .from("penyulang_ref")
      .select("penyulang")
      .ilike("ulp", b.ulp)
      .order("penyulang")
      .then(({ data }) => {
        if (!hidup) return;
        const daftar = (data ?? []).map((r) => String(r.penyulang));
        setPenyulang([...new Set([b.penyulang, ...daftar])].sort());
      });
    return () => { hidup = false; };
  }, [b.ulp, b.penyulang]);

  const pilihanKategori = kategori.filter(
    (k) => (k.aktif && (k.jenis === "SEMUA" || k.jenis === v.jenis)) || k.kode === b.kategori,
  );

  return (
    <form
      id={ID_FORM_KOREKSI}
      onSubmit={(e) => {
        e.preventDefault();
        onSimpan({
          ...v,
          pekerjaan: v.pekerjaan.trim(),
          alamat: v.alamat?.trim() || null,
          catatan: v.catatan?.trim() || null,
        });
      }}
      className="flex flex-col gap-4"
    >
      <p className="text-xs text-ink-soft">
        Foto dan titik tidak bisa diubah dari web. Kalau pekerjaannya memang tidak ada, tandai{" "}
        <b>Salah input</b>.
      </p>
      <p className={EYEBROW}>Pekerjaan</p>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Kolom label="Jenis jaringan">
          <select
            value={v.jenis}
            onChange={(e) => ubah({ jenis: e.target.value as JenisJaringan })}
            className={FIELD}
          >
            <option value="JTM">JTM</option>
            <option value="GARDU">Gardu</option>
            <option value="JTR">JTR</option>
          </select>
        </Kolom>
        <Kolom label="Penyulang">
          {/* Ganti penyulang manual = lepas tiang/gardu terdekat (penyulangnya ikut pilihan itu). */}
          <select
            value={v.penyulang}
            onChange={(e) => ubah({ penyulang: e.target.value, terdekatTiangId: null, terdekatGarduKode: null })}
            className={FIELD}
          >
            {penyulang.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Kolom>
        <Kolom label="Kategori">
          <select value={v.kategori} onChange={(e) => ubah({ kategori: e.target.value })} className={FIELD} required>
            <option value="" disabled>Pilih kategori</option>
            {pilihanKategori.map((k) => <option key={k.kode} value={k.kode}>{k.label}</option>)}
          </select>
        </Kolom>
      </section>
      <PilihTerdekat
        b={b}
        tiangId={v.terdekatTiangId}
        garduKode={v.terdekatGarduKode}
        penyulang={v.penyulang}
        onPilih={(p) => {
          const peny = p.penyulang?.trim().toUpperCase();
          if (peny) setPenyulang((x) => (x.includes(peny) ? x : [...x, peny].sort()));
          ubah({ terdekatTiangId: p.tiangId, terdekatGarduKode: p.garduKode, ...(peny ? { penyulang: peny } : {}) });
        }}
      />
      <Kolom label="Pekerjaannya apa">
        <textarea
          required
          rows={2}
          value={v.pekerjaan}
          onChange={(e) => ubah({ pekerjaan: e.target.value })}
          className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
        />
      </Kolom>
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Kolom label="Alamat">
          <input value={v.alamat ?? ""} onChange={(e) => ubah({ alamat: e.target.value })} className={FIELD} />
        </Kolom>
        <Kolom label="Catatan">
          <input value={v.catatan ?? ""} onChange={(e) => ubah({ catatan: e.target.value })} className={FIELD} />
        </Kolom>
      </section>
    </form>
  );
}
