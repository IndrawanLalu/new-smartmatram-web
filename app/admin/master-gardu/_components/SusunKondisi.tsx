"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import type { ItemKondisi } from "../_hooks/useKondisiHargardu";
import { NILAI_BELUM, NILAI_TIDAK_NORMAL } from "../_lib/kondisiGardu";
import {
  judulKondisi, LABEL_MASTER, opsiMaster,
  type GarduFilter, type Kondisi, type KunciMaster,
} from "../_lib/filterGardu";

/** Pilihan master sebanyak ini atau kurang tampil sebagai pil; lebih = daftar. */
const MAKS_PIL = 15;
const KUNCI_MASTER = Object.keys(LABEL_MASTER) as KunciMaster[];
const NOMOR = "w-24 h-8 rounded-lg border border-line bg-white px-2 text-sm focus:outline-none focus:border-navy-500";

interface Props {
  kondisi: Kondisi[];
  onUbah: (k: Kondisi[]) => void;
  item: ItemKondisi[];
  gardu: GarduFilter[];
}

/** Kunci pilihan "+ Tambah kondisi" — satu kriteria hanya boleh dipakai sekali. */
const kunciKondisi = (k: Kondisi) =>
  k.jenis === "har" || k.jenis === "har-angka" ? `har:${k.item}` : k.jenis === "master" ? `master:${k.kunci}` : k.jenis;

