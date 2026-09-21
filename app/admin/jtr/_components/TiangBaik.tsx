"use client";

import { Loader2 } from "lucide-react";
import { CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useJtrItem, type ItemJtr } from "../_hooks/useJtrItem";

/**
 * Menyetel isian tombol "Tiang baik" di HP petugas.
 *
 * Kebanyakan tiang memang baik dan bentuknya sama. Satu ketukan mengisi
 * seluruh jawaban ini sekaligus — itulah bedanya antara menyapu lima puluh
 * tiang sehari dan menyerah di tiang kelima belas.
 *
 * Item yang dibiarkan kosong tidak ikut terisi otomatis, dan itu bukan
 * kekurangan — itu justru cara menetapkan field yang WAJIB dilihat sendiri:
 * papan kendali di HP menyatakannya "belum diisi", dan tiang tidak bisa
 * tersimpan sebelum petugas membukanya.
 */

const BOOLEAN_OPSI = [
  { kode: "false", label: "Tidak" },
  { kode: "true", label: "Ya" },
];

export default function TiangBaik() {
  const { item, kelompok, opsiPer, loading, setBawaan } = useJtrItem();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat isian tiang…
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
        <p className={EYEBROW}>Tiang baik</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Jawaban di bawah ini yang dipasang tombol <b>“Tiang baik”</b> di HP petugas —
          satu ketukan, seluruh formulir terisi. Yang sudah diisi petugas sendiri tidak
          pernah ditimpa, begitu juga nilai yang terbawa dari tiang sebelumnya.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
          Ini <b>bukan</b> penanda “bukan temuan”. Satu isian boleh punya banyak jawaban
          yang sama-sama baik — tiang beton normal, besi juga. Yang disetel di sini adalah
          mana yang <i>paling sering benar</i> di wilayah Anda, dan itu cuma satu.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
          Isian yang dikosongkan jadi <b>wajib dipilih petugas</b>: papan kendali di HP
          menandainya “belum diisi” dan menahan tombol simpan sampai dibuka. Itulah cara
          memaksa jenis tiang atau ukuran kabel benar-benar dilihat, bukan diterima begitu
          saja.
        </p>
        <p className="text-[11px] text-ink-muted mt-2">
          Terisi <b className="tabular-nums">{terisi}</b> dari {total} isian.
        </p>
      </div>

      {kelompok.map(([nama, daftar]) => (
        <div key={nama} className={`${CARD} p-5`}>
          <p className={EYEBROW}>{nama}</p>
          <div className="mt-3 space-y-1.5">
            {daftar.map((i) => (
              <Baris
                key={i.field}
                i={i}
                opsi={
                  i.tipe === "boolean"
                    ? BOOLEAN_OPSI.map((o) => ({ ...o, normal: true }))
                    : opsiPer(i.kategori)
                }
                syaratNama={
                  i.syaratItem
                    ? (item.find((x) => x.field === i.syaratItem)?.nama ?? i.syaratItem)
                    : null
                }
                syaratNegasi={i.syaratNegasi}
                syaratLabel={i.syaratNilai.join(" / ")}
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
  syaratNegasi,
  syaratLabel,
  onSimpan,
}: {
  i: ItemJtr;
  opsi: { kode: string; label: string; normal: boolean }[];
  syaratNama: string | null;
  syaratNegasi: boolean;
  syaratLabel: string;
  onSimpan: (field: string, nilai: string | null) => Promise<boolean>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-ink w-[230px] truncate" title={i.nama}>
        {i.nama}
        {i.satuan ? <span className="text-ink-muted"> ({i.satuan})</span> : null}
      </span>

      {i.tipe === "angka" ? (
        <input
          defaultValue={i.nilaiBawaan ?? ""}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v !== (i.nilaiBawaan ?? "")) void onSimpan(i.field, v || null);
          }}
          placeholder="angka, misal 0"
          className={`${FIELD} w-[260px]`}
          aria-label={`Jawaban bawaan ${i.nama}`}
        />
      ) : (
        <select
          value={i.nilaiBawaan ?? ""}
          onChange={(e) => void onSimpan(i.field, e.target.value || null)}
          className={`${FIELD} w-[260px]`}
          aria-label={`Jawaban bawaan ${i.nama}`}
        >
          <option value="">— wajib dipilih petugas —</option>
          {opsi.map((o) => (
            <option key={o.kode} value={o.kode}>
              {o.label}
              {o.normal ? "" : "  (temuan)"}
            </option>
          ))}
        </select>
      )}

      {/* Isian bersyarat tidak ditanyakan di tiang yang komponennya tidak ada —
          perlu terlihat di sini, karena jawaban bawaannya juga ikut dilewati. */}
      {syaratNama && (
        <span className="text-[11px] text-ink-muted">
          hanya kalau <b className="text-ink">{syaratNama}</b>{" "}
          {syaratNegasi ? "bukan" : "="} {syaratLabel}
        </span>
      )}

      {/* Memilih jawaban yang justru sebuah temuan itu sah — misalnya jaringan
          yang memang seluruhnya masih berkonstruksi lama — tapi harus terlihat,
          bukan tersembunyi di balik dropdown yang tertutup. */}
      {i.nilaiBawaan && opsi.some((o) => o.kode === i.nilaiBawaan && !o.normal) && (
        <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          bawaannya sebuah temuan
        </span>
      )}

      {/* Kosong bukan keadaan netral — dia menambah satu ketukan wajib di tiap
          tiang. Harus terbaca sebagai pilihan yang disengaja. */}
      {!i.nilaiBawaan && (
        <span className="text-[11px] text-navy-700 bg-navy-50 border border-navy-200 rounded px-1.5 py-0.5">
          diisi manual tiap tiang
        </span>
      )}

      {/* Nama isian diubah di tab Pengaturan, bukan di sini: yang diatur halaman
          ini jawabannya, bukan pertanyaannya. */}
    </div>
  );
}
