"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { UNITS } from "@/lib/roles";
import { JENIS_TITIK, namaSegmen, type SegmenBaru } from "../_hooks/useSegmen";

interface Props {
  penyulangList: string[];
  ulpAwal: string;
  onSimpan: (v: SegmenBaru) => Promise<boolean>;
  onTutup: () => void;
}

const KOSONG = {
  penyulang: "",
  ulp: "",
  titik_awal_jenis: "REC",
  titik_awal_nama: "",
  titik_akhir_jenis: "LBS",
  titik_akhir_nama: "",
  penghantar_jenis: "",
  penghantar_ukuran: "",
  catatan: "",
};

export default function SegmenModal({ penyulangList, ulpAwal, onSimpan, onTutup }: Props) {
  const [v, setV] = useState({ ...KOSONG, ulp: ulpAwal });
  const [menyimpan, setMenyimpan] = useState(false);

  const ubah = (patch: Partial<typeof KOSONG>) => setV((s) => ({ ...s, ...patch }));

  const nama = namaSegmen(
    v.titik_awal_jenis,
    v.titik_awal_nama,
    v.titik_akhir_jenis,
    v.titik_akhir_nama,
  );

  const siap =
    v.penyulang.trim() !== "" &&
    v.ulp !== "" &&
    (v.titik_awal_nama.trim() !== "" || v.titik_awal_jenis === "UJUNG") &&
    (v.titik_akhir_nama.trim() !== "" || v.titik_akhir_jenis === "UJUNG");

  const simpan = async () => {
    setMenyimpan(true);
    const ok = await onSimpan({
      penyulang: v.penyulang,
      ulp: v.ulp,
      titik_awal_jenis: v.titik_awal_jenis,
      titik_awal_nama: v.titik_awal_nama,
      titik_akhir_jenis: v.titik_akhir_jenis,
      titik_akhir_nama: v.titik_akhir_nama,
      penghantar_jenis: v.penghantar_jenis.trim() || null,
      penghantar_ukuran: v.penghantar_ukuran ? Number(v.penghantar_ukuran) : null,
      catatan: v.catatan.trim() || null,
    });
    setMenyimpan(false);
    if (ok) onTutup();
  };

  return (
    <ModalShell
      title="Segmen baru"
      subtitle="Namanya dibentuk sendiri dari kedua ujungnya — itu yang membuat dua orang menyebut ruas yang sama dengan nama yang sama."
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>
            Batal
          </button>
          <button onClick={() => void simpan()} disabled={!siap || menyimpan} className={BTN_PRIMARY}>
            {menyimpan && <Loader2 size={15} className="animate-spin" />}
            Simpan
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={EYEBROW}>Penyulang</label>
            <input
              value={v.penyulang}
              onChange={(e) => ubah({ penyulang: e.target.value })}
              list="jtm-penyulang"
              placeholder="MATARAM"
              className={`${FIELD} mt-1 w-full`}
            />
            <datalist id="jtm-penyulang">
              {penyulangList.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={EYEBROW}>ULP</label>
            <select
              value={v.ulp}
              onChange={(e) => ubah({ ulp: e.target.value })}
              className={`${FIELD} mt-1 w-full`}
            >
              <option value="">— pilih —</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Ujung
            judul="Titik awal"
            jenis={v.titik_awal_jenis}
            nama={v.titik_awal_nama}
            onJenis={(x) => ubah({ titik_awal_jenis: x })}
            onNama={(x) => ubah({ titik_awal_nama: x })}
          />
          <Ujung
            judul="Titik akhir"
            jenis={v.titik_akhir_jenis}
            nama={v.titik_akhir_nama}
            onJenis={(x) => ubah({ titik_akhir_jenis: x })}
            onNama={(x) => ubah({ titik_akhir_nama: x })}
          />
        </div>

        <div className="rounded-xl bg-surface px-4 py-3">
          <p className={EYEBROW}>Nama yang akan tersimpan</p>
          <p className="text-sm font-semibold text-ink mt-0.5">{nama}</p>
          <p className="text-[11px] text-ink-muted mt-1">
            Pengambilan (PENG) tidak memotong jaringan — dia percabangan di dalam segmen. Kalau
            titik awalnya sebuah tiang percabangan, segmen induknya ditemukan sendiri dari tiang
            itu.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={EYEBROW}>Penghantar</label>
            <input
              value={v.penghantar_jenis}
              onChange={(e) => ubah({ penghantar_jenis: e.target.value })}
              placeholder="AAAC, AAACS, A3C…"
              className={`${FIELD} mt-1 w-full`}
            />
          </div>
          <div>
            <label className={EYEBROW}>Ukuran (mm²)</label>
            <input
              type="number"
              value={v.penghantar_ukuran}
              onChange={(e) => ubah({ penghantar_ukuran: e.target.value })}
              placeholder="150"
              className={`${FIELD} mt-1 w-full`}
            />
          </div>
        </div>

        <div>
          <label className={EYEBROW}>Catatan</label>
          <textarea
            value={v.catatan}
            onChange={(e) => ubah({ catatan: e.target.value })}
            rows={2}
            className={`${FIELD} mt-1 w-full h-auto py-2`}
          />
        </div>
      </div>
    </ModalShell>
  );
}

function Ujung({
  judul,
  jenis,
  nama,
  onJenis,
  onNama,
}: {
  judul: string;
  jenis: string;
  nama: string;
  onJenis: (x: string) => void;
  onNama: (x: string) => void;
}) {
  const info = JENIS_TITIK.find((j) => j.kode === jenis);
  return (
    <div className="rounded-xl border border-line p-3">
      <p className={EYEBROW}>{judul}</p>
      <select value={jenis} onChange={(e) => onJenis(e.target.value)} className={`${FIELD} mt-1 w-full`}>
        {JENIS_TITIK.map((j) => (
          <option key={j.kode} value={j.kode}>
            {j.label}
          </option>
        ))}
      </select>
      <input
        value={nama}
        onChange={(e) => onNama(e.target.value)}
        placeholder={jenis === "UJUNG" ? "boleh dikosongkan" : "nama tempat / kode"}
        className={`${FIELD} mt-2 w-full`}
      />
      <p className="text-[11px] text-ink-muted mt-1">
        {info?.memotong ? "Memotong jaringan" : "Tidak memotong jaringan"}
      </p>
    </div>
  );
}
