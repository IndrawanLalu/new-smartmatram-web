"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useJtmIsian, type ItemBaru } from "../_hooks/useJtmIsian";
import BarisItemJtm from "./BarisItemJtm";
import SyaratJtm from "./SyaratJtm";

/**
 * Isian & pilihan Inspeksi JTM — padanan Pengaturan JTR.
 *
 * Tanda Normal/Temuan di tiap pilihan menentukan apa yang masuk rekap temuan
 * dan apa yang wajib difoto petugas. "Pemilik tiang"/"Tiap kabel" menentukan
 * siapa yang mengisi di tiang underbuild.
 */

const KOSONG: ItemBaru = {
  nama: "",
  kelompok: "",
  tipe: "pilihan",
  dimensi: "tunggal",
  milik: "sirkit",
  syarat: { item: null, nilai: [], negasi: false },
};

export default function IsianJtm() {
  const { item, kelompok, opsiPer, loading, ubahItem, ubahSyarat, tambahItem, simpanOpsi, tambahOpsi, hapusOpsi } =
    useJtmIsian();
  const [baru, setBaru] = useState<ItemBaru>(KOSONG);
  const [sibuk, setSibuk] = useState(false);

  if (loading) {
    return (
      <div className={`${CARD} p-5 flex items-center gap-2 text-ink-soft text-sm`}>
        <Loader2 size={16} className="animate-spin" /> Memuat isian…
      </div>
    );
  }

  const bisaTambah =
    baru.nama.trim() && baru.kelompok.trim() && (!baru.syarat.item || baru.syarat.nilai.length > 0);

  const tambah = async () => {
    setSibuk(true);
    if (await tambahItem(baru)) setBaru(KOSONG);
    setSibuk(false);
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className={EYEBROW}>Isian & pilihan</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">
        Yang ditanyakan di formulir Inspeksi JTM di HP. Tanda <b>Temuan</b> pada sebuah pilihan
        membuatnya masuk rekap temuan dan wajib difoto petugas. <b>Pemilik tiang</b> hanya
        diisi penyulang pemilik batang dan tidak ditanyakan di tiang underbuild; <b>Tiap kabel</b>{" "}
        diisi juga oleh penyulang yang menumpang, untuk kabelnya sendiri.
      </p>
      <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
        Perubahan berlaku di HP saat formulir dimuat berikutnya — tanpa rilis aplikasi. Pilihan
        yang sudah dipakai catatan pemeriksaan tidak bisa dihapus; nonaktifkan saja.
      </p>

      {kelompok.map(([nama, daftar]) => (
        <div key={nama} className="mt-5">
          <p className="text-xs font-bold text-ink">{nama}</p>
          <div className="mt-2 space-y-3">
            {daftar.map((i) => (
              <BarisItemJtm
                key={i.kode}
                i={i}
                opsi={opsiPer(i.kode)}
                semua={item}
                opsiPer={opsiPer}
                onUbahItem={ubahItem}
                onUbahSyarat={ubahSyarat}
                onSimpanOpsi={simpanOpsi}
                onTambahOpsi={tambahOpsi}
                onHapusOpsi={hapusOpsi}
              />
            ))}
          </div>
        </div>
      ))}

      <div className="mt-6 border-t border-line pt-4 space-y-2">
        <p className="text-xs font-bold text-ink">Tambah item</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={baru.nama}
            onChange={(e) => setBaru({ ...baru, nama: e.target.value })}
            placeholder="Nama item (mis. Kondisi Klem)"
            className={`${FIELD} w-[240px]`}
          />
          <input
            value={baru.kelompok}
            onChange={(e) => setBaru({ ...baru, kelompok: e.target.value })}
            list="kelompok-jtm"
            placeholder="Kelompok / halaman"
            className={`${FIELD} w-[190px]`}
          />
          <datalist id="kelompok-jtm">
            {kelompok.map(([k]) => (
              <option key={k} value={k} />
            ))}
          </datalist>
          <select
            value={baru.tipe}
            onChange={(e) => setBaru({ ...baru, tipe: e.target.value as ItemBaru["tipe"] })}
            className={`${FIELD} w-[120px]`}
          >
            <option value="pilihan">pilihan</option>
            <option value="angka">angka</option>
            <option value="teks">teks</option>
          </select>
          <select
            value={baru.dimensi}
            onChange={(e) => setBaru({ ...baru, dimensi: e.target.value as ItemBaru["dimensi"] })}
            className={`${FIELD} w-[130px]`}
          >
            <option value="tunggal">sekali</option>
            <option value="fasa">per fasa R/S/T</option>
          </select>
          <select
            value={baru.milik}
            onChange={(e) => setBaru({ ...baru, milik: e.target.value as ItemBaru["milik"] })}
            className={`${FIELD} w-[140px]`}
          >
            <option value="sirkit">Tiap kabel</option>
            <option value="tiang">Pemilik tiang</option>
          </select>
        </div>
        <SyaratJtm nilai={baru.syarat} onUbah={(s) => setBaru({ ...baru, syarat: s })} item={item} opsiPer={opsiPer} />
        <button onClick={() => void tambah()} disabled={!bisaTambah || sibuk} className={`${BTN_GHOST} disabled:opacity-40`}>
          <Plus size={15} /> Tambah item
        </button>
      </div>
    </div>
  );
}
