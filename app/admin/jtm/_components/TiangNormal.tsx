"use client";

import { Loader2 } from "lucide-react";
import { CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useJtmItem, type ItemRef } from "../_hooks/useJtmItem";

/**
 * Menyetel isian tombol "Tiang normal" di HP petugas.
 *
 * Kebanyakan tiang memang normal dan bentuknya sama. Satu ketukan mengisi
 * seluruh jawaban ini sekaligus — itulah bedanya antara menyapu lima puluh
 * tiang sehari dan menyerah di tiang kelima belas.
 *
 * Item yang dibiarkan kosong tidak ikut terisi otomatis, dan itu bukan
 * kekurangan: nomor peralatan atau nilai pentanahan memang tidak punya jawaban
 * yang "biasanya benar", dan mengisinya otomatis berarti menuliskan angka yang
 * tidak pernah diukur siapa pun.
 */

const TIER_LABEL: Record<string, string> = {
  "1": "rutin",
  "2": "detail",
  "12": "keduanya",
};

export default function TiangNormal() {
  const { item, kelompok, opsiPer, loading, setBawaan } = useJtmItem();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat item pemeriksaan…
      </div>
    );
  }

  const terisi = kelompok.reduce(
    (n, [, daftar]) => n + daftar.filter((i) => i.nilaiBawaan).length,
    0,
  );
  const total = kelompok.reduce((n, [, daftar]) => n + daftar.length, 0);

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Tiang normal</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Jawaban di bawah ini yang dipasang tombol <b>“Tiang normal”</b> di HP petugas —
          satu ketukan, seluruh formulir terisi. Yang sudah diisi petugas sendiri tidak
          pernah ditimpa, dan tiang milik penyulang lain tidak ikut dinyatakan normal.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
          Ini <b>bukan</b> penanda “bukan temuan”. Satu item boleh punya banyak jawaban yang
          sama-sama normal — beton 9 m normal, besi 11 m juga. Yang disetel di sini adalah
          mana yang <i>paling sering benar</i> di wilayah Anda, dan itu cuma satu.
        </p>
        <p className="text-[11px] text-ink-muted mt-2">
          Terisi <b className="tabular-nums">{terisi}</b> dari {total} item.
        </p>
      </div>

      {kelompok.map(([nama, daftar]) => (
        <div key={nama} className={`${CARD} p-5`}>
          <p className={EYEBROW}>{nama}</p>
          <div className="mt-3 space-y-1.5">
            {daftar.map((i) => (
              <Baris
                key={i.kode}
                i={i}
                opsi={opsiPer(i.kode)}
                syaratNama={
                  i.syaratItem ? (item.find((x) => x.kode === i.syaratItem)?.nama ?? i.syaratItem) : null
                }
                syaratLabel={
                  i.syaratItem
                    ? i.syaratNilai
                        .map((v) => opsiPer(i.syaratItem!).find((o) => o.kode === v)?.label ?? v)
                        .join(" / ")
                    : null
                }
                onSimpan={setBawaan}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Baris({
  i,
  opsi,
  syaratNama,
  syaratLabel,
  onSimpan,
}: {
  i: ItemRef;
  opsi: { kode: string; label: string; normal: boolean }[];
  syaratNama: string | null;
  syaratLabel: string | null;
  onSimpan: (kode: string, nilai: string | null) => Promise<boolean>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink w-[230px] truncate" title={i.nama}>
        {i.nama}
        {i.satuan ? <span className="text-ink-muted"> ({i.satuan})</span> : null}
      </span>
      <span className="text-[10px] text-ink-muted w-[64px]">{TIER_LABEL[i.tier] ?? i.tier}</span>

      {i.tipe === "pilihan" ? (
        <select
          value={i.nilaiBawaan ?? ""}
          onChange={(e) => void onSimpan(i.kode, e.target.value || null)}
          className={`${FIELD} w-[260px]`}
          aria-label={`Jawaban bawaan ${i.nama}`}
        >
          <option value="">— tidak diisi otomatis —</option>
          {opsi.map((o) => (
            <option key={o.kode} value={o.kode}>
              {o.label}
              {o.normal ? "" : "  (temuan)"}
            </option>
          ))}
        </select>
      ) : (
        <input
          defaultValue={i.nilaiBawaan ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (i.nilaiBawaan ?? "")) void onSimpan(i.kode, v || null);
          }}
          placeholder={i.tipe === "angka" ? "angka, misal 0" : "biarkan kosong"}
          className={`${FIELD} w-[260px]`}
          aria-label={`Jawaban bawaan ${i.nama}`}
        />
      )}

      {/* Item bersyarat tidak ditanyakan di tiang yang komponennya tidak ada —
          perlu terlihat di sini, karena jawaban bawaannya juga ikut dilewati. */}
      {syaratNama && (
        <span className="text-[11px] text-ink-muted">
          hanya kalau <b className="text-ink">{syaratNama}</b> = {syaratLabel}
        </span>
      )}

      {/* Memilih jawaban yang justru sebuah temuan itu sah — misalnya jaringan
          yang memang seluruhnya masih pakai konstruksi lama — tapi harus
          terlihat, bukan tersembunyi di balik dropdown yang tertutup. */}
      {i.nilaiBawaan && opsi.some((o) => o.kode === i.nilaiBawaan && !o.normal) && (
        <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          bawaannya sebuah temuan
        </span>
      )}
    </div>
  );
}
