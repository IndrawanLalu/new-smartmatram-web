"use client";

import { useState } from "react";
import { Check, Plus, Trash2, TriangleAlert } from "lucide-react";
import { BTN_GHOST, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { OpsiRef } from "../_hooks/usePengaturanRef";

interface Props {
  itemKode: string;
  opsi: OpsiRef[];
  /** Berapa catatan pemeriksaan memakai tiap pilihan, dikunci "item/kode". */
  pakai: Record<string, number>;
  onSimpan: (v: OpsiRef) => Promise<boolean>;
  onHapus: (itemKode: string, kode: string) => Promise<boolean>;
}

export default function OpsiEditor({ itemKode, opsi, pakai, onSimpan, onHapus }: Props) {
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [normal, setNormal] = useState(true);

  const tambah = async () => {
    const urutan = opsi.reduce((m, o) => Math.max(m, o.urutan), 0) + 10;
    const berhasil = await onSimpan({
      item_kode: itemKode,
      kode,
      label,
      normal,
      urutan,
      aktif: true,
    });
    if (berhasil) {
      setKode("");
      setLabel("");
      setNormal(true);
    }
  };

  return (
    <div className="bg-surface/60 border-t border-line px-4 py-3">
      <p className={EYEBROW}>Pilihan jawaban</p>
      <p className="text-[11px] text-ink-muted mt-0.5 max-w-2xl">
        Kosakatanya harus kata yang benar-benar dipakai regu — dari sinilah saringan dan angka
        dashboard diambil. Yang ditandai <b>temuan</b> otomatis masuk daftar Perlu Perbaikan
        selama pemeliharaan berikutnya belum mencatatnya normal.
      </p>

      <div className="mt-2.5 space-y-1.5">
        {opsi.map((o) => (
          <BarisOpsi
            key={o.kode}
            o={o}
            dipakai={pakai[`${o.item_kode}/${o.kode}`] ?? 0}
            onSimpan={onSimpan}
            onHapus={onHapus}
          />
        ))}
        {opsi.length === 0 && (
          <p className="text-xs text-ink-muted py-1">
            Belum ada pilihan. Selama daftarnya kosong, regu tidak bisa mengisi item ini.
          </p>
        )}
      </div>

      {/* ── Tambah pilihan ── */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input
          value={kode}
          onChange={(e) => setKode(e.target.value)}
          placeholder="kode (rembes)"
          className={`${FIELD} font-mono w-[150px]`}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label tampilan (Rembes)"
          className={`${FIELD} w-[220px]`}
        />
        <TombolNormal nyala={normal} onUbah={setNormal} />
        <button
          onClick={() => void tambah()}
          disabled={!kode.trim() || !label.trim()}
          className={BTN_GHOST}
        >
          <Plus size={15} /> Tambah
        </button>
      </div>
    </div>
  );
}

function BarisOpsi({
  o,
  dipakai,
  onSimpan,
  onHapus,
}: {
  o: OpsiRef;
  dipakai: number;
  onSimpan: (v: OpsiRef) => Promise<boolean>;
  onHapus: (itemKode: string, kode: string) => Promise<boolean>;
}) {
  const [label, setLabel] = useState(o.label);
  const [urutan, setUrutan] = useState(String(o.urutan));

  const simpan = (patch: Partial<OpsiRef>) =>
    void onSimpan({ ...o, label, urutan: Number(urutan) || o.urutan, ...patch });

  const hapus = () => {
    if (!confirm(`Hapus pilihan "${o.label}"? Pilihan ini belum pernah dipakai.`)) return;
    void onHapus(o.item_kode, o.kode);
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${o.aktif ? "" : "opacity-55"}`}>
      <input
        value={urutan}
        onChange={(e) => setUrutan(e.target.value)}
        onBlur={() => Number(urutan) !== o.urutan && simpan({})}
        className={`${FIELD} w-[64px] text-center tabular-nums`}
        aria-label="Urutan"
      />
      <span className="font-mono text-[11px] text-ink-muted w-[150px] truncate" title={o.kode}>
        {o.kode}
      </span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== o.label && simpan({})}
        className={`${FIELD} w-[220px]`}
        aria-label="Label"
      />
      <TombolNormal nyala={o.normal} onUbah={(x) => simpan({ normal: x })} />

      <button
        onClick={() => simpan({ aktif: !o.aktif })}
        className={`${BTN_GHOST} h-8 px-2.5 text-xs`}
        title={
          o.aktif
            ? "Sembunyikan dari formulir HP. Catatan lama tetap terbaca."
            : "Munculkan lagi di formulir HP."
        }
      >
        {o.aktif ? "Aktif" : "Nonaktif"}
      </button>

      {dipakai > 0 ? (
        <span
          className="text-[11px] text-ink-muted"
          title="Sudah dipakai catatan pemeriksaan — hanya bisa dinonaktifkan, tidak dihapus. Menghapusnya membuat laporan lama menunjuk pilihan yang tidak ada lagi."
        >
          dipakai {dipakai.toLocaleString("id-ID")}×
        </span>
      ) : (
        <button
          onClick={hapus}
          className="text-ink-muted hover:text-danger p-1"
          title="Hapus — belum pernah dipakai"
          aria-label={`Hapus pilihan ${o.label}`}
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function TombolNormal({ nyala, onUbah }: { nyala: boolean; onUbah: (x: boolean) => void }) {
  return (
    <button
      onClick={() => onUbah(!nyala)}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border transition-colors ${
        nyala
          ? "bg-accent-tint border-accent-tint text-accent-deep"
          : "bg-attention-tint border-attention-tint text-attention"
      }`}
      title={
        nyala
          ? "Dianggap keadaan normal — tidak masuk daftar perbaikan."
          : "Dianggap temuan — masuk daftar Perlu Perbaikan sampai pemeliharaan berikutnya mencatatnya normal."
      }
    >
      {nyala ? <Check size={13} /> : <TriangleAlert size={13} />}
      {nyala ? "Normal" : "Temuan"}
    </button>
  );
}
