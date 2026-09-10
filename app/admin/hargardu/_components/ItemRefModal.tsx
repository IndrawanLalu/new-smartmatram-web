"use client";

import { useState } from "react";
import { Loader2, Lock } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { Dimensi, ItemRef, TipeItem } from "../_hooks/usePengaturanRef";

const DIMENSI: { nilai: Dimensi; label: string; bantu: string }[] = [
  { nilai: "tunggal", label: "Sekali saja", bantu: "satu nilai untuk seluruh gardu" },
  { nilai: "fasa", label: "Per fasa", bantu: "dinilai tiga kali: R, S, T" },
  { nilai: "jurusan", label: "Per jurusan", bantu: "dinilai per jurusan A, B, C, D" },
];

const TIPE: { nilai: TipeItem; label: string; bantu: string }[] = [
  { nilai: "pilihan", label: "Pilihan", bantu: "regu memilih dari daftar yang Anda tentukan" },
  { nilai: "angka", label: "Angka", bantu: "regu mengetik angka, mis. ukuran fuse link" },
  { nilai: "teks", label: "Teks", bantu: "regu mengetik bebas" },
];

const KOSONG: ItemRef = {
  kode: "",
  nama: "",
  kelompok: "",
  dimensi: "tunggal",
  tipe: "pilihan",
  satuan: null,
  wajib: true,
  urutan: 100,
  aktif: true,
  tampil_dashboard: false,
  keterangan: null,
};

interface Props {
  awal?: ItemRef;
  kelompokTersedia: string[];
  dipakai: number;
  onSimpan: (v: ItemRef) => Promise<boolean>;
  onTutup: () => void;
}

