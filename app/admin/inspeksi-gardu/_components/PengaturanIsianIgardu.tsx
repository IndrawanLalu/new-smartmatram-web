"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ITEM_KOSONG, type ItemIsian, type OpsiIsian, type Prioritas, type TipeIsian, type useIsianIgardu } from "../_hooks/useIsianIgardu";

/**
 * Isian lengkap Inspeksi Gardu Tier 1 (inspeksi-gardu-isian.sql): item per
 * bagian, pilihan + normal/tidak, prioritas temuannya, foto wajib, dan item
 * Pemeliharaan Gardu tujuannya. Berlaku di HP tanpa rilis aplikasi. Kode
 * tetap; tidak ada hapus — nonaktifkan saja.
 */

interface Props {
  o: ReturnType<typeof useIsianIgardu>;
  bolehUbah: boolean;
  bolehSakelar: boolean;
  oleh: string;
}

const TIPE: { nilai: TipeIsian; label: string }[] = [
  { nilai: "pilihan", label: "Pilihan" },
  { nilai: "angka", label: "Angka" },
  { nilai: "tahanan", label: "Angka atau tidak ada (grounding)" },
];
const PRIORITAS: Prioritas[] = ["Urgent", "Rawan", "Biasa"];

export default function PengaturanIsianIgardu({ o, bolehUbah, bolehSakelar, oleh }: Props) {
  const toast = useToast();
  const [itemHar, setItemHar] = useState<{ kode: string; nama: string; kelompok: string }[]>([]);
  const [sunting, setSunting] = useState<{ x: ItemIsian; baru: boolean } | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser.from("hargardu_item_ref").select("kode,nama,kelompok").order("urutan").order("kode")
      .then(({ data }) => { if (hidup) setItemHar((data ?? []) as { kode: string; nama: string; kelompok: string }[]); });
    return () => { hidup = false; };
  }, []);

  const bagian = useMemo(() => [...new Set(o.item.map((i) => i.bagian))], [o.item]);
  const namaHar = (k: string | null) => (k ? (itemHar.find((i) => i.kode === k)?.nama ?? k) : "—");

  const simpan = async () => {
    if (!sunting) return;
    setSibuk(true);
    try {
      await o.simpanItem({ ...sunting.x, kode: sunting.x.kode.trim().toLowerCase(), nama: sunting.x.nama.trim(), bagian: sunting.x.bagian.trim() }, oleh);
      toast.success("Isian tersimpan — berlaku di HP saat daftar isian diperbarui.");
      setSunting(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSibuk(false);
    }
  };

  const sakelar = async (nilai: boolean) => {
    try {
      await o.ubahPerbaruiMaster(nilai, oleh);
      toast.success(nilai ? "Isian berkolom master kini memperbarui master gardu saat disetujui." : "Master gardu tidak diubah dari inspeksi.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
    }
  };

  return (
    <div className={`${CARD} p-5 flex flex-col gap-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={EYEBROW}>Isian Tier 1</p>
          <p className="text-xs text-ink-soft mt-1 max-w-2xl">
            Daftar yang diperiksa regu di HP, halaman per bagian. Pilihan yang <b>tidak normal</b> otomatis jadi temuan
            dan masuk Perlu Perbaikan sebagai item pemeliharaan tujuannya. Isian berfoto wajib satu foto.
          </p>
        </div>
        {bolehUbah && (
          <button onClick={() => setSunting({ x: { ...ITEM_KOSONG, bagian: bagian[0] ?? "" }, baru: true })} className={BTN_GHOST}>
            <Plus size={14} /> Tambah isian
          </button>
        )}
      </div>

      <label className={`flex items-start gap-2 text-xs rounded-lg border border-line px-3 py-2 ${bolehSakelar ? "" : "opacity-60"}`}>
        <input type="checkbox" className="accent-navy-600 mt-0.5" checked={o.perbaruiMaster} disabled={!bolehSakelar || o.loading}
          onChange={(e) => void sakelar(e.target.checked)} />
        <span>
          <b className="text-ink">Perbarui master gardu dari inspeksi</b> — saat inspeksi disetujui, isian yang punya
          &quot;kolom master&quot; menulis nilainya ke master gardu. {o.perbaruiMaster ? "HIDUP." : "Mati (keputusan 10 Nov)."}
          {!bolehSakelar && " Hanya UP3."}
        </span>
      </label>

      {o.galat && <p className="text-xs text-red-700">{o.galat}</p>}
      {o.loading ? (
        <p className="text-xs text-ink-muted"><Loader2 size={12} className="inline animate-spin" /> Memuat…</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead className="kepala-kit bg-surface">
            <tr className="text-left text-[11px] text-ink-soft">
              <th className="px-3 py-2 border-b border-line">Bagian</th>
              <th className="px-3 py-2 border-b border-line">Isian</th>
              <th className="px-3 py-2 border-b border-line">Pilihan (merah = temuan)</th>
              <th className="px-3 py-2 border-b border-line">Item pemeliharaan</th>
              <th className="px-3 py-2 border-b border-line" />
            </tr>
          </thead>
          <tbody>
            {o.item.map((i) => (
              <tr key={i.kode} className={i.aktif ? "" : "opacity-50"}>
                <td className="px-3 py-2 border-b border-line text-xs text-ink-soft">{i.bagian}</td>
                <td className="px-3 py-2 border-b border-line">
                  <b className="text-ink">{i.nama}</b>
                  <span className="ml-1.5 text-[11px] text-ink-muted">
                    {i.tipe === "pilihan" ? "" : `${i.satuan ?? ""} `}
                    {i.rincian.length > 0 ? `${i.perJurusan ? "per jurusan · " : ""}${i.rincian.join(" ")}` : ""}
                    {i.foto ? " · berfoto" : ""}{i.wajib ? "" : " · boleh kosong"}{i.aktif ? "" : " · nonaktif"}
                  </span>
                </td>
                <td className="px-3 py-2 border-b border-line text-xs">
                  {i.tipe === "angka" ? <span className="text-ink-muted">angka</span> : (
                    <span className="flex flex-wrap gap-1">
                      {i.tipe === "tahanan" && <span className="px-1.5 rounded bg-surface text-ink-soft">angka Ω</span>}
                      {i.opsi.filter((x) => x.aktif).map((x) => (
                        <span key={x.kode} className={`px-1.5 rounded ${x.normal ? "bg-surface text-ink-soft" : "bg-red-50 text-red-700"}`}>
                          {x.label}{x.normal ? "" : ` · ${x.prioritas}`}
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 border-b border-line text-xs text-ink-soft">{i.tipe === "angka" ? "—" : namaHar(i.itemTl)}</td>
                <td className="px-3 py-2 border-b border-line text-right">
                  {bolehUbah && <button onClick={() => setSunting({ x: i, baru: false })} className="text-[11px] font-semibold text-navy-600 hover:underline">Ubah</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {sunting && (
        <FormIsian
          x={sunting.x}
          baru={sunting.baru}
          bagian={bagian}
          itemHar={itemHar}
          sibuk={sibuk}
          onUbah={(x) => setSunting({ ...sunting, x })}
          onBatal={() => setSunting(null)}
          onSimpan={() => void simpan()}
        />
      )}
    </div>
  );
}

interface FormProps {
  x: ItemIsian;
  baru: boolean;
  bagian: string[];
  itemHar: { kode: string; nama: string; kelompok: string }[];
  sibuk: boolean;
  onUbah: (x: ItemIsian) => void;
  onBatal: () => void;
  onSimpan: () => void;
}

function FormIsian({ x, baru, bagian, itemHar, sibuk, onUbah, onBatal, onSimpan }: FormProps) {
  const ubah = (p: Partial<ItemIsian>) => onUbah({ ...x, ...p });
  const ubahOpsi = (i: number, p: Partial<OpsiIsian>) => ubah({ opsi: x.opsi.map((y, j) => (j === i ? { ...y, ...p } : y)) });
  const pakaiOpsi = x.tipe !== "angka";
  const boleh = x.kode.trim() && x.nama.trim() && x.bagian.trim() && (!pakaiOpsi || x.opsi.every((y) => y.kode.trim() && y.label.trim()));

  return (
    <ModalShell
      title={baru ? "Tambah isian" : `Ubah isian ${x.nama}`}
      subtitle="Berlaku di HP setelah daftar isian diperbarui (tarik daftar ke bawah)."
      maxWidth="max-w-3xl"
      onClose={onBatal}
      footer={
        <>
          <button onClick={onBatal} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={onSimpan} className={BTN_PRIMARY} disabled={sibuk || !boleh}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-3 gap-3 text-xs">
        <label>
          <span className={EYEBROW}>Kode</span>
          <input value={x.kode} disabled={!baru} onChange={(e) => ubah({ kode: e.target.value })} placeholder="mis. busbar_tr"
            className={`${FIELD} mt-1 block w-full font-mono disabled:opacity-60`} />
        </label>
        <label>
          <span className={EYEBROW}>Nama di HP</span>
          <input value={x.nama} onChange={(e) => ubah({ nama: e.target.value })} className={`${FIELD} mt-1 block w-full`} />
        </label>
        <label>
          <span className={EYEBROW}>Bagian (halaman)</span>
          <input value={x.bagian} list="igardu-bagian" onChange={(e) => ubah({ bagian: e.target.value })} className={`${FIELD} mt-1 block w-full`} />
          <datalist id="igardu-bagian">{bagian.map((b) => <option key={b} value={b} />)}</datalist>
        </label>
        <label>
          <span className={EYEBROW}>Bentuk isian</span>
          <select value={x.tipe} onChange={(e) => ubah({ tipe: e.target.value as TipeIsian })} className={`${FIELD} mt-1 block w-full`}>
            {TIPE.map((t) => <option key={t.nilai} value={t.nilai}>{t.label}</option>)}
          </select>
        </label>
        {x.tipe !== "pilihan" && (
          <label>
            <span className={EYEBROW}>Satuan</span>
            <input value={x.satuan ?? ""} onChange={(e) => ubah({ satuan: e.target.value || null })} placeholder="V, A, Ω"
              className={`${FIELD} mt-1 block w-full`} />
          </label>
        )}
        {x.tipe === "angka" && (
          <label>
            <span className={EYEBROW}>Rincian (pisah spasi)</span>
            <input value={x.rincian.join(" ")} onChange={(e) => ubah({ rincian: e.target.value.split(/\s+/).filter(Boolean) })}
              placeholder="R S T N" className={`${FIELD} mt-1 block w-full font-mono`} />
          </label>
        )}
        <label>
          <span className={EYEBROW}>Urutan</span>
          <input value={x.urutan} inputMode="numeric" onChange={(e) => ubah({ urutan: Number(e.target.value.replace(/\D/g, "")) || 0 })}
            className={`${FIELD} mt-1 block w-full text-right`} />
        </label>
        {x.tipe !== "angka" && (
          <label className="sm:col-span-2">
            <span className={EYEBROW}>Item pemeliharaan tujuan temuan</span>
            <select value={x.itemTl ?? ""} onChange={(e) => ubah({ itemTl: e.target.value || null })} className={`${FIELD} mt-1 block w-full`}>
              <option value="">Temuan lain (Inspeksi Gardu)</option>
              {itemHar.filter((i) => i.kode !== "isian_igardu").map((i) => <option key={i.kode} value={i.kode}>{i.kelompok} · {i.nama}</option>)}
            </select>
          </label>
        )}
        <label>
          <span className={EYEBROW}>Kolom master gardu</span>
          <input value={x.kolomMaster ?? ""} onChange={(e) => ubah({ kolomMaster: e.target.value.trim() || null })} placeholder="kosong = tidak"
            className={`${FIELD} mt-1 block w-full font-mono`} />
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-xs">
        {x.tipe === "angka" && (
          <label className="flex items-center gap-2"><input type="checkbox" className="accent-navy-600" checked={x.perJurusan} onChange={(e) => ubah({ perJurusan: e.target.checked })} /> Per jurusan (A–D)</label>
        )}
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-navy-600" checked={x.foto} onChange={(e) => ubah({ foto: e.target.checked })} /> Wajib satu foto</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-navy-600" checked={x.wajib} onChange={(e) => ubah({ wajib: e.target.checked })} /> Wajib diisi</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="accent-navy-600" checked={x.aktif} onChange={(e) => ubah({ aktif: e.target.checked })} /> Aktif</label>
      </div>

      {pakaiOpsi && (
        <div>
          <p className={`${EYEBROW} mb-1.5`}>{x.tipe === "tahanan" ? "Pilihan selain angka" : "Pilihan"}</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] text-ink-muted">
                <th className="pr-2 font-normal">Kode</th><th className="pr-2 font-normal">Nama di HP</th>
                <th className="pr-2 font-normal">Normal</th><th className="pr-2 font-normal">Prioritas temuan</th>
                <th className="pr-2 font-normal">Aktif</th><th />
              </tr>
            </thead>
            <tbody>
              {x.opsi.map((y, i) => (
                <tr key={i}>
                  <td className="pr-2 py-1">
                    <input value={y.kode} onChange={(e) => ubahOpsi(i, { kode: e.target.value })} className={`${FIELD} w-[110px] font-mono`} />
                  </td>
                  <td className="pr-2 py-1">
                    <input value={y.label} onChange={(e) => ubahOpsi(i, { label: e.target.value })} className={`${FIELD} w-full`} />
                  </td>
                  <td className="pr-2 py-1"><input type="checkbox" className="accent-navy-600" checked={y.normal} onChange={(e) => ubahOpsi(i, { normal: e.target.checked })} /></td>
                  <td className="pr-2 py-1">
                    <select value={y.prioritas} disabled={y.normal} onChange={(e) => ubahOpsi(i, { prioritas: e.target.value as Prioritas })} className={`${FIELD} disabled:opacity-40`}>
                      {PRIORITAS.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className="pr-2 py-1"><input type="checkbox" className="accent-navy-600" checked={y.aktif} onChange={(e) => ubahOpsi(i, { aktif: e.target.checked })} /></td>
                  <td className="py-1">
                    {/* Pilihan yang sudah tersimpan hanya bisa dinonaktifkan; yang baru boleh dibuang. */}
                    {baru && (
                      <button onClick={() => ubah({ opsi: x.opsi.filter((_, j) => j !== i) })} className="text-ink-muted hover:text-red-600" aria-label="Buang pilihan">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => ubah({ opsi: [...x.opsi, { kode: "", label: "", normal: true, prioritas: "Biasa", urutan: x.opsi.length + 1, aktif: true }] })}
            className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-navy-600 hover:underline"
          >
            <Plus size={12} /> Tambah pilihan
          </button>
        </div>
      )}
    </ModalShell>
  );
}
