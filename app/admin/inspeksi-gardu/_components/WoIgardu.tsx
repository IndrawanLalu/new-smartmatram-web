"use client";

import { useCallback, useState } from "react";
import { Ban, ChevronLeft, ChevronRight, Loader2, PlusCircle } from "lucide-react";
import SusunWoGardu from "@/app/admin/_components/SusunWoGardu";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, UNITS, type CurrentUser } from "@/lib/roles";
import { NADA_UI, nadaStatus } from "@/lib/statusUi";
import { useWoIgardu, type ItemWoIgardu, type WoIgarduRingkas } from "../_hooks/useWoIgardu";
import type { TierGardu } from "../_hooks/useInspeksiGardu";

/**
 * Tab WO Inspeksi Gardu — bentuk yang sama dengan WO Inspeksi JTM (26 Okt 2026):
 * Daftar WO (bawaan) · Susun WO · Gardu berjalan.
 */

const PILIHAN_TIER: { tier: TierGardu; label: string; bantu: string }[] = [
  { tier: "1", label: "Tier 1", bantu: "Inspeksi rutin gardu — catat temuan, atau foto gardu bila tidak ada temuan." },
  { tier: "2", label: "Tier 2", bantu: "Sama dengan Tier 1, ditambah suhu / ΔT bila ada titik panas (termovisi)." },
];
const BULAN_INI = new Date().toLocaleDateString("id-ID", { month: "long", year: "numeric" });
const PAGE = 20;
const TH = "px-3 py-2.5 text-left text-[11px] font-semibold text-ink-soft border-b border-line whitespace-nowrap";
const TD = "px-3 py-2.5 border-b border-line align-top text-xs";

const tahap = (x: ItemWoIgardu) => {
  switch (x.inspeksi_status) {
    case "Selesai": return "Menunggu persetujuan";
    case "Dikembalikan": return "Dikembalikan";
    default: return "Belum dikerjakan";
  }
};
const bulanTahun = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { month: "short", year: "numeric" });

function Lencana({ teks }: { teks: string }) {
  return <span className={`inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold whitespace-nowrap ${NADA_UI[nadaStatus(teks)].pil}`}>{teks}</span>;
}

function Halaman({ hal, total, onHal }: { hal: number; total: number; onHal: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onHal(hal - 1)} disabled={hal <= 1} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman sebelumnya"><ChevronLeft size={15} /></button>
      <span>{hal} / {total}</span>
      <button onClick={() => onHal(hal + 1)} disabled={hal >= total} className="p-1.5 rounded-lg hover:bg-surface disabled:opacity-30" aria-label="Halaman berikutnya"><ChevronRight size={15} /></button>
    </div>
  );
}