export default function ItemRefModal({
  awal,
  kelompokTersedia,
  dipakai,
  onSimpan,
  onTutup,
}: Props) {
  const [v, setV] = useState<ItemRef>(awal ?? KOSONG);
  const [menyimpan, setMenyimpan] = useState(false);

  const baru = !awal;
  // Bentuk jawaban yang sudah tersimpan tidak bisa ditawar lagi: jawaban lama
  // dicatat menurut tipe & dimensi yang berlaku saat itu.
  const bentukTerkunci = dipakai > 0;
  const ubah = (patch: Partial<ItemRef>) => setV((s) => ({ ...s, ...patch }));

  const simpan = async () => {
    setMenyimpan(true);
    const berhasil = await onSimpan(v);
    setMenyimpan(false);
    if (berhasil) onTutup();
  };

  return (
    <ModalShell
      title={baru ? "Item pemeriksaan baru" : `Ubah ${awal.nama}`}
      subtitle="Berlaku untuk semua ULP, dan langsung terpakai di HP regu tanpa perlu rilis aplikasi."
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>
            Batal
          </button>
          <button
            onClick={() => void simpan()}
            disabled={menyimpan || !v.kode.trim() || !v.nama.trim() || !v.kelompok.trim()}
            className={BTN_PRIMARY}
          >
            {menyimpan && <Loader2 size={15} className="animate-spin" />}
            Simpan
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={EYEBROW}>Kode</label>
            <input
              value={v.kode}
              onChange={(e) => ubah({ kode: e.target.value })}
              disabled={!baru}
              placeholder="tekep_bushing"
              className={`${FIELD} mt-1 w-full font-mono disabled:bg-surface disabled:text-ink-muted`}
            />
            <p className="text-[11px] text-ink-muted mt-1">
              {baru
                ? "Huruf kecil, angka, garis bawah. Tidak bisa diubah lagi setelah disimpan."
                : "Kode tetap selamanya — dialah yang tertulis di tiap catatan pemeriksaan."}
            </p>
          </div>

          <div>
            <label className={EYEBROW}>Nama tampilan</label>
            <input
              value={v.nama}
              onChange={(e) => ubah({ nama: e.target.value })}
              placeholder="Tekep Bushing"
              className={`${FIELD} mt-1 w-full`}
            />
            <p className="text-[11px] text-ink-muted mt-1">
              Boleh diganti kapan saja tanpa memecah angka dashboard.
            </p>
          </div>

          <div>
            <label className={EYEBROW}>Kelompok</label>
            <input
              value={v.kelompok}
              onChange={(e) => ubah({ kelompok: e.target.value })}
              list="hargardu-kelompok"
              placeholder="Bushing"
              className={`${FIELD} mt-1 w-full`}
            />
            <datalist id="hargardu-kelompok">
              {kelompokTersedia.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
            <p className="text-[11px] text-ink-muted mt-1">
              Satu kelompok jadi satu langkah formulir di HP.
            </p>
          </div>

          <div>
            <label className={EYEBROW}>Urutan</label>
            <input
              type="number"
              value={v.urutan}
              onChange={(e) => ubah({ urutan: Number(e.target.value) })}
              className={`${FIELD} mt-1 w-full`}
            />
            <p className="text-[11px] text-ink-muted mt-1">
              Kecil ke besar, mengikuti urutan memeriksa gardu dari atas ke bawah.
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={EYEBROW}>Dinilai</label>
            <select
              value={v.dimensi}
              onChange={(e) => ubah({ dimensi: e.target.value as Dimensi })}
              disabled={bentukTerkunci}
              className={`${FIELD} mt-1 w-full disabled:bg-surface disabled:text-ink-muted`}
            >
              {DIMENSI.map((d) => (
                <option key={d.nilai} value={d.nilai}>
                  {d.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-muted mt-1">
              {DIMENSI.find((d) => d.nilai === v.dimensi)?.bantu}
            </p>
          </div>

          <div>
            <label className={EYEBROW}>Bentuk isian</label>
            <select
              value={v.tipe}
              onChange={(e) => {
                const tipe = e.target.value as TipeItem;
                // Hanya item berpilihan yang punya penilaian normal/tidak normal —
                // dan itulah bahan tiga kelompok di dashboard.
                ubah({ tipe, tampil_dashboard: tipe === "pilihan" && v.tampil_dashboard });
              }}
              disabled={bentukTerkunci}
              className={`${FIELD} mt-1 w-full disabled:bg-surface disabled:text-ink-muted`}
            >
              {TIPE.map((t) => (
                <option key={t.nilai} value={t.nilai}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-ink-muted mt-1">
              {TIPE.find((t) => t.nilai === v.tipe)?.bantu}
            </p>
          </div>
        </div>

        {bentukTerkunci && (
          <p className="flex items-start gap-2 text-xs text-ink-soft bg-surface rounded-xl p-3">
            <Lock size={14} className="mt-0.5 shrink-0 text-ink-muted" />
            <span>
              Item ini sudah dipakai <b>{dipakai.toLocaleString("id-ID")}</b> catatan
              pemeriksaan, jadi bentuk isiannya dikunci. Jawaban lama tercatat menurut bentuk
              yang berlaku saat itu — mengubahnya sekarang membuat jawaban itu tidak cocok
              dengan apa pun saat direkap. Kalau bentuknya memang berubah, nonaktifkan item ini
              dan buat item baru.
            </span>
          </p>
        )}

        {v.tipe === "angka" && (
          <div className="max-w-[200px]">
            <label className={EYEBROW}>Satuan</label>
            <input
              value={v.satuan ?? ""}
              onChange={(e) => ubah({ satuan: e.target.value || null })}
              placeholder="A, mm2, ohm"
              className={`${FIELD} mt-1 w-full`}
            />
          </div>
        )}

        <div className="space-y-2 border-t border-line pt-3">
          <Centang
            nyala={v.wajib}
            onUbah={(x) => ubah({ wajib: x })}
            label="Wajib diisi"
            bantu="Regu tidak bisa menyatakan pekerjaan selesai sebelum item ini terisi."
          />
          <Centang
            nyala={v.tampil_dashboard}
            onUbah={(x) => ubah({ tampil_dashboard: x })}
            mati={v.tipe !== "pilihan"}
            label="Tampilkan di dashboard"
            bantu={
              v.tipe === "pilihan"
                ? "Muncul sebagai batang tiga kelompok: normal · tidak normal · belum diperiksa."
                : "Hanya item berpilihan yang bisa — tiga kelompok dashboard dihitung dari penilaian normal."
            }
          />
          <Centang
            nyala={v.aktif}
            onUbah={(x) => ubah({ aktif: x })}
            label="Aktif"
            bantu="Yang dinonaktifkan hilang dari formulir HP, tapi catatan lamanya tetap terbaca."
          />
        </div>

        <div>
          <label className={EYEBROW}>Keterangan untuk regu</label>
          <textarea
            value={v.keterangan ?? ""}
            onChange={(e) => ubah({ keterangan: e.target.value || null })}
            rows={2}
            placeholder="Opsional — penjelasan singkat yang muncul di bawah isian"
            className={`${FIELD} mt-1 w-full h-auto py-2`}
          />
        </div>
      </div>
    </ModalShell>
  );
}

function Centang({
  nyala,
  onUbah,
  label,
  bantu,
  mati,
}: {
  nyala: boolean;
  onUbah: (x: boolean) => void;
  label: string;
  bantu: string;
  mati?: boolean;
}) {
  return (
    <label className={`flex items-start gap-2.5 ${mati ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={nyala}
        disabled={mati}
        onChange={(e) => onUbah(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-navy-600"
      />
      <span className="min-w-0">
        <span className="text-sm text-ink">{label}</span>
        <span className="block text-[11px] text-ink-muted">{bantu}</span>
      </span>
    </label>
  );
}
