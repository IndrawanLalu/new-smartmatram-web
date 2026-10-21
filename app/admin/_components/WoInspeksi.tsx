"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Loader2, PlusCircle } from "lucide-react";
import SusunWoSegmen, { type IstilahWo } from "@/app/admin/_components/SusunWoSegmen";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, UNITS, type CurrentUser } from "@/lib/roles";
import { useWoInspeksi, type ItemWoInspeksi, type JenisWoInspeksi, type TierWo, type WoInspeksiRingkas } from "@/app/admin/_hooks/useWoInspeksi";
import { useSlaBulanan } from "@/app/admin/_hooks/useSlaBulanan";
import { bulanTahun, useGaransiItem } from "@/app/admin/_hooks/useGaransi";
import LencanaGaransi from "@/app/admin/_components/LencanaGaransi";
import IkonKolom from "@/app/admin/_kit/IkonKolom";
import { supabaseBrowser } from "@/lib/supabase-browser";

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
 *
 * JTM bertier (`rencana-wo-jtm-tier2.md`): tier WO WAJIB dipilih sebelum
 * menyusun, tanpa pilihan bawaan — salah tier berarti regu mengisi daftar
 * isian yang salah. Segmen yang terbuka di WO Tier 1 tetap bisa dipilih untuk
 * WO Tier 2, dan sebaliknya.
 *
 * Daftar WO + "Tambah item" ke WO yang masih berjalan, dan peringatan masa
 * garansi (wo-daftar-garansi.sql, 12 Okt 2026).
 */

const PILIHAN_TIER: { tier: TierWo; label: string; bantu: string }[] = [
  { tier: "1", label: "Tier 1 · rutin", bantu: "Pemeriksaan rutin tiap tiang" },
  { tier: "2", label: "Tier 2 · detail", bantu: "Pemeriksaan malam / beban puncak (suhu, suara, flashover) — hanya segmen yang Tier 1-nya sudah disetujui" },
];
const BULAN_INI = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });

const reguKosong = (ulp: string) =>
  `ULP ${ulp} belum punya petugas aktif di Manajemen Petugas yang grupnya role inspeksi ini (role bermenu HP JTM/JTR di Kelola Role). WO tetap bisa terbit — semua tim se-ULP melihatnya di HP.`;

const ISTILAH: Record<JenisWoInspeksi, IstilahWo> = {
  JTM: { judul: "Susun WO inspeksi JTM", contohNama: "Inspeksi JTM Oktober 2026", reguWajib: false, reguKosong },
  JTR: { judul: "Susun WO inspeksi JTR", contohNama: "Inspeksi JTR Oktober 2026", reguWajib: false, reguKosong, satuan: "gardu" },
};

