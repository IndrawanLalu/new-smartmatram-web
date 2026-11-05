"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { META } from "../_lib/kinerjaMeta";
import {
  KELOMPOK, kunciKategori, kunciTindakan, NAMA_KELOMPOK, NAMA_LAPORAN, NAMA_MODUL_TINDAKAN, namaSumber,
  SUMBER_DRONE, SUMBER_JTM2_TITIK, type BarisLm, type Kategori, type Kelompok, type Laporan, type Tindakan,
} from "../_lib/lm4dx";

/**
 * Daftar baris spreadsheet LM 4DX (`lm4dx_baris`) dan sumber angkanya di
 * SMART. Urutan WAJIB sama dengan spreadsheet — salinan ditempel apa adanya.
 * Per ULP (lm-baris-per-ulp.sql): admin mengatur ULP-nya, UP3 semua termasuk
 * "Semua ULP" (dijaga RLS).
 */

interface Props {
  laporan: Laporan;
  /** ULP pemilik daftar; "SEMUA" = daftar tampilan Semua ULP (ulp NULL). */
  ulp: string;
  baris: BarisLm[];
  kategori: Kategori[];
  tindakan: Tindakan[];
  oleh: string;
  onTutup: () => void;
  onTersimpan: () => void;
}

/** Pemeliharaan Jaringan dipilih per kategori, bukan seluruhnya. */
const JENIS_SUMBER = META.filter((m) => m.kunci !== "harjtm");
const IKON = "p-1 rounded text-ink-soft hover:bg-surface hover:text-ink disabled:opacity-30";

const KHUSUS = [SUMBER_DRONE, SUMBER_JTM2_TITIK];