export default function SusunKondisi({ kondisi, onUbah, item, gardu }: Props) {
  const petaItem = useMemo(() => new Map(item.map((i) => [i.kode, i])), [item]);
  const terpakai = new Set(kondisi.map(kunciKondisi));
  const kelompok = useMemo(() => {
    const m = new Map<string, ItemKondisi[]>();
    for (const i of item) m.set(i.kelompok, [...(m.get(i.kelompok) ?? []), i]);
    return [...m.entries()];
  }, [item]);

  const ganti = (id: string, baru: Kondisi) => onUbah(kondisi.map((k) => (k.id === id ? baru : k)));

  function tambah(kunci: string) {
    const id = crypto.randomUUID();
    const [jenis, kode] = kunci.split(":");
    if (jenis === "master") onUbah([...kondisi, { id, jenis: "master", kunci: kode as KunciMaster, nilai: [] }]);
    else if (jenis === "beban") onUbah([...kondisi, { id, jenis: "beban", min: null, max: null }]);
    else if (jenis === "ukur") onUbah([...kondisi, { id, jenis: "ukur", dari: null, sampai: null, belum: false }]);
    else if (petaItem.get(kode)?.tipe === "angka") onUbah([...kondisi, { id, jenis: "har-angka", item: kode, min: null, max: null }]);
    else onUbah([...kondisi, { id, jenis: "har", item: kode, nilai: [] }]);
  }

  return (
    <div className="space-y-2.5">
      {kondisi.map((k) => (
        <div key={k.id} className="flex flex-wrap items-center gap-2 pb-2.5 border-b border-line last:border-0">
          <span className="text-xs font-semibold text-ink w-44 shrink-0">
            {judulKondisi(k, (kode) => petaItem.get(kode)?.nama ?? kode)}
            {(k.jenis === "har" || k.jenis === "har-angka") && petaItem.get(k.item)?.dimensi !== "tunggal" && (
              <span className="ml-1 font-normal text-ink-muted">/{petaItem.get(k.item)?.dimensi}</span>
            )}
          </span>
          <Isian k={k} item={petaItem.get(k.jenis === "har" || k.jenis === "har-angka" ? k.item : "")} gardu={gardu} onUbah={(b) => ganti(k.id, b)} />
          <button onClick={() => onUbah(kondisi.filter((x) => x.id !== k.id))} className="ml-auto text-ink-muted hover:text-red-600" title="Hapus kondisi ini">
            <X size={14} />
          </button>
        </div>
      ))}

      <select value="" onChange={(e) => e.target.value && tambah(e.target.value)} className={`${FIELD} text-ink-soft`}>
        <option value="">+ Tambah kondisi…</option>
        <optgroup label="Data master">
          {KUNCI_MASTER.filter((m) => !terpakai.has(`master:${m}`)).map((m) => (
            <option key={m} value={`master:${m}`}>{LABEL_MASTER[m]}</option>
          ))}
        </optgroup>
        <optgroup label="Beban pengukuran">
          {!terpakai.has("beban") && <option value="beban">Beban terakhir (%)</option>}
          {!terpakai.has("ukur") && <option value="ukur">Tgl ukur terakhir</option>}
        </optgroup>
        {kelompok.map(([nama, daftar]) => (
          <optgroup key={nama} label={`Pemeliharaan · ${nama}`}>
            {daftar.filter((i) => !terpakai.has(`har:${i.kode}`)).map((i) => (
              <option key={i.kode} value={`har:${i.kode}`}>{i.nama}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}

function Pil({ on, onClick, children, title, putus }: { on: boolean; onClick: () => void; children: React.ReactNode; title?: string; putus?: boolean }) {
  return (
    <button onClick={onClick} title={title} className={`${CHIP} ${on ? CHIP_ON : putus ? "bg-white border-dashed border-line text-ink-muted hover:border-navy-300" : CHIP_OFF}`}>
      {children}
    </button>
  );
}

const togel = (daftar: string[], v: string) => (daftar.includes(v) ? daftar.filter((x) => x !== v) : [...daftar, v]);
const keAngka = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

function Rentang({ min, max, satuan, onUbah }: { min: number | null; max: number | null; satuan?: string; onUbah: (min: number | null, max: number | null) => void }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-soft">
      <input type="number" inputMode="decimal" placeholder="min" value={min ?? ""} onChange={(e) => onUbah(keAngka(e.target.value), max)} className={NOMOR} />
      s.d.
      <input type="number" inputMode="decimal" placeholder="maks" value={max ?? ""} onChange={(e) => onUbah(min, keAngka(e.target.value))} className={NOMOR} />
      {satuan}
    </span>
  );
}

function Isian({ k, item, gardu, onUbah }: { k: Kondisi; item?: ItemKondisi; gardu: GarduFilter[]; onUbah: (k: Kondisi) => void }) {
  const opsi = useMemo(() => (k.jenis === "master" ? opsiMaster(gardu, k.kunci) : []), [k, gardu]);

  switch (k.jenis) {
    case "har":
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          {(item?.opsi ?? []).map((o) => (
            <Pil key={o.kode} on={k.nilai.includes(o.kode)} onClick={() => onUbah({ ...k, nilai: togel(k.nilai, o.kode) })}>{o.label}</Pil>
          ))}
          {item?.opsi.some((o) => !o.normal) && (
            <Pil on={k.nilai.includes(NILAI_TIDAK_NORMAL)} onClick={() => onUbah({ ...k, nilai: togel(k.nilai, NILAI_TIDAK_NORMAL) })} title="Apa pun yang dinilai tidak normal pada item ini">
              Tidak normal
            </Pil>
          )}
          <Pil putus on={k.nilai.includes(NILAI_BELUM)} onClick={() => onUbah({ ...k, nilai: togel(k.nilai, NILAI_BELUM) })} title="Item ini belum pernah dicatat di gardu tersebut">
            Belum diperiksa
          </Pil>
        </span>
      );
    case "har-angka":
    case "beban":
      return <Rentang min={k.min} max={k.max} satuan={k.jenis === "beban" ? "%" : undefined} onUbah={(min, max) => onUbah({ ...k, min, max })} />;
    case "ukur":
      return (
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
          <input type="date" value={k.dari ?? ""} onChange={(e) => onUbah({ ...k, dari: e.target.value || null })} className={`${NOMOR} w-36`} />
          s.d.
          <input type="date" value={k.sampai ?? ""} onChange={(e) => onUbah({ ...k, sampai: e.target.value || null })} className={`${NOMOR} w-36`} />
          <Pil putus on={k.belum} onClick={() => onUbah({ ...k, belum: !k.belum })}>Belum pernah diukur</Pil>
        </span>
      );
    case "master":
      if (opsi.length <= MAKS_PIL)
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            {opsi.map((o) => <Pil key={o} on={k.nilai.includes(o)} onClick={() => onUbah({ ...k, nilai: togel(k.nilai, o) })}>{o}</Pil>)}
          </span>
        );
      return (
        <span className="flex flex-wrap items-center gap-1.5">
          {k.nilai.map((o) => (
            <Pil key={o} on onClick={() => onUbah({ ...k, nilai: togel(k.nilai, o) })} title="Klik untuk membuang">
              {o} <X size={11} />
            </Pil>
          ))}
          <select value="" onChange={(e) => e.target.value && onUbah({ ...k, nilai: [...k.nilai, e.target.value] })} className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink-soft focus:outline-none focus:border-navy-500">
            <option value="">+ pilih…</option>
            {opsi.filter((o) => !k.nilai.includes(o)).map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </span>
      );
  }
}