export default function WoIgardu({ user }: { user: CurrentUser }) {
  const bolehSemua = canSeeAllUnits(user.role);
  const w = useWoIgardu(bolehSemua ? null : (user.unit ?? "-").toUpperCase());
  const oleh = user.name ?? user.email;
  const [tampilan, setTampilan] = useState<"daftar" | "susun" | "berjalan">("daftar");
  const [tier, setTier] = useState<TierGardu | null>(null);
  const [woAwal, setWoAwal] = useState<{ id: string; ulp: string } | null>(null);
  const [saringTier, setSaringTier] = useState<"semua" | TierGardu>("semua");
  const [ulpLihat, setUlpLihat] = useState("");
  const [halWo, setHalWo] = useState(1);
  const [hal, setHal] = useState(1);
  const [pilih, setPilih] = useState<Set<string>>(new Set());
  const [keluar, setKeluar] = useState<string[] | null>(null);
  const [batalWo, setBatalWo] = useState<WoIgarduRingkas | null>(null);
  const { muatGardu } = w;
  const muatTier = useCallback((u: string) => muatGardu(u, tier ?? "1"), [muatGardu, tier]);

  const cocok = (x: { ulp: string; tier: TierGardu }) => (!ulpLihat || x.ulp === ulpLihat) && (saringTier === "semua" || x.tier === saringTier);
  const daftarWo = w.wo.filter(cocok).sort((a, b) => Number(b.status === "Terbit") - Number(a.status === "Terbit") || b.tgl_wo.localeCompare(a.tgl_wo));
  const totalWo = Math.max(1, Math.ceil(daftarWo.length / PAGE));
  const hWo = Math.min(halWo, totalWo);
  const berjalan = w.item.filter(cocok);
  const total = Math.max(1, Math.ceil(berjalan.length / PAGE));
  const h = Math.min(hal, total);
  const tampil = berjalan.slice((h - 1) * PAGE, h * PAGE);
  const bisaKeluar = (x: ItemWoIgardu) => !x.inspeksi_status;
  const dipilih = berjalan.filter((x) => pilih.has(x.id) && bisaKeluar(x));
  const bolehUlp = (u: string) => bolehSemua || (user.unit ?? "").toUpperCase() === u;
  const jalanDi = (x: WoIgarduRingkas) => x.item_terkirim + berjalan.filter((i) => i.wo_id === x.wo_id && !!i.inspeksi_status).length;
  const keDaftar = (ok: boolean) => {
    if (ok) { setWoAwal(null); setTampilan("daftar"); }
    return ok;
  };

  if (w.loading) {
    return <div className={`${CARD} p-8 flex items-center justify-center gap-2 text-sm text-ink-soft`}><Loader2 size={16} className="animate-spin" /> Memuat WO…</div>;
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} px-4 pt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-2`}>
        <div className="flex flex-wrap gap-1" role="tablist">
          {([["daftar", "Daftar WO", daftarWo.length], ["susun", woAwal ? "Tambah item" : "Susun WO", 0], ["berjalan", "Gardu berjalan", berjalan.length]] as const).map(([k, label, n]) => (
            <button key={k} role="tab" aria-selected={tampilan === k}
              onClick={() => { setTampilan(k); if (k !== "susun") setWoAwal(null); }}
              className={`inline-flex items-center gap-1.5 px-3 py-2.5 -mb-px border-b-2 text-[13px] font-semibold transition-colors ${tampilan === k ? "border-brand-600 text-brand-700" : "border-transparent text-ink-soft hover:text-ink"}`}>
              {k === "susun" && <PlusCircle size={14} />}
              {label}
              {n > 0 && <span className="tabular-nums text-[10px] font-bold px-1.5 rounded-full bg-surface text-ink-soft">{n}</span>}
            </button>
          ))}
        </div>
        {tampilan !== "susun" && (
          <div className="flex flex-wrap items-center gap-2 pb-2">
            <select value={saringTier} onChange={(e) => { setSaringTier(e.target.value as "semua" | TierGardu); setHal(1); setHalWo(1); }}
              className={`${FIELD} h-8 w-[130px] text-xs`} aria-label="Saring tier">
              <option value="semua">Semua tier</option><option value="1">Tier 1</option><option value="2">Tier 2</option>
            </select>
            {bolehSemua && (
              <select value={ulpLihat} onChange={(e) => { setUlpLihat(e.target.value); setHal(1); setHalWo(1); setPilih(new Set()); }}
                className={`${FIELD} h-8 w-[170px] text-xs`} aria-label="ULP">
                <option value="">Semua ULP</option>
                {UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            )}
          </div>
        )}
      </div>

      {tampilan === "susun" && (
        <>
          <div className={`${CARD} p-4 flex flex-wrap items-center gap-x-3 gap-y-2`}>
            <span className={EYEBROW}>Tier WO</span>
            {PILIHAN_TIER.map((t) => (
              <button key={t.tier} onClick={() => { setTier(t.tier); setWoAwal(null); }} disabled={!!woAwal}
                className={`${CHIP} ${tier === t.tier ? CHIP_ON : CHIP_OFF} disabled:opacity-40`} aria-pressed={tier === t.tier}>
                {t.label}
              </button>
            ))}
            <p className="basis-full text-[11px] text-ink-muted">
              {tier ? PILIHAN_TIER.find((t) => t.tier === tier)?.bantu : "Pilih tier dulu. Gardu yang terbuka di WO tier lain tetap bisa dipilih."}
            </p>
          </div>
          {tier ? (
            <SusunWoGardu
              key={`${tier}-${woAwal?.id ?? "baru"}`}
              user={user}
              judul={`Susun WO Inspeksi Gardu Tier ${tier}`}
              contohNama={`Inspeksi Gardu Tier ${tier} ${BULAN_INI}`}
              labelBelum="belum pernah diinspeksi"
              muatGardu={muatTier}
              terikat={w.terikat[tier]}
              regu={w.regu}
              pesanTanpaRegu={(u) => `Belum ada regu ber-menu Inspeksi Gardu di ${u} — WO tetap bisa terbit, semua tim se-ULP melihatnya.`}
              woTerbuka={w.wo.filter((x) => x.status === "Terbit" && x.tier === tier)
                .map((x) => ({ wo_id: x.wo_id, ulp: x.ulp, nama: x.nama, tgl_wo: x.tgl_wo, target: x.target, item: x.item }))}
              woAwal={woAwal}
              onTerbitkan={async (v) => keDaftar(await w.terbitkan({ ...v, tier, oleh }))}
              onTambah={async (v) => keDaftar(await w.tambah({ ...v, oleh }))}
            />
          ) : (
            <div className={`${CARD} p-6 text-sm text-ink-soft text-center`}>Pilih tier di atas untuk mulai menyusun WO.</div>
          )}
        </>
      )}

      {tampilan === "daftar" && (
        <div className={`${CARD} overflow-hidden`}>
          {daftarWo.length === 0 ? (
            <p className="text-xs text-ink-muted px-5 py-6">Belum ada WO Inspeksi Gardu.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="kepala-kit bg-surface">
                    <tr>
                      <th className={TH}>WO</th><th className={TH}>Bulan</th>
                      <th className={`${TH} text-right`}>Target</th><th className={`${TH} text-right`}>Gardu</th>
                      <th className={`${TH} text-right`}>Terkirim</th><th className={TH}>Status</th><th className={TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {daftarWo.slice((hWo - 1) * PAGE, hWo * PAGE).map((x) => {
                      const bisa = x.status === "Terbit" && bolehUlp(x.ulp);
                      const jalan = jalanDi(x);
                      return (
                        <tr key={x.wo_id} className="hover:bg-navy-50/40">
                          <td className={TD}>
                            <p className="font-semibold text-ink text-sm"><span className="mr-1.5 px-1.5 py-px rounded border border-navy-200 bg-navy-50 text-[10px] font-bold text-navy-700">Tier {x.tier}</span>{x.nama}</p>
                            <p className="text-[11px] text-ink-muted">{x.ulp}</p>
                          </td>
                          <td className={`${TD} text-ink-soft whitespace-nowrap`}>{bulanTahun(x.tgl_wo)}</td>
                          <td className={`${TD} text-right tabular-nums`}>{x.target ?? "—"}</td>
                          <td className={`${TD} text-right tabular-nums`}>{x.item}</td>
                          <td className={`${TD} text-right tabular-nums`}>{x.item_terkirim}/{x.item}</td>
                          <td className={TD}><Lencana teks={x.status === "Terbit" ? "Dalam Proses" : x.status} /></td>
                          <td className={`${TD} text-right whitespace-nowrap`}>
                            {bisa && (
                              <span className="inline-flex items-center gap-3">
                                <button onClick={() => { setTier(x.tier); setWoAwal({ id: x.wo_id, ulp: x.ulp }); setTampilan("susun"); }}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy-600 hover:underline"><PlusCircle size={12} /> Tambah item</button>
                                <button onClick={() => setBatalWo(x)} disabled={jalan > 0}
                                  title={jalan > 0 ? `${jalan} gardu sudah diinspeksi, WO tidak bisa dibatalkan` : "Batalkan WO ini"}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 hover:underline disabled:opacity-40 disabled:no-underline"><Ban size={12} /> Batalkan</button>
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
                <span>{daftarWo.length} WO</span>
                <Halaman hal={hWo} total={totalWo} onHal={setHalWo} />
              </div>
            </>
          )}
        </div>
      )}

      {tampilan === "berjalan" && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="px-5 py-4">
            <p className="text-xs text-ink-soft">Gardu WO yang belum disetujui. Item tertutup sendiri begitu inspeksinya disetujui. Yang sudah diinspeksi tidak bisa dikeluarkan.</p>
            {dipilih.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-navy-200 bg-navy-50/60 px-4 py-2.5 text-sm">
                <span><b className="tabular-nums">{dipilih.length}</b> gardu dipilih</span>
                <button onClick={() => setPilih(new Set())} className="text-xs text-ink-soft hover:text-ink">Batal pilih</button>
                <button onClick={() => setKeluar(dipilih.map((x) => x.id))} className={`${BTN_GHOST} ml-auto text-red-700`}><Ban size={14} /> Keluarkan dari WO ({dipilih.length})</button>
              </div>
            )}
          </div>
          {berjalan.length === 0 ? (
            <p className="text-xs text-ink-muted px-5 pb-6">Tidak ada gardu WO yang berjalan.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="kepala-kit bg-surface">
                    <tr><th className={`${TH} w-8`} /><th className={TH}>Gardu</th><th className={TH}>Tier</th><th className={TH}>WO</th><th className={TH}>Tim</th><th className={TH}>Tahap</th></tr>
                  </thead>
                  <tbody>
                    {tampil.map((x) => (
                      <tr key={x.id} className={pilih.has(x.id) ? "bg-navy-50/70" : "hover:bg-navy-50/40"}>
                        <td className={TD}>
                          {bisaKeluar(x) && bolehUlp(x.ulp) && (
                            <input type="checkbox" checked={pilih.has(x.id)} className="accent-navy-600" aria-label={`Pilih ${x.gardu_kode}`}
                              onChange={(e) => setPilih((p) => { const n = new Set(p); if (e.target.checked) n.add(x.id); else n.delete(x.id); return n; })} />
                          )}
                        </td>
                        <td className={TD}>
                          <p className="font-semibold text-ink text-sm">{x.gardu_kode}{x.gardu_nama ? ` · ${x.gardu_nama}` : ""}</p>
                          <p className="text-[11px] text-ink-muted">{x.penyulang ?? "—"} · {x.ulp}</p>
                        </td>
                        <td className={TD}>Tier {x.tier}</td>
                        <td className={`${TD} text-ink-soft`}><p className="line-clamp-2">{x.wo_nama}</p><p className="text-[11px] text-ink-muted">{bulanTahun(x.tgl_wo)}</p></td>
                        <td className={TD}>
                          <select value={x.regu ?? ""} disabled={!bolehUlp(x.ulp)} onChange={(e) => void w.tugaskan(x.id, e.target.value, oleh)}
                            className={`${FIELD} h-8 w-[150px] text-xs`} aria-label="Tim">
                            <option value="">— semua tim —</option>
                            {w.regu.filter((g) => g.ulp === x.ulp).map((g) => <option key={g.regu} value={g.regu}>{g.regu}</option>)}
                          </select>
                        </td>
                        <td className={TD}><Lencana teks={tahap(x)} />{x.inspeksi_petugas && <p className="text-[11px] text-ink-muted mt-0.5">{x.inspeksi_petugas}</p>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs text-ink-soft">
                <span>{(h - 1) * PAGE + 1}–{Math.min(h * PAGE, berjalan.length)} dari {berjalan.length} gardu</span>
                <Halaman hal={h} total={total} onHal={setHal} />
              </div>
            </>
          )}
        </div>
      )}

      {keluar && (
        <BatalkanModal
          judul={`Keluarkan ${keluar.length} gardu dari WO?`}
          keterangan="Gardu keluar dari WO dan dari HP tim, tetap tercatat berstatus Dibatalkan beserta alasannya. Yang ternyata sudah diinspeksi dilewati."
          labelTombol="Keluarkan"
          onTutup={() => setKeluar(null)}
          onBatalkan={async (alasan) => {
            const ok = await w.keluarkan(keluar, alasan, oleh);
            if (ok) setPilih(new Set());
            return ok;
          }}
        />
      )}
      {batalWo && (
        <BatalkanModal
          judul={`Batalkan WO "${batalWo.nama}"?`}
          keterangan="Semua gardunya keluar dari WO dan dari HP tim. WO tetap tercatat berstatus Dibatalkan beserta alasannya; gardunya bebas disusun ulang."
          labelTombol="Batalkan WO"
          onTutup={() => setBatalWo(null)}
          onBatalkan={(alasan) => w.batalkanWo(batalWo.wo_id, alasan, oleh)}
        />
      )}
    </div>
  );
}
