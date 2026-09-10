"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, X, SlidersHorizontal, Loader2 } from "lucide-react";
import { useAcuanKondisi, type ItemKondisi } from "../_hooks/useKondisiHargardu";
import {
  NILAI_TIDAK_NORMAL, NILAI_BELUM, type SaringanKondisi,
} from "../_lib/kondisiGardu";

const PILL =
  "inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap";
const PILL_OFF = "bg-white border-line text-ink-soft hover:border-navy-300";
const PILL_ON = "bg-navy-600 border-navy-600 text-white";

interface Props {
  saringan: SaringanKondisi;
  onUbah: (s: SaringanKondisi) => void;
  /** Ikut dimuat saat halaman ini yang membukanya, bukan sebelum. */
  aktif: boolean;
}

/**
 * Saringan menurut kondisi hasil pemeliharaan gardu.
 *
 * Enam item bertanda `tampil_dashboard` selalu tampak — itulah yang setiap hari
 * ditanyakan (tekep, jumperan, kondisi trafo, sambungan outlet). Sisanya
 * ditambahkan lewat daftar, supaya tiga puluh tiga baris pilihan tidak
 * menenggelamkan enam yang benar-benar dipakai.
 */
export default function SaringanKondisiGardu({ saringan, onUbah, aktif }: Props) {
  const { item, memuat, galat } = useAcuanKondisi(aktif);
  const [terbuka, setTerbuka] = useState(false);
  const [tambahan, setTambahan] = useState<string[]>([]);

  const jumlahAktif = useMemo(
    () => Object.values(saringan).filter((v) => v.length > 0).length,
    [saringan],
  );

  /** Item yang barisnya ditampilkan: bawaan dashboard, yang sedang dipakai
   *  menyaring, dan yang sengaja ditambahkan orang. */
  const tampil = useMemo(() => {
    const kunci = new Set<string>([
      ...item.filter((i) => i.tampilDashboard).map((i) => i.kode),
      ...Object.entries(saringan).filter(([, v]) => v.length > 0).map(([k]) => k),
      ...tambahan,
    ]);
    return item.filter((i) => kunci.has(i.kode));
  }, [item, saringan, tambahan]);

  const bisaDitambah = useMemo(
    () => item.filter((i) => !tampil.some((t) => t.kode === i.kode)),
    [item, tampil],
  );

  const kelompokTambah = useMemo(() => {
    const m = new Map<string, ItemKondisi[]>();
    for (const i of bisaDitambah) m.set(i.kelompok, [...(m.get(i.kelompok) ?? []), i]);
    return [...m.entries()];
  }, [bisaDitambah]);

  function togel(itemKode: string, nilai: string) {
    const ada = saringan[itemKode] ?? [];
    const baru = ada.includes(nilai) ? ada.filter((v) => v !== nilai) : [...ada, nilai];
    const hasil = { ...saringan };
    if (baru.length === 0) delete hasil[itemKode];
    else hasil[itemKode] = baru;
    onUbah(hasil);
  }

  function buang(itemKode: string) {
    const hasil = { ...saringan };
    delete hasil[itemKode];
    onUbah(hasil);
    setTambahan((t) => t.filter((k) => k !== itemKode));
  }

  return (
    <div className="bg-white rounded-xl border border-line">
      <button
        onClick={() => setTerbuka((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-2 text-left"
      >
        <SlidersHorizontal size={14} className="text-accent-deep shrink-0" />
        <span className="text-sm font-semibold text-ink">Kondisi Pemeliharaan Gardu</span>
        {jumlahAktif > 0 && (
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-navy-600 text-white">
            {jumlahAktif} aktif
          </span>
        )}
        {memuat && <Loader2 size={13} className="animate-spin text-ink-muted" />}
        <span className="ml-auto flex items-center gap-3">
          {jumlahAktif > 0 && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onUbah({}); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onUbah({}); } }}
              className="text-xs text-ink-soft hover:text-red-600"
            >
              Hapus semua
            </span>
          )}
          {terbuka ? <ChevronUp size={15} className="text-ink-soft" /> : <ChevronDown size={15} className="text-ink-soft" />}
        </span>
      </button>

      {terbuka && (
        <div className="px-4 pb-4 border-t border-line pt-3 space-y-3">
          {galat && <p className="text-xs text-red-600">{galat}</p>}

          {tampil.map((it) => (
            <BarisItem
              key={it.kode}
              item={it}
              dipilih={saringan[it.kode] ?? []}
              onTogel={(n) => togel(it.kode, n)}
              onBuang={it.tampilDashboard ? undefined : () => buang(it.kode)}
            />
          ))}

          {kelompokTambah.length > 0 && (
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) setTambahan((t) => [...t, e.target.value]);
              }}
              className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink-soft focus:outline-none focus:border-navy-500"
            >
              <option value="">+ Tambah item lain…</option>
              {kelompokTambah.map(([kelompok, daftar]) => (
                <optgroup key={kelompok} label={kelompok}>
                  {daftar.map((i) => (
                    <option key={i.kode} value={i.kode}>{i.nama}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}

          <p className="text-[11px] text-ink-muted leading-relaxed">
            Kondisi diambil dari pemeliharaan <b>terverifikasi terakhir</b> tiap gardu. Pilihan
            di dalam satu item dijumlahkan (atau), antar item disaring bertingkat (dan).
            <b> Belum diperiksa</b> berarti item itu belum pernah dicatat di gardu tersebut —
            bukan berarti keadaannya baik.
          </p>
        </div>
      )}
    </div>
  );
}

function BarisItem({
  item, dipilih, onTogel, onBuang,
}: {
  item: ItemKondisi;
  dipilih: string[];
  onTogel: (nilai: string) => void;
  onBuang?: () => void;
}) {
  const adaTidakNormal = item.opsi.some((o) => !o.normal);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-ink w-40 shrink-0">
        {item.nama}
        {item.dimensi !== "tunggal" && (
          <span className="ml-1 font-normal text-ink-muted">
            /{item.dimensi === "fasa" ? "fasa" : "jurusan"}
          </span>
        )}
      </span>

      {item.opsi.map((o) => {
        const on = dipilih.includes(o.kode);
        return (
          <button
            key={o.kode}
            onClick={() => onTogel(o.kode)}
            className={`${PILL} ${on ? PILL_ON : PILL_OFF}`}
            title={o.normal ? "Dinilai normal" : "Dinilai perlu perbaikan"}
          >
            {!o.normal && (
              <i className={`w-1.5 h-1.5 rounded-full ${on ? "bg-white" : "bg-amber-500"}`} />
            )}
            {o.label}
          </button>
        );
      })}

      {adaTidakNormal && (
        <button
          onClick={() => onTogel(NILAI_TIDAK_NORMAL)}
          className={`${PILL} ${dipilih.includes(NILAI_TIDAK_NORMAL) ? PILL_ON : PILL_OFF}`}
          title="Apa pun yang dinilai tidak normal pada item ini — ikut pilihan baru yang ditambah kemudian"
        >
          Tidak normal
        </button>
      )}

      <button
        onClick={() => onTogel(NILAI_BELUM)}
        className={`${PILL} ${dipilih.includes(NILAI_BELUM) ? PILL_ON : "bg-white border-dashed border-line text-ink-muted hover:border-navy-300"}`}
        title="Item ini belum pernah diperiksa di gardu tersebut"
      >
        Belum diperiksa
      </button>

      {onBuang && (
        <button
          onClick={onBuang}
          className="text-ink-muted hover:text-red-600 ml-auto"
          title="Hilangkan baris ini"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