const PAGE = 20;
const PAGE_WO = 10;
const NADA_WO: Record<string, string> = {
  Terbit: "bg-sky-50 text-sky-700 border-sky-200",
  Selesai: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dibatalkan: "bg-gray-100 text-gray-500 border-gray-200",
};
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
  // SLA Tier 2 punya kuncinya sendiri di Atur SLA.
  const slaBulan2 = useSlaBulanan("jtm2");
  const satuan = jenis === "JTM" ? "segmen" : "gardu";
  const Satuan = jenis === "JTM" ? "Segmen" : "Gardu";
  const oleh = user.name ?? user.email;
  const [halaman, setHalaman] = useState(1);
  const [batal, setBatal] = useState<ItemWoInspeksi | null>(null);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [keluarkan, setKeluarkan] = useState(false);
  const [batalWo, setBatalWo] = useState<{ id: string; nama: string } | null>(null);
  const jtm = jenis === "JTM";
  /** Tier WO yang sedang disusun — kosong sampai admin memilih (JTR selalu 1). */
  const [tierSusun, setTierSusun] = useState<TierWo | null>(jtm ? null : "1");
  /** Saringan daftar WO berjalan. */
  const [saringTier, setSaringTier] = useState<TierWo | "semua">("semua");
  // WO berjalan hanya ULP sendiri — dulu semua ULP ikut tampil (bug 12 Okt
  // 2026). UP3 memilih ULP-nya; kosong = semua.
  const bolehSemua = canSeeAllUnits(user.role);
  const [ulpLihat, setUlpLihat] = useState(bolehSemua ? "" : (user.unit ?? "").toUpperCase());
  const itemUlp = ulpLihat ? w.item.filter((x) => x.ulp.toUpperCase() === ulpLihat) : w.item;
  /** Dibuka dari Daftar WO: Susun WO langsung pada "Tambah ke WO" ini. */
  const [woAwal, setWoAwal] = useState<{ id: string; ulp: string } | null>(null);
  const [halWo, setHalWo] = useState(1);
  const atasRef = useRef<HTMLDivElement>(null);

  // WO Tier 2 hanya untuk segmen yang sudah dititik Tier 1 (Diverifikasi) —
  // jtm-tier2-malam.sql; server menolak sisanya lewat pemicu yang sama.
  const [dititik, setDititik] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (tierSusun !== "2" || dititik) return;
    // Galat (SQL belum dijalankan) = tanpa kunci di layar; server tetap menjaga.
    void supabaseBrowser.rpc("jtm_segmen_dititik", { p_ulp: null }).then(({ data, error }) => {
      if (!error) setDititik(new Set((data ?? []).map((x: { segmen_id: string }) => x.segmen_id)));
    });
  }, [tierSusun, dititik]);
  const terkunci = useMemo(
    () => (tierSusun === "2" && dititik
      ? { segmen: new Set(w.objek.map((s) => s.segmen_id).filter((id) => !dititik.has(id))), label: "belum dititik Tier 1" }
      : undefined),
    [tierSusun, dititik, w.objek],
  );
  // Item WO yang di-WO-kan dalam masa garansi pekerjaan sebelumnya.
  const garansi1 = useGaransiItem(jtm ? "jtm" : "jtr", ulpLihat, w.nonce);
  const garansi2 = useGaransiItem(jtm ? "jtm2" : null, ulpLihat, w.nonce);
  const garansiDi = (x: ItemWoInspeksi) => (x.tier === "2" ? garansi2 : garansi1).get(x.id);

  const daftarWo = w.wo
    .filter((x) => (!ulpLihat || x.ulp.toUpperCase() === ulpLihat) && (saringTier === "semua" || x.tier === saringTier))
    // Yang masih berjalan di atas.
    .sort((a, b) => Number(b.status === "Terbit") - Number(a.status === "Terbit") || b.tgl_wo.localeCompare(a.tgl_wo));
  const totalWo = Math.max(1, Math.ceil(daftarWo.length / PAGE_WO));
  const hWo = Math.min(halWo, totalWo);
  const tampilWo = daftarWo.slice((hWo - 1) * PAGE_WO, hWo * PAGE_WO);
  const bolehUlp = (u: string) => bolehSemua || (user.unit ?? "").toUpperCase() === u.toUpperCase();
  /** Objek WO ini yang sudah diinspeksi: WO tidak bisa dibatalkan. */
  const jalanDi = (x: WoInspeksiRingkas) => x.item_selesai + itemUlp.filter((i) => i.wo_id === x.wo_id && !belumDiinspeksi(i)).length;
  const tambahKe = (x: WoInspeksiRingkas) => {
    setTierSusun(x.tier);
    setWoAwal({ id: x.wo_id, ulp: x.ulp });
    atasRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const daftar = saringTier === "semua" ? itemUlp : itemUlp.filter((x) => x.tier === saringTier);
  const total = Math.max(1, Math.ceil(daftar.length / PAGE));
  const hal = Math.min(halaman, total);
  const tampil = daftar.slice((hal - 1) * PAGE, hal * PAGE);
  const dipilih = itemUlp.filter((x) => pilih.has(x.id) && belumDiinspeksi(x));
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

  if (w.loading) {
    return (
      <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}>
        <Loader2 size={16} className="animate-spin" /> Memuat {satuan} & WO…
      </div>
    );
  }

  return (
    <div className="space-y-4" ref={atasRef}>
      {jtm && (
        <div className={`${CARD} p-5`}>
          <p className={EYEBROW}>Tier WO</p>
          <p className="text-xs text-ink-soft mt-1">
            Pilih dulu tier WO yang akan disusun. Tier menentukan daftar isian regu di HP. Segmen yang
            sudah ada di WO tier lain tetap bisa dipilih.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PILIHAN_TIER.map((p) => (
              <button
                key={p.tier}
                onClick={() => {
                  setTierSusun(p.tier);
                  setWoAwal(null);
                }}
                className={`${CHIP} ${tierSusun === p.tier ? CHIP_ON : CHIP_OFF}`}
                title={p.bantu}
                aria-pressed={tierSusun === p.tier}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {tierSusun ? (
        <SusunWoSegmen
          // Ganti tier / WO tujuan = mulai susunan baru: centang tier lain tidak terbawa.
          key={`${tierSusun}-${woAwal?.id ?? "baru"}`}
          user={user}
          istilah={
            jtm
              ? {
                  ...ISTILAH.JTM,
                  judul: `Susun WO inspeksi JTM Tier ${tierSusun}`,
                  contohNama: `Inspeksi JTM Tier ${tierSusun} ${BULAN_INI}`,
                }
              : ISTILAH[jenis]
          }
          segmen={w.objek}
          segmenTerikat={w.objekTerikat[tierSusun]}
          terkunci={terkunci}
          regu={w.regu}
          woAwal={woAwal}
          woTerbuka={w.wo
            .filter((x) => x.status === "Terbit" && x.tier === tierSusun)
            .map((x) => ({ wo_id: x.wo_id, ulp: x.ulp, nama: x.nama, tgl_wo: x.tgl_wo, target_km: x.target_km, item: x.item, rencana_km: x.rencana_km }))}
          garansi={jtm ? (tierSusun === "2" ? "jtm2" : "jtm") : "jtr"}
          infoSla={(u, tgl) => ({
            sla: (tierSusun === "2" ? slaBulan2 : slaBulan)(u, tgl),
            terbit: w.terbitBulan(u, tgl, jtm ? tierSusun : undefined),
          })}
          onTerbitkan={(v) => w.terbitkan({ ...v, oleh, tier: tierSusun })}
          onTambah={async (v) => {
            const h = await w.tambah({ ...v, oleh });
            if (h) setWoAwal(null);
            return h;
          }}
        />
      ) : (
        <div className={`${CARD} p-6 text-sm text-ink-soft text-center`}>
          Pilih <b className="text-ink">Tier 1</b> atau <b className="text-ink">Tier 2</b> di atas untuk mulai menyusun WO.
        </div>
      )}

      <DaftarWoInspeksi
        baris={tampilWo}
        total={daftarWo.length}
        hal={hWo}
        totalHal={totalWo}
        onHal={setHalWo}
        jtm={jtm}
        satuan={satuan}
        bolehUlp={bolehUlp}
        jalanDi={jalanDi}
        onTambah={tambahKe}
        onBatalkan={(x) => setBatalWo({ id: x.wo_id, nama: x.nama })}
      />

      <div className={`${CARD} overflow-hidden`}>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={EYEBROW}>{Satuan} WO berjalan</p>
            {bolehSemua && (
              <select
                value={ulpLihat}
                onChange={(e) => {
                  setUlpLihat(e.target.value);
                  setHalaman(1);
                  setHalWo(1);
                  setPilih(new Set());
                }}
                className={`${FIELD} h-8 w-[170px] text-xs`}
                aria-label="ULP"
              >
                <option value="">Semua ULP</option>
                {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            )}
          </div>
          <p className="text-xs text-ink-soft mt-1">
            {Satuan} WO yang belum disetujui. Item tertutup sendiri begitu inspeksinya disetujui di Daftar
            Inspeksi. Yang sudah diinspeksi regu tidak bisa dikeluarkan dari WO.
          </p>
          {jtm && itemUlp.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Saring tier">
              {(["semua", "1", "2"] as const).map((t) => {
                const n = t === "semua" ? itemUlp.length : itemUlp.filter((x) => x.tier === t).length;
                return (
                  <button
                    key={t}
                    onClick={() => {
                      setSaringTier(t);
                      setHalaman(1);
                      setHalWo(1);
                    }}
                    className={`${CHIP} ${saringTier === t ? CHIP_ON : CHIP_OFF}`}
                    aria-pressed={saringTier === t}
                  >
                    {t === "semua" ? "Semua tier" : `Tier ${t}`} · {n}
                  </button>
                );
              })}
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
        {daftar.length === 0 ? (
          <p className="text-xs text-ink-muted px-5 pb-6">
            {itemUlp.length === 0 ? "Belum ada WO inspeksi yang berjalan." : `Belum ada WO Tier ${saringTier} yang berjalan.`}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="kepala-kit bg-surface">
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
                    {jtm && <th className={TH}>Tier</th>}
                    <th className={TH}><IkonKolom teks="WO" />WO</th>
                    <th className={`${TH} text-right`}><IkonKolom teks="KMS" />KMS</th>
                    <th className={TH}><IkonKolom teks="Tim" />Tim</th>
                    <th className={TH}><IkonKolom teks="Tahap" />Tahap</th>
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
                          {garansiDi(x) && <div className="mt-1"><LencanaGaransi g={garansiDi(x)!} /></div>}
                        </td>
                        {jtm && (
                          <td className={TD}>
                            <TierLencana tier={x.tier} />
                          </td>
                        )}
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
                {(hal - 1) * PAGE + 1}–{Math.min(hal * PAGE, daftar.length)} dari {daftar.length} {satuan} ·{" "}
                {kms(daftar.reduce((n, x) => n + (x.panjang_km ?? 0), 0))} KMS
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

/** Daftar WO inspeksi (12 Okt 2026). WO yang masih berjalan bisa ditambah
 *  item-nya, atau dibatalkan selama belum ada yang diinspeksi. */
function DaftarWoInspeksi({
  baris, total, hal, totalHal, onHal, jtm, satuan, bolehUlp, jalanDi, onTambah, onBatalkan,
}: {
  baris: WoInspeksiRingkas[];
  total: number;
  hal: number;
  totalHal: number;
  onHal: (n: number) => void;
  jtm: boolean;
  satuan: string;
  bolehUlp: (ulp: string) => boolean;
  jalanDi: (x: WoInspeksiRingkas) => number;
  onTambah: (x: WoInspeksiRingkas) => void;
  onBatalkan: (x: WoInspeksiRingkas) => void;
}) {
  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-4">
        <p className={EYEBROW}>Daftar WO</p>
        <p className="text-xs text-ink-soft mt-1">
          WO yang masih berjalan bisa ditambah {satuan}nya lewat <b className="text-ink">Tambah item</b>. Pembatalan WO
          hanya selama belum ada {satuan} yang diinspeksi.
        </p>
      </div>
      {baris.length === 0 ? (
        <p className="text-xs text-ink-muted px-5 pb-6">Belum ada WO.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="kepala-kit bg-surface">
                <tr>
                  <th className={TH}><IkonKolom teks="WO" />WO</th>
                  <th className={TH}><IkonKolom teks="Bulan" />Bulan</th>
                  <th className={`${TH} text-right`}><IkonKolom teks="Target" />Target</th>
                  <th className={`${TH} text-right`}><IkonKolom teks="Rencana" />Rencana</th>
                  <th className={`${TH} text-right`}>{satuan === "gardu" ? "Gardu" : "Segmen"} selesai</th>
                  <th className={TH}><IkonKolom teks="Status" />Status</th>
                  <th className={TH} />
                </tr>
              </thead>
              <tbody>
                {baris.map((x) => {
                  const bisa = x.status === "Terbit" && bolehUlp(x.ulp);
                  const jalan = jalanDi(x);
                  return (
                    <tr key={x.wo_id} className="hover:bg-navy-50/40">
                      <td className={TD}>
                        <p className="font-semibold text-ink text-sm flex flex-wrap items-center gap-1.5">
                          {jtm && <TierLencana tier={x.tier} />} {x.nama}
                        </p>
                        <p className="text-[11px] text-ink-muted">{x.ulp}</p>
                      </td>
                      <td className={`${TD} text-ink-soft whitespace-nowrap`}>{bulanTahun(x.tgl_wo)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{kms(x.target_km)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{kms(x.rencana_km)}</td>
                      <td className={`${TD} text-right tabular-nums`}>{x.item_selesai}/{x.item}</td>
                      <td className={TD}>
                        <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold ${NADA_WO[x.status] ?? NADA_WO.Terbit}`}>
                          {x.status === "Terbit" ? "Berjalan" : x.status}
                        </span>
                      </td>
                      <td className={`${TD} text-right whitespace-nowrap`}>
                        {bisa && (
                          <span className="inline-flex items-center gap-3">
                            <button
                              onClick={() => onTambah(x)}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-600 hover:underline"
                            >
                              <PlusCircle size={12} /> Tambah item
                            </button>
                            <button
                              onClick={() => onBatalkan(x)}
                              disabled={jalan > 0}
                              title={jalan > 0 ? `${jalan} ${satuan} sudah diinspeksi, WO tidak bisa dibatalkan` : "Batalkan WO ini"}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:underline disabled:opacity-40 disabled:no-underline"
                            >
                              <Ban size={12} /> Batalkan
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
            <span>{total} WO</span>
            <div className="flex items-center gap-1">
              <button onClick={() => onHal(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya">
                <ChevronLeft size={15} />
              </button>
              <span>{hal} / {totalHal}</span>
              <button onClick={() => onHal(hal + 1)} disabled={hal >= totalHal} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Lencana tier: Tier 1 navy muda, Tier 2 navy tegas — dibedakan teks DAN isi,
 *  bukan warna saja. Bukan warna status (tier bukan keadaan pekerjaan). */
function TierLencana({ tier }: { tier: TierWo }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
        tier === "2" ? "bg-navy-600 text-white" : "bg-navy-50 text-navy-700 border border-navy-200"
      }`}
    >
      Tier {tier}
    </span>
  );
}
