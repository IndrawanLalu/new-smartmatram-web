"use client";

import { useMemo, useState } from "react";
import { Crosshair, Loader2, X } from "lucide-react";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { ITEM_JANGGAL, type Janggal, type useKoreksiIsian } from "../_hooks/useKoreksiIsian";
import { GARIS, INPUT, JUDUL_BAGIAN, PANEL } from "../_ui";
import { TOMBOL_PANEL } from "./InfoTiang";

/**
 * Panel koreksi isian inspeksi JTM (10 Okt 2026). Dua cara:
 *   Per rentang — klik tiang awal & akhir di peta (satu penyulang), pilih
 *                 isian & nilai yang benar, Terapkan. Mengikuti jalur kabel,
 *                 cabang lain tidak ikut.
 *   Yang janggal — tiang yang isiannya beda sendiri dari tiang sebelum &
 *                 sesudahnya (70 → 150 → 70); "Samakan".
 */

interface Props {
  k: ReturnType<typeof useKoreksiIsian>;
  ulp: string | null;
  onLompat: (lat: number, lng: number) => void;
  /** Nilai isian ini tertulis di tiap tiang di peta. */
  tampil: boolean;
  onTampil: (v: boolean) => void;
}

export default function PanelKoreksiIsian({ k, ulp, onLompat, tampil, onTampil }: Props) {
  const [tab, setTab] = useState<"rentang" | "janggal">("rentang");
  const [tanyaAlasan, setTanyaAlasan] = useState(false);

  const namaItem = k.daftarItem.find((x) => x.kode === k.item)?.nama ?? k.item;
  const labelNilai = k.opsi.find((o) => o.kode === k.nilai)?.label ?? "";
  const ringkas = useMemo(() => {
    const p = k.pratinjau ?? [];
    return {
      ubah: p.filter((x) => x.ada_jawaban && x.nilai_lama !== k.nilai).length,
      kosong: p.filter((x) => !x.ada_jawaban).length,
    };
  }, [k.pratinjau, k.nilai]);

  const tabKelas = (on: boolean) =>
    `flex-1 py-1.5 rounded-lg text-xs font-semibold border ${on ? "border-[#00897B] bg-[#00897B]/20 text-[#e2e8f0]" : "border-[#1e3552] text-gray-400"}`;

  return (
    <aside
      className="absolute z-[1100] top-14 right-3 bottom-3 w-[320px] max-w-[calc(100%-1.5rem)] rounded-xl border shadow-2xl flex flex-col"
      style={{ background: PANEL, borderColor: GARIS }}
    >
      <div className="flex items-start gap-2 px-4 pt-3 pb-2 border-b" style={{ borderColor: GARIS }}>
        <div className="flex-1 min-w-0">
          <p className={JUDUL_BAGIAN}>Koreksi isian JTM</p>
          <p className="text-[#e2e8f0] font-semibold text-base">{namaItem}</p>
        </div>
        <button onClick={k.keluar} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5" aria-label="Keluar koreksi isian">
          <X size={16} />
        </button>
      </div>

      <div className="px-4 pt-3 space-y-3 overflow-y-auto flex-1 pb-4">
        <label className="block text-xs">
          <span className="text-gray-500">Isian</span>
          <select id="koreksi-item" value={k.item} onChange={(e) => k.gantiItem(e.target.value)} className={`${INPUT} mt-1`}>
            {k.daftarItem.map((x) => <option key={x.kode} value={x.kode}>{x.nama}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-[#e2e8f0]">
          <input id="koreksi-tampil" type="checkbox" checked={tampil} onChange={(e) => onTampil(e.target.checked)} />
          Tampilkan nilai {namaItem.toLowerCase()} di tiap tiang
        </label>

        <div className="flex gap-2">
          <button onClick={() => setTab("rentang")} className={tabKelas(tab === "rentang")}>Per rentang</button>
          <button onClick={() => setTab("janggal")} className={tabKelas(tab === "janggal")}>Yang janggal</button>
        </div>

        {k.galat && <p className="text-xs text-red-300">{k.galat}</p>}

        {tab === "rentang" && (
          <div className="space-y-3 text-xs">
            <ol className="space-y-1.5 text-[#e2e8f0]">
              <li>
                1. Klik <b>tiang awal</b> di peta:{" "}
                <span className={k.dari ? "text-[#5eead4] font-semibold" : "text-gray-500"}>{k.dari?.kode ?? "belum"}</span>
              </li>
              <li>
                2. Klik <b>tiang akhir</b> (penyulang sama):{" "}
                <span className={k.ke ? "text-[#5eead4] font-semibold" : "text-gray-500"}>{k.ke?.kode ?? "belum"}</span>
              </li>
            </ol>
            <p className="text-[11px] text-gray-500">
              Nyalakan dulu penyulangnya di panel kiri. Yang diubah mengikuti jalur kabel di antara kedua tiang; cabang lain tidak
              ikut. Klik tiang lain untuk mulai ulang.
            </p>

            {k.ke && (
              <>
                <label className="block">
                  <span className="text-gray-500">3. Nilai yang benar</span>
                  <select id="koreksi-nilai" value={k.nilai} onChange={(e) => k.setNilai(e.target.value)} className={`${INPUT} mt-1`}>
                    <option value="">— pilih —</option>
                    {k.opsi.map((o) => <option key={o.kode} value={o.kode}>{o.label}</option>)}
                  </select>
                </label>

                {k.sibuk && !k.pratinjau ? (
                  <p className="text-gray-400 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Membaca jalur…</p>
                ) : k.pratinjau ? (
                  <div className="rounded-lg border" style={{ borderColor: GARIS }}>
                    <p className="px-3 py-2 text-[11px] text-gray-400 border-b" style={{ borderColor: GARIS }}>
                      {k.pratinjau.length} tiang di jalur
                      {k.nilai ? ` · ${ringkas.ubah} berubah jadi ${labelNilai}` : ""}
                      {ringkas.kosong ? ` · ${ringkas.kosong} belum pernah dinilai (dilewati)` : ""}
                    </p>
                    <ul className="max-h-[260px] overflow-y-auto divide-y divide-[#1e3552]">
                      {k.pratinjau.map((p) => {
                        const berubah = !!k.nilai && p.ada_jawaban && p.nilai_lama !== k.nilai;
                        return (
                          <li key={p.tiang_id} className="px-3 py-1.5 flex items-center gap-2">
                            <span className="flex-1 min-w-0 truncate text-[#e2e8f0]">{p.tiang_kode}</span>
                            <span className={berubah ? "text-[#FB7185] line-through" : "text-gray-400"}>{p.label_lama ?? "—"}</span>
                            {berubah && <span className="text-[#5eead4] font-semibold">→ {labelNilai}</span>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <button
                  onClick={() => setTanyaAlasan(true)}
                  disabled={!k.nilai || ringkas.ubah === 0 || k.sibuk}
                  className={`${TOMBOL_PANEL} w-full justify-center border-[#00897B] text-[#5eead4] disabled:opacity-40`}
                >
                  Terapkan ke {ringkas.ubah} tiang
                </button>
              </>
            )}
          </div>
        )}

        {tab === "janggal" && (
          <div className="space-y-3 text-xs">
            {!ITEM_JANGGAL.includes(k.item) ? (
              <p className="text-gray-400">
                Pencarian &ldquo;janggal&rdquo; hanya untuk isian yang seragam sepanjang jalur (ukuran & jenis konduktor). Untuk isian ini,
                pakai Per rentang.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-gray-500">
                  Tiang yang isiannya beda sendiri dari tiang sebelum & sesudahnya — hampir pasti salah pilih. Usulan = nilai
                  tiang sebelumnya.
                </p>
                <button onClick={() => void k.cariJanggal(ulp)} disabled={k.sibuk} className={`${TOMBOL_PANEL} w-full justify-center`}>
                  {k.sibuk && <Loader2 size={13} className="animate-spin" />} Cari {ulp ? `di ULP ${ulp}` : "di semua ULP"}
                </button>
                {k.janggal && (
                  <>
                    <p className="text-gray-400">{k.janggal.length ? `${k.janggal.length} tiang janggal` : "Tidak ada yang janggal."}</p>
                    {k.janggal.length > 1 && (
                      <button onClick={() => void k.samakanSemua()} disabled={k.sibuk} className={`${TOMBOL_PANEL} w-full justify-center border-[#00897B] text-[#5eead4]`}>
                        Samakan semua ({k.janggal.length})
                      </button>
                    )}
                    <ul className="divide-y divide-[#1e3552] rounded-lg border" style={{ borderColor: GARIS }}>
                      {k.janggal.map((j: Janggal) => (
                        <li key={j.tiang_id} className="px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2">
                            <button onClick={() => onLompat(j.lat, j.lng)} className="text-gray-400 hover:text-white" aria-label={`Lihat ${j.tiang_kode} di peta`}>
                              <Crosshair size={13} />
                            </button>
                            <span className="flex-1 min-w-0 truncate text-[#e2e8f0] font-semibold" title={j.tiang_kode}>{j.tiang_kode}</span>
                          </div>
                          <div className="flex items-center gap-2 pl-5">
                            <span className="text-gray-500 truncate">{j.penyulang}</span>
                            <span className="text-[#FB7185] line-through">{j.label ?? j.nilai}</span>
                            <span className="text-[#5eead4] font-semibold">→ {j.label_usulan ?? j.usulan}</span>
                            <button onClick={() => void k.samakan(j)} disabled={k.sibuk} className="ml-auto px-2 py-0.5 rounded border border-[#00897B] text-[#5eead4] hover:bg-[#00897B]/20">
                              Samakan
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {tanyaAlasan && k.dari && k.ke && (
        <BatalkanModal
          judul={`Ubah ${namaItem} jadi ${labelNilai}?`}
          keterangan={`${ringkas.ubah} tiang dari ${k.dari.kode} sampai ${k.ke.kode} (penyulang ${k.dari.kelompok}). Nilai lama tercatat di riwayat koreksi.`}
          labelTombol="Terapkan"
          placeholder="Alasan — mis. salah pilih ukuran, sudah dicek di lapangan"
          onTutup={() => setTanyaAlasan(false)}
          onBatalkan={async (alasan) => {
            const ok = await k.terapkan(alasan);
            if (ok) setTanyaAlasan(false);
            return ok;
          }}
        />
      )}
    </aside>
  );
}
