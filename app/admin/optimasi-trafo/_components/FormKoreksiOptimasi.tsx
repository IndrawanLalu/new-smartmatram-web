"use client";

import { useState } from "react";
import { EYEBROW, FIELD } from "@/app/admin/_ui";
import type { AlasanRef, CatatanOptimasi, KoreksiOptimasi } from "../_hooks/useOptimasiTrafo";

/**
 * Koreksi admin atas catatan yang salah input dari HP.
 *
 * Yang TIDAK bisa diubah di sini, dan itu disengaja:
 *   · gardu & WO-nya — salah gardu berarti catatan yang salah; jalannya
 *     "Salah input" lalu dicatat ulang, bukan dipindah diam-diam;
 *   · foto papan nama & titik — bukti dari lapangan, bukan isian.
 * Usulan perubahan master ikut disusun ulang di server begitu koreksi disimpan.
 */

export const ID_FORM_KOREKSI = "form-koreksi-optimasi";

const ULP = ["AMPENAN", "CAKRANEGARA", "GERUNG", "TANJUNG"];

interface Props {
  c: CatatanOptimasi;
  alasan: AlasanRef[];
  onSimpan: (v: KoreksiOptimasi) => void;
}

function Kolom({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

export default function FormKoreksiOptimasi({ c, alasan, onSimpan }: Props) {
  const [v, setV] = useState({
    kvaLama: String(c.kvaLama),
    kvaBaru: String(c.kvaBaru),
    noSeriLama: c.noSeriLama ?? "",
    seriLamaTakTerbaca: c.seriLamaTakTerbaca,
    noSeriBaru: c.noSeriBaru,
    merkBaru: c.merkBaru ?? "",
    tahunBaru: c.tahunBaru ? String(c.tahunBaru) : "",
    asal: c.asal,
    asalKode: c.asalKode ?? "",
    asalUlp: c.asalUlp ?? c.ulp,
    tujuan: c.tujuan,
    tujuanKode: c.tujuanKode ?? "",
    tujuanUlp: c.tujuanUlp ?? c.ulp,
    alasan: c.alasan,
    tglOperasi: c.tglOperasi,
    catatan: c.catatan ?? "",
  });
  const ubah = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));

  // Alasan yang sudah dinonaktifkan tetap ditampilkan kalau sedang dipakai
  // catatan ini — kalau tidak, pilihan lamanya lenyap dari daftar.
  const pilihanAlasan = alasan.filter((a) => a.aktif || a.kode === c.alasan);

  const kirim = (e: React.FormEvent) => {
    e.preventDefault();
    onSimpan({
      kvaLama: Number(v.kvaLama),
      kvaBaru: Number(v.kvaBaru),
      noSeriLama: v.seriLamaTakTerbaca ? null : v.noSeriLama.trim() || null,
      seriLamaTakTerbaca: v.seriLamaTakTerbaca,
      noSeriBaru: v.noSeriBaru.trim(),
      merkBaru: v.merkBaru.trim() || null,
      tahunBaru: v.tahunBaru ? Number(v.tahunBaru) : null,
      asal: v.asal,
      asalKode: v.asal === "GARDU" ? v.asalKode.trim().toUpperCase() : null,
      asalUlp: v.asal === "GARDU" ? v.asalUlp : null,
      tujuan: v.tujuan,
      tujuanKode: v.tujuan === "GARDU" ? v.tujuanKode.trim().toUpperCase() : null,
      tujuanUlp: v.tujuan === "GARDU" ? v.tujuanUlp : null,
      alasan: v.alasan,
      tglOperasi: v.tglOperasi,
      catatan: v.catatan.trim() || null,
    });
  };

  return (
    <form id={ID_FORM_KOREKSI} onSubmit={kirim} className="flex flex-col gap-5">
      <p className="text-xs text-ink-soft">
        Gardu, foto papan nama, dan titik tidak bisa diubah dari web. Kalau gardunya yang salah,
        tandai catatan ini <b>Salah input</b> dan minta regu mencatat ulang.
      </p>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-3">
          <p className={EYEBROW}>Trafo lama</p>
          <Kolom label="kVA">
            <input type="number" min={1} required value={v.kvaLama} onChange={(e) => ubah({ kvaLama: e.target.value })} className={FIELD} />
          </Kolom>
          <Kolom label="No. seri">
            <input
              value={v.noSeriLama}
              disabled={v.seriLamaTakTerbaca}
              required={!v.seriLamaTakTerbaca}
              onChange={(e) => ubah({ noSeriLama: e.target.value })}
              className={`${FIELD} font-mono disabled:bg-surface`}
            />
          </Kolom>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <input
              type="checkbox"
              checked={v.seriLamaTakTerbaca}
              onChange={(e) => ubah({ seriLamaTakTerbaca: e.target.checked, noSeriLama: e.target.checked ? "" : v.noSeriLama })}
            />
            Papan nama tidak terbaca
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <p className={EYEBROW}>Trafo baru</p>
          <Kolom label="kVA">
            <input type="number" min={1} required value={v.kvaBaru} onChange={(e) => ubah({ kvaBaru: e.target.value })} className={FIELD} />
          </Kolom>
          <Kolom label="No. seri">
            <input required value={v.noSeriBaru} onChange={(e) => ubah({ noSeriBaru: e.target.value })} className={`${FIELD} font-mono`} />
          </Kolom>
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <Kolom label="Merk">
              <input value={v.merkBaru} onChange={(e) => ubah({ merkBaru: e.target.value })} className={FIELD} />
            </Kolom>
            <Kolom label="Tahun">
              <input
                inputMode="numeric"
                value={v.tahunBaru}
                onChange={(e) => ubah({ tahunBaru: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                className={FIELD}
              />
            </Kolom>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <p className={EYEBROW}>Trafo baru berasal dari</p>
          <select value={v.asal} onChange={(e) => ubah({ asal: e.target.value as typeof v.asal })} className={FIELD}>
            <option value="GUDANG">Gudang</option>
            <option value="GARDU">Gardu lain</option>
          </select>
          {v.asal === "GARDU" && (
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="Kode gardu" value={v.asalKode} onChange={(e) => ubah({ asalKode: e.target.value })} className={FIELD} />
              <select value={v.asalUlp} onChange={(e) => ubah({ asalUlp: e.target.value })} className={FIELD}>
                {ULP.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <p className={EYEBROW}>Trafo lama dibawa ke</p>
          <select value={v.tujuan} onChange={(e) => ubah({ tujuan: e.target.value as typeof v.tujuan })} className={FIELD}>
            <option value="GUDANG">Gudang</option>
            <option value="GARDU">Gardu lain</option>
            <option value="PERBAIKAN">Perbaikan</option>
          </select>
          {v.tujuan === "GARDU" && (
            <div className="grid grid-cols-2 gap-2">
              <input required placeholder="Kode gardu" value={v.tujuanKode} onChange={(e) => ubah({ tujuanKode: e.target.value })} className={FIELD} />
              <select value={v.tujuanUlp} onChange={(e) => ubah({ tujuanUlp: e.target.value })} className={FIELD}>
                {ULP.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Kolom label="Alasan">
          <select value={v.alasan} onChange={(e) => ubah({ alasan: e.target.value })} className={FIELD}>
            {pilihanAlasan.map((a) => <option key={a.kode} value={a.kode}>{a.label}</option>)}
          </select>
        </Kolom>
        <Kolom label="Tanggal pekerjaan">
          <input type="date" required value={v.tglOperasi} onChange={(e) => ubah({ tglOperasi: e.target.value })} className={FIELD} />
        </Kolom>
      </section>

      <Kolom label="Catatan">
        <textarea
          rows={2}
          value={v.catatan}
          onChange={(e) => ubah({ catatan: e.target.value })}
          className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15"
        />
      </Kolom>
    </form>
  );
}
