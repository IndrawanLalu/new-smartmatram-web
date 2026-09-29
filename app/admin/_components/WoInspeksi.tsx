"use client";

import { useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import SusunWoSegmen, { type IstilahWo } from "@/app/admin/_components/SusunWoSegmen";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { CurrentUser } from "@/lib/roles";
import { useWoInspeksi, type ItemWoInspeksi, type JenisWoInspeksi } from "@/app/admin/_hooks/useWoInspeksi";
import { useSlaBulanan } from "@/app/admin/_hooks/useSlaBulanan";

/**
 * Tab Susun WO inspeksi JTM / JTR (J4, J5c `rencana-mobile-jtm-jtr.md`):
 * terbitkan WO bersatuan segmen (JTM) atau gardu (JTR), diukur KMS, lalu
 * daftar item yang masih terbuka — tim bisa dipindah, item bisa dikeluarkan
 * dari WO dengan alasan.
 *
 * Pola pembatalan sama dengan WO Perabasan (`wo-batal-semua.sql`): item yang
 * SUDAH DIINSPEKSI tidak bisa dikeluarkan; beberapa item bisa dikeluarkan
 * sekaligus lewat centang; WO yang salah dibatalkan beserta alasannya — hanya
 * selama belum ada satu item pun yang diinspeksi.
 */

const reguKosong = (ulp: string) =>
  `ULP ${ulp} belum punya petugas aktif di Manajemen Petugas yang grupnya role inspeksi ini (role bermenu HP JTM/JTR di Kelola Role). WO tetap bisa terbit — semua tim se-ULP melihatnya di HP.`;

const ISTILAH: Record<JenisWoInspeksi, IstilahWo> = {
  JTM: { judul: "Susun WO inspeksi JTM", contohNama: "Inspeksi JTM Oktober 2026", reguWajib: false, reguKosong },
  JTR: { judul: "Susun WO inspeksi JTR", contohNama: "Inspeksi JTR Oktober 2026", reguWajib: false, reguKosong, satuan: "gardu" },
};

const PAGE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top text-xs";
const kms = (v: number | null) => (v === null ? "—" : v.toFixed(2).replace(".", ","));

/** Belum ada inspeksi yang berjalan = masih boleh keluar dari WO. */
const belumDiinspeksi = (x: ItemWoInspeksi) => !x.inspeksi_status;

/** Tahap item DITURUNKAN dari inspeksi terakhirnya. */
const tahap = (x: ItemWoInspeksi) => {
  switch (x.inspeksi_status) {
    case "Dalam Proses":
    case "Dijadwalkan": return { teks: "Sedang diinspeksi", cls: "bg-sky-50 text-sky-700 border-sky-200" };
    case "Selesai": return { teks: "Menunggu persetujuan", cls: "bg-amber-50 text-amber-700 border-amber-200" };
    case "Ditolak": return { teks: "Dikembalikan", cls: "bg-orange-50 text-orange-700 border-orange-200" };
    default: return { teks: "Belum dimulai", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  }
};

export default function WoInspeksi({ user, jenis }: { user: CurrentUser; jenis: JenisWoInspeksi }) {
  const w = useWoInspeksi(jenis);
  const slaBulan = useSlaBulanan(jenis === "JTM" ? "jtm" : "jtr");
  const satuan = jenis === "JTM" ? "segmen" : "gardu";
  const Satuan = jenis === "JTM" ? "Segmen" : "Gardu";
  const oleh = user.name ?? user.email;
  const [halaman, setHalaman] = useState(1);
  const [batal, setBatal] = useState<ItemWoInspeksi | null>(null);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [keluarkan, setKeluarkan] = useState(false);
  const [batalWo, setBatalWo] = useState<{ id: string; nama: string } | null>(null);

  const total = Math.max(1, Math.ceil(w.item.length / PAGE));
  const hal = Math.min(halaman, total);
  const tampil = w.item.slice((hal - 1) * PAGE, hal * PAGE);
  const dipilih = w.item.filter((x) => pilih.has(x.id) && belumDiinspeksi(x));
  const bisaDiHal = tampil.filter(belumDiinspeksi).map((x) => x.id);
  const semuaHal = bisaDiHal.length > 0 && bisaDiHal.every((id) => pilih.has(id));
  const ubahPilih = (id: string[], aktif: boolean) =>
    setPilih((p) => {
      const n = new Set(p);
      for (const x of id) {
        if (aktif) n.add(x);
        else n.delete(x);
      }
      return n;
    });

  /** WO yang masih berjalan, dari item terbukanya — bahan tombol Batalkan WO. */
  const woBerjalan = [...new Map(w.item.map((x) => [x.wo_id, x.wo_nama])).entries()].map(([id, nama]) => {
    const isi = w.item.filter((x) => x.wo_id === id);
    return { id, nama, n: isi.length, jalan: isi.filter((x) => !belumDiinspeksi(x)).length };
  });

  if (w.loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat {satuan} & WO…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SusunWoSegmen
        user={user}
        istilah={ISTILAH[jenis]}
        segmen={w.objek}
        segmenTerikat={w.objekTerikat}
        regu={w.regu}
        woTerbuka={[]}
        infoSla={(u, tgl) => ({ sla: slaBulan(u, tgl), terbit: w.terbitBulan(u, tgl) })}
        onTerbitkan={(v) => w.terbitkan({ ...v, oleh })}
      />

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-4">
          <p className={EYEBROW}>WO inspeksi berjalan</p>
          <p className="text-xs text-ink-soft mt-1">
            {Satuan} WO yang belum disetujui. Item tertutup sendiri begitu inspeksinya disetujui di Daftar
            Inspeksi. Yang sudah diinspeksi regu tidak bisa dikeluarkan dari WO.
          </p>
          {woBerjalan.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {woBerjalan.map((b) => (
                <span key={b.id} className="inline-flex items-center gap-2 h-8 pl-3 pr-1.5 rounded-full border border-line bg-white text-xs text-ink-soft">
                  <b className="text-ink">{b.nama}</b> {b.n} {satuan}
                  <button
                    onClick={() => setBatalWo({ id: b.id, nama: b.nama })}
                    disabled={b.jalan > 0}
                    title={b.jalan > 0 ? `${b.jalan} ${satuan} sudah diinspeksi — WO tidak bisa dibatalkan` : "Batalkan WO ini"}
                    className="h-6 px-2 rounded-full text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    Batalkan WO
                  </button>
                </span>
              ))}
            </div>
          )}
          {dipilih.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 bg-navy-50/60 px-4 py-2.5 text-sm">
              <span className="text-ink">
                <b className="tabular-nums">{dipilih.length}</b> {satuan} dipilih ·{" "}
                {kms(dipilih.reduce((n, x) => n + (x.panjang_km ?? 0), 0))} KMS
              </span>
              <button onClick={() => setPilih(new Set())} className="text-xs text-ink-soft hover:text-ink">Batal pilih</button>
              <button onClick={() => setKeluarkan(true)} className={`${BTN_GHOST} ml-auto text-red-700`}>
                <Ban size={14} /> Keluarkan dari WO ({dipilih.length})
              </button>
            </div>
          )}
        </div>
        {w.item.length === 0 ? (
          <p className="text-xs text-ink-muted px-5 pb-6">Belum ada WO inspeksi yang berjalan.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-surface">
                  <tr>
                    <th className={`${TH} w-8`}>
                      <input
                        type="checkbox"
                        checked={semuaHal}
                        disabled={bisaDiHal.length === 0}
                        onChange={() => ubahPilih(bisaDiHal, !semuaHal)}
                        className="accent-navy-600"
                        aria-label={`Pilih semua ${satuan} di halaman ini yang belum diinspeksi`}
                      />
                    </th>
                    <th className={TH}>{Satuan}</th>
                    <th className={TH}>WO</th>
                    <th className={`${TH} text-right`}>KMS</th>
                    <th className={TH}>Tim</th>
                    <th className={TH}>Tahap</th>
                    <th className={TH} />
                  </tr>
                </thead>
                <tbody>
                  {tampil.map((x) => {
                    const t = tahap(x);
                    const timUlp = w.regu.filter((g) => g.ulp === x.ulp);
                    return (
                      <tr key={x.id} className={pilih.has(x.id) ? "bg-navy-50/70" : "hover:bg-navy-50/40"}>
                        <td className={TD}>
                          {belumDiinspeksi(x) && (
                            <input
                              type="checkbox"
                              checked={pilih.has(x.id)}
                              onChange={(e) => ubahPilih([x.id], e.target.checked)}
                              className="accent-navy-600"
                              aria-label={`Pilih ${x.objek_nama}`}
                            />
                          )}
                        </td>
                        <td className={TD}>
                          <p className="font-semibold text-ink text-sm">{x.objek_nama}</p>
                          <p className="text-[11px] text-ink-muted">{x.penyulang ?? "—"} · {x.ulp}</p>
                        </td>
                        <td className={`${TD} text-ink-soft`}>
                          <p className="line-clamp-2">{x.wo_nama}</p>
                          <p className="text-[11px] text-ink-muted">{x.tgl_wo}</p>
                        </td>
                        <td className={`${TD} text-right tabular-nums text-ink`}>
                          {kms(x.panjang_km)}
                          {x.panjang_dari === "ketikan" && <span className="text-amber-600" title="Panjang masih angka ketikan"> ✎</span>}
                        </td>
                        <td className={TD}>
                          <select
                            value={x.regu ?? ""}
                            onChange={(e) => void w.tugaskan(x.id, e.target.value, oleh)}
                            className={`${FIELD} h-8 w-[150px] text-xs`}
                            aria-label="Tim"
                          >
                            <option value="">— semua tim —</option>
                            {timUlp.map((g) => <option key={g.regu} value={g.regu}>{g.regu}</option>)}
                          </select>
                        </td>
                        <td className={TD}>
                          <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${t.cls}`}>
                            {t.teks}
                          </span>
                          {x.inspeksi_petugas && <p className="text-[11px] text-ink-muted mt-0.5">{x.inspeksi_petugas}</p>}
                        </td>
                        <td className={`${TD} text-right`}>
                          {belumDiinspeksi(x) && <button
                            onClick={() => setBatal(x)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:underline"
                            title={`Keluarkan ${satuan} ini dari WO`}
                          >
                            <Ban size={12} /> Keluarkan
                          </button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
              <span>
                {(hal - 1) * PAGE + 1}–{Math.min(hal * PAGE, w.item.length)} dari {w.item.length} {satuan} ·{" "}
                {kms(w.item.reduce((n, x) => n + (x.panjang_km ?? 0), 0))} KMS
              </span>
              <div className="flex items-center gap-1">
                <button onClick={() => setHalaman(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
                  <ChevronLeft size={15} />
                </button>
                <span>{hal} / {total}</span>
                <button onClick={() => setHalaman(hal + 1)} disabled={hal >= total} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {batal && (
        <BatalkanModal
          judul={`Keluarkan ${batal.objek_nama} dari WO?`}
          keterangan={`${Satuan} ini tidak lagi dihitung sebagai target WO dan hilang dari HP tim. Tetap tercatat berstatus Dibatalkan beserta alasannya.`}
          labelTombol="Keluarkan dari WO"
          placeholder={`Alasan — mis. ${satuan} salah pilih, dipindah ke WO bulan depan`}
          onTutup={() => setBatal(null)}
          onBatalkan={(alasan) => w.batalkan(batal.id, alasan, oleh)}
        />
      )}
      {keluarkan && (
        <BatalkanModal
          judul={`Keluarkan ${dipilih.length} ${satuan} dari WO?`}
          keterangan={`${Satuan} keluar dari WO dan dari HP tim, tetap tercatat berstatus Dibatalkan beserta alasannya. Yang ternyata sudah diinspeksi dilewati.`}
          labelTombol="Keluarkan"
          onTutup={() => setKeluarkan(false)}
          onBatalkan={async (alasan) => {
            const ok = await w.keluarkanBanyak(dipilih.map((x) => x.id), alasan, oleh);
            if (ok) setPilih(new Set());
            return ok;
          }}
        />
      )}
      {batalWo && (
        <BatalkanModal
          judul={`Batalkan WO "${batalWo.nama}"?`}
          keterangan={`Semua ${satuan}nya keluar dari WO dan dari HP tim. WO tetap tercatat berstatus Dibatalkan beserta alasannya dan tidak dihitung di rekap; ${satuan}nya bebas disusun atau ditempel ulang.`}
          labelTombol="Batalkan WO"
          onTutup={() => setBatalWo(null)}
          onBatalkan={(alasan) => w.batalkanWo(batalWo.id, alasan, oleh)}
        />
      )}
    </div>
  );
}