export default function AturLm4dxModal({ laporan, ulp, baris, kategori, tindakan, oleh, onTutup, onTersimpan }: Props) {
  const toast = useToast();
  const [isi, setIsi] = useState<BarisLm[]>(baris);
  const [sibuk, setSibuk] = useState(false);
  const namaKategori = new Map(kategori.map((k) => [k.kode, k.label]));
  const namaTindakan = new Map(tindakan.map((t) => [t.kode, `${NAMA_MODUL_TINDAKAN[t.modul]} · ${t.nama}`]));

  const ubah = (i: number, patch: Partial<BarisLm>) => setIsi((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const geser = (i: number, arah: -1 | 1) => setIsi((xs) => {
    const ys = [...xs];
    [ys[i], ys[i + arah]] = [ys[i + arah], ys[i]];
    return ys;
  });
  const tambah = () => setIsi((xs) => [...xs, { id: crypto.randomUUID(), urutan: xs.length + 1, uraian: "", sumber: [], kelompok: xs.at(-1)?.kelompok ?? null }]);

  const kosong = isi.some((b) => !b.uraian.trim());
  const namaUlp = ulp === "SEMUA" ? "Semua ULP" : ulp;

  const simpan = async () => {
    setSibuk(true);
    const tetap = new Set(isi.map((b) => b.id));
    const hapus = baris.filter((b) => !tetap.has(b.id)).map((b) => b.id);
    if (hapus.length) {
      const { error } = await supabaseBrowser.from("lm4dx_baris").delete().in("id", hapus);
      if (error) { setSibuk(false); toast.error(error.message); return; }
    }
    const { error } = await supabaseBrowser.from("lm4dx_baris").upsert(
      isi.map((b, i) => ({
        id: b.id, laporan, ulp: ulp === "SEMUA" ? null : ulp, urutan: i + 1, uraian: b.uraian.trim(), sumber: b.sumber, kelompok: b.kelompok,
        updated_at: new Date().toISOString(), updated_by: oleh,
      })),
    );
    setSibuk(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Daftar baris ${NAMA_LAPORAN[laporan]} ${namaUlp} tersimpan (${isi.length} baris).`);
    onTersimpan();
    onTutup();
  };

  const footer = (
    <>
      <button onClick={tambah} className={`${BTN_GHOST} mr-auto`} disabled={sibuk}><Plus size={14} /> Tambah baris</button>
      <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
      <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk || kosong}>
        {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
      </button>
    </>
  );

  return (
    <ModalShell
      title={`Baris ${NAMA_LAPORAN[laporan]} · ${namaUlp}`}
      subtitle="Urutan sama persis dengan baris di spreadsheet — tiap baris boleh lebih dari satu sumber (dijumlahkan)"
      maxWidth="max-w-4xl"
      onClose={onTutup}
      footer={footer}
    >
      <div className="flex flex-col divide-y divide-line">
        {isi.map((b, i) => (
          <div key={b.id} className="py-2 flex items-start gap-2">
            <span className="w-6 pt-2 text-right text-xs text-ink-muted tabular-nums">{i + 1}.</span>
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex gap-1.5">
                <select
                  value={b.kelompok ?? ""}
                  onChange={(e) => ubah(i, { kelompok: (e.target.value || null) as Kelompok | null })}
                  className={`${FIELD} w-[110px] text-xs`}
                  aria-label="Kelompok"
                >
                  <option value="">Tanpa kelompok</option>
                  {KELOMPOK.map((k) => <option key={k} value={k}>{NAMA_KELOMPOK[k]}</option>)}
                </select>
                <input
                  value={b.uraian}
                  onChange={(e) => ubah(i, { uraian: e.target.value })}
                  placeholder="Uraian pekerjaan seperti di spreadsheet"
                  className={`${FIELD} flex-1 min-w-0 text-xs`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {b.sumber.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-2 py-0.5 text-[11px] font-medium">
                    {namaSumber(s, namaKategori, namaTindakan)}
                    <button onClick={() => ubah(i, { sumber: b.sumber.filter((x) => x !== s) })} aria-label="Lepas sumber">
                      <X size={11} />
                    </button>
                  </span>
                ))}
                <select
                  value=""
                  onChange={(e) => e.target.value && ubah(i, { sumber: [...b.sumber, e.target.value] })}
                  className="text-[11px] border border-line rounded-md px-1.5 py-0.5 text-ink-soft bg-white"
                >
                  <option value="">{b.sumber.length ? "+ sumber" : "Tidak dari SMART — pilih sumber…"}</option>
                  <optgroup label="Rekap Kinerja">
                    {JENIS_SUMBER.filter((m) => !b.sumber.includes(m.kunci)).map((m) => (
                      <option key={m.kunci} value={m.kunci}>{m.jenis}</option>
                    ))}
                  </optgroup>
                  {KHUSUS.some((k) => !b.sumber.includes(k)) && (
                    <optgroup label="Khusus">
                      {KHUSUS.filter((k) => !b.sumber.includes(k)).map((k) => (
                        <option key={k} value={k}>{namaSumber(k, namaKategori)}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Pemeliharaan Jaringan · kategori">
                    {kategori.filter((k) => !b.sumber.includes(kunciKategori(k.kode))).map((k) => (
                      <option key={k.kode} value={kunciKategori(k.kode)}>{k.label}</option>
                    ))}
                  </optgroup>
                  {(["hargardu", "penyeimbangan"] as const).map((m) => (
                    <optgroup key={m} label={`${NAMA_MODUL_TINDAKAN[m]} · pekerjaan yang dikerjakan`}>
                      {tindakan.filter((t) => t.modul === m && !b.sumber.includes(kunciTindakan(t.kode))).map((t) => (
                        <option key={t.kode} value={kunciTindakan(t.kode)}>{t.nama}{t.aktif ? "" : " (nonaktif)"}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-0.5 pt-1">
              <button onClick={() => geser(i, -1)} disabled={i === 0} className={IKON} aria-label="Naik"><ArrowUp size={14} /></button>
              <button onClick={() => geser(i, 1)} disabled={i === isi.length - 1} className={IKON} aria-label="Turun"><ArrowDown size={14} /></button>
              <button onClick={() => setIsi((xs) => xs.filter((_, j) => j !== i))} className={`${IKON} hover:text-red-600`} aria-label="Hapus baris">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-ink-soft leading-relaxed">
        Baris tanpa sumber tetap ikut tersalin (kosong) supaya letak baris di spreadsheet tidak bergeser.
        Kelompok hanya judul di tabel (tidak ikut tersalin) — susun barisnya berurutan per kelompok supaya
        judulnya tidak berulang.
      </p>
    </ModalShell>
  );
}
