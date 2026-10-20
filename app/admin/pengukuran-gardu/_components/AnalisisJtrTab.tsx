"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Map as IkonPeta, Search, Settings2 } from "lucide-react";
import { BTN_GHOST, CARD, CHIP, CHIP_OFF, CHIP_ON, FIELD } from "@/app/admin/_ui";
import IkonKolom from "@/app/admin/_kit/IkonKolom";
import { useAnalisisJtr, type JurusanJtr, type PengaturanJtr, type StatusJurusan } from "../_hooks/useAnalisisJtr";
import PengaturanAnalisisJtr from "./PengaturanAnalisisJtr";
import RincianRencanaJtr from "./RincianRencanaJtr";
import UsulanJtrTab from "./UsulanJtrTab";
import { NADA_TAHAP, useUsulanJtr, type UsulanJtr } from "../_hooks/useUsulanJtr";
import { alamatPetaRencana, buatRencana, LABEL_RENCANA, type JenisRencana, type Rencana } from "../_lib/rencanaJtr";

/**
 * Tab "Analisis JTR" (F1, 20 Okt 2026). Satu baris per gardu + jurusan:
 * arus terukur dipasangkan dengan bentuk jaringannya dari inspeksi JTR —
 * untuk menjawab "gardu/jurusan mana yang harus diperbaiki", lalu kolom
 * Rencana perbaikan (F3, `_lib/rencanaJtr.ts`) menjawab "diapakan".
 *
 * Berangkat dari "Merah": yang dicari orang di sini adalah yang harus
 * dikerjakan, bukan daftar 3.000 jurusan yang sebagian besar sehat.
 */

const PAGE = 20;
const URUT: Record<StatusJurusan, number> = { merah: 0, kuning: 1, baik: 2 };

type Sebab = "semua" | "arus" | "kha" | "panjang" | "tanpaJtr" | "khaKosong";

const SEBAB: { kunci: Sebab; label: (p: PengaturanJtr) => string; cocok: (r: JurusanJtr) => boolean }[] = [
  { kunci: "semua", label: () => "Semua sebab", cocok: () => true },
  { kunci: "arus", label: (p) => `Arus > ${p.batas_arus_jurusan_a} A`, cocok: (r) => r.arus_lebih },
  { kunci: "kha", label: (p) => `Beban kabel > ${p.batas_kha_pct}% KHA`, cocok: (r) => r.kha_lebih },
  { kunci: "panjang", label: (p) => `Lintasan > ${angka(p.batas_panjang_m)} m`, cocok: (r) => r.panjang_lebih },
  { kunci: "tanpaJtr", label: () => "JTR belum diinspeksi", cocok: (r) => !r.jtr_ada },
  { kunci: "khaKosong", label: () => "KHA belum diatur", cocok: (r) => r.jtr_ada && r.kha_a === null },
];

const NADA: Record<StatusJurusan, string> = {
  merah: "bg-red-50 text-red-700 border-red-200",
  kuning: "bg-amber-50 text-amber-700 border-amber-200",
  baik: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const angka = (v: number | null | undefined, d = 0) =>
  v === null || v === undefined ? "—" : v.toLocaleString("id-ID", { maximumFractionDigits: d });

const TH = "px-3 py-3 text-xs text-accent-deep font-semibold whitespace-nowrap";

const NADA_RENCANA: Record<JenisRencana, string> = {
  pemerataan: "text-sky-700",
  "tambah-jurusan": "text-navy-600",
  sisip: "text-red-700",
  "ganti-kabel": "text-amber-700",
  "naik-daya": "text-red-700",
  "ukur-ujung": "text-ink-soft",
  "inspeksi-jtr": "text-ink-soft",
};

const kunciBaris = (r: JurusanJtr) => `${r.gardu_kode}|${r.jurusan}`;

interface Props {
  ulp: string;
  bolehAtur: boolean;
  /** UP3 & admin: simpan usulan, jadikan WO (hak ULP diperiksa di SQL). */
  bolehUsul: boolean;
  oleh: string;
}

/** Usulan yang masih berjalan — jurusan ini tidak perlu diusulkan lagi. */
const BERJALAN = new Set(["Usulan", "Di-WO-kan", "Dikerjakan"]);

export default function AnalisisJtrTab({ ulp, bolehAtur, bolehUsul, oleh }: Props) {
  const { baris, pengaturan, gawang, kha, memuat, galat, muatUlang } = useAnalisisJtr(ulp);
  const usulan = useUsulanJtr(ulp);
  const [lihat, setLihat] = useState<"analisis" | "usulan">("analisis");
  const [bukaUsulan, setBukaUsulan] = useState<string | null>(null);
  const usulanJalan = useMemo(() => {
    const h = new Map<string, UsulanJtr>();
    for (const u of usulan.usulan) {
      const k = `${u.gardu_kode}|${u.jurusan}`;
      if (BERJALAN.has(u.tahap) && !h.has(k)) h.set(k, u);
    }
    return h;
  }, [usulan.usulan]);
  const keUsulan = (id: string) => {
    setBuka(null);
    setLihat("usulan");
    setBukaUsulan(id);
  };
  const [jenisRencana, setJenisRencana] = useState<JenisRencana | "">("");
  const [buka, setBuka] = useState<JurusanJtr | null>(null);

  const rencana = useMemo(() => {
    const h = new Map<string, Rencana>();
    if (!pengaturan) return h;
    // "Naik daya" adalah rencana GARDU, bukan jurusan — cukup sekali, di
    // jurusan berarus terbesar; tanpa ini satu trafo muncul empat kali.
    const naikDaya = new Map<string, JurusanJtr>();
    for (const r of baris) {
      const x = buatRencana(r, gawang.get(kunciBaris(r)), pengaturan, kha);
      if (!x) continue;
      if (x.jenis === "naik-daya") {
        const lain = naikDaya.get(r.gardu_kode);
        if (lain && (lain.arus_maks ?? 0) >= (r.arus_maks ?? 0)) continue;
        if (lain) h.delete(kunciBaris(lain));
        naikDaya.set(r.gardu_kode, r);
      }
      h.set(kunciBaris(r), x);
    }
    return h;
  }, [baris, gawang, kha, pengaturan]);

  const cacahRencana = useMemo(() => {
    const c = new Map<JenisRencana, number>();
    for (const x of rencana.values()) c.set(x.jenis, (c.get(x.jenis) ?? 0) + 1);
    return c;
  }, [rencana]);
  const [status, setStatus] = useState<StatusJurusan | "semua">("merah");
  const [sebab, setSebab] = useState<Sebab>("semua");
  const [cari, setCari] = useState("");
  const [hal, setHal] = useState(1);
  const [atur, setAtur] = useState(false);

  const cacah = useMemo(() => {
    const c = { semua: baris.length, merah: 0, kuning: 0, baik: 0 };
    for (const r of baris) c[r.status] += 1;
    return c;
  }, [baris]);

  const tampil = useMemo(() => {
    const q = cari.trim().toUpperCase();
    const cocokSebab = SEBAB.find((s) => s.kunci === sebab)!.cocok;
    return baris
      .filter((r) => (status === "semua" || r.status === status) && cocokSebab(r))
      .filter((r) => !jenisRencana || rencana.get(kunciBaris(r))?.jenis === jenisRencana)
      .filter((r) => !q || [r.gardu_kode, r.penyulang ?? "", r.gardu_nama ?? ""].some((v) => v.toUpperCase().includes(q)))
      .sort((a, b) => URUT[a.status] - URUT[b.status] || (b.beban_kha_pct ?? -1) - (a.beban_kha_pct ?? -1) || (b.arus_maks ?? 0) - (a.arus_maks ?? 0) || (b.terjauh_m ?? 0) - (a.terjauh_m ?? 0));
  }, [baris, status, sebab, cari, jenisRencana, rencana]);

  const halaman = Math.max(1, Math.ceil(tampil.length / PAGE));
  const isi = tampil.slice((hal - 1) * PAGE, hal * PAGE);
  const ganti = <T,>(f: (v: T) => void) => (v: T) => { f(v); setHal(1); };

  const saklar = (
    <div className="flex rounded-xl border border-line p-0.5 bg-surface">
      {(["analisis", "usulan"] as const).map((k) => (
        <button
          key={k}
          onClick={() => setLihat(k)}
          className={`px-3 h-8 rounded-lg text-sm font-semibold ${lihat === k ? "bg-white text-navy-600 shadow-sm" : "text-ink-soft hover:text-ink"}`}
        >
          {k === "analisis" ? "Analisis" : `Usulan${usulanJalan.size ? ` (${usulanJalan.size})` : ""}`}
        </button>
      ))}
    </div>
  );

  if (lihat === "usulan") {
    return (
      <div className={`${CARD} overflow-hidden`}>
        <UsulanJtrTab st={usulan} boleh={bolehUsul} oleh={oleh} saklar={saklar} buka={bukaUsulan} onBuka={setBukaUsulan} />
      </div>
    );
  }

  return (
    <div className={`${CARD} overflow-hidden`}>
      <div className="px-5 py-4 border-b border-line space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {saklar}
          {(["merah", "kuning", "baik", "semua"] as const).map((k) => (
            <button key={k} onClick={() => ganti(setStatus)(k)} className={`${CHIP} ${status === k ? CHIP_ON : CHIP_OFF}`}>
              {k === "semua" ? "Semua" : k === "merah" ? "Perlu diperbaiki" : k === "kuning" ? "Mendekati batas" : "Aman"}
              <span className={`tabular-nums ${status === k ? "text-white/70" : "text-ink-muted"}`}>{cacah[k]}</span>
            </button>
          ))}
          <select
            value={jenisRencana}
            onChange={(e) => ganti(setJenisRencana)(e.target.value as JenisRencana | "")}
            className={`${FIELD} ml-auto`}
          >
            <option value="">Semua rencana</option>
            {(Object.keys(LABEL_RENCANA) as JenisRencana[]).map((k) => (
              <option key={k} value={k}>{LABEL_RENCANA[k]} ({cacahRencana.get(k) ?? 0})</option>
            ))}
          </select>
          <div className="relative w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
            <input value={cari} onChange={(e) => ganti(setCari)(e.target.value)} placeholder="Cari gardu atau penyulang…" className={`${FIELD} w-full pl-8`} />
          </div>
          {pengaturan && (
            <button onClick={() => setAtur(true)} className={BTN_GHOST}>
              <Settings2 size={14} /> Pengaturan
            </button>
          )}
        </div>
        {pengaturan && (
          <div className="flex flex-wrap items-center gap-1.5">
            {SEBAB.map((s) => (
              <button key={s.kunci} onClick={() => ganti(setSebab)(s.kunci)} className={`${CHIP} ${sebab === s.kunci ? CHIP_ON : CHIP_OFF}`}>
                {s.label(pengaturan)}
              </button>
            ))}
          </div>
        )}
      </div>

      {galat ? (
        <p className="px-5 py-10 text-center text-sm text-red-600">{galat}</p>
      ) : memuat ? (
        <div className="py-16 flex justify-center"><Loader2 size={22} className="animate-spin text-ink-muted" /></div>
      ) : tampil.length === 0 ? (
        <p className="py-16 text-center text-sm text-ink-soft">Tidak ada jurusan yang cocok.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="kepala-kit">
                <tr className="bg-navy-50 text-left">
                  <th className={TH}><IkonKolom teks="Gardu" />Gardu</th>
                  <th className={`${TH} text-center`}>Jur.</th>
                  <th className={`${TH} text-center`}><IkonKolom teks="KVA" />Trafo</th>
                  <th className={`${TH} text-center`}><IkonKolom teks="Arus R/S/T (A)" />Arus R/S/T (A)</th>
                  <th className={TH}>Kabel terkecil</th>
                  <th className={`${TH} text-right`}>Beban kabel</th>
                  <th className={`${TH} text-right`}>Lintasan terjauh</th>
                  <th className={`${TH} text-right`}>Tiang · SR</th>
                  <th className={`${TH} text-center`} title="Dari pemeliharaan gardu terakhir — pastikan di lapangan sebelum menambah jurusan">
                    Slot jurusan*
                  </th>
                  <th className={TH}>Status</th>
                  <th className={TH}>Rencana perbaikan</th>
                </tr>
              </thead>
              <tbody>
                {isi.map((r) => (
                  <Baris key={kunciBaris(r)} r={r} rencana={rencana.get(kunciBaris(r))} usulan={usulanJalan.get(kunciBaris(r))} onBuka={() => setBuka(r)} />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-line flex items-center justify-between gap-3">
            <p className="text-xs text-ink-soft">
              {tampil.length} jurusan · *slot jurusan dari pemeliharaan gardu terakhir, pastikan di lapangan sebelum menambah jurusan
            </p>
            {halaman > 1 && (
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-ink-soft">{hal}/{halaman}</span>
                <button onClick={() => setHal((p) => Math.max(1, p - 1))} disabled={hal === 1} className="w-8 h-8 grid place-items-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40">
                  <ChevronLeft size={14} />
                </button>
                <button onClick={() => setHal((p) => Math.min(halaman, p + 1))} disabled={hal === halaman} className="w-8 h-8 grid place-items-center rounded-lg border border-line text-ink-soft hover:bg-surface disabled:opacity-40">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {buka && pengaturan && rencana.get(kunciBaris(buka)) && (
        <RincianRencanaJtr
          r={buka}
          rencana={rencana.get(kunciBaris(buka))!}
          gawang={gawang.get(kunciBaris(buka))}
          pengaturan={pengaturan}
          materialRef={usulan.materialRef}
          usulanAda={usulanJalan.get(kunciBaris(buka))}
          bolehUsul={bolehUsul}
          onSimpanUsulan={async (u) => keUsulan((await usulan.simpan(u, oleh)).id)}
          onBukaUsulan={(u) => keUsulan(u.id)}
          onTutup={() => setBuka(null)}
        />
      )}

      {atur && pengaturan && (
        <PengaturanAnalisisJtr
          awal={pengaturan}
          boleh={bolehAtur}
          oleh={oleh}
          onTutup={() => setAtur(false)}
          onTersimpan={() => {
            setAtur(false);
            void muatUlang();
            void usulan.muatUlang();
          }}
        />
      )}
    </div>
  );
}

function Baris({ r, rencana, usulan, onBuka }: { r: JurusanJtr; rencana?: Rencana; usulan?: UsulanJtr; onBuka: () => void }) {
  const merahArus = r.arus_lebih ? "text-red-600 font-bold" : "text-ink";
  const tanpaArus = r.jtr_ada && !(r.arus_maks && r.arus_maks > 0);
  const slotKosong = r.jurusan_tersedia !== null && r.jurusan_terpakai !== null ? r.jurusan_tersedia - r.jurusan_terpakai : null;
  const sebab = [r.arus_lebih && "arus", r.kha_lebih && "KHA", r.panjang_lebih && "panjang"].filter(Boolean).join(" · ");

  return (
    <tr onClick={rencana ? onBuka : undefined} className={`border-t border-line align-top hover:bg-navy-50/50 ${rencana ? "cursor-pointer" : ""}`}>
      <td className="px-3 py-2.5">
        <span className="block font-semibold text-ink">{r.gardu_kode}</span>
        <span className="block text-[11px] text-ink-muted max-w-48 truncate">{[r.penyulang, r.gardu_nama].filter(Boolean).join(" · ")}</span>
      </td>
      <td className="px-3 py-2.5 text-center font-bold text-ink">{r.jurusan}</td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        <span className="block text-ink">{angka(r.kva)} kVA</span>
        <span className={`block text-[11px] ${(r.persen_beban ?? 0) > 80 ? "text-red-600 font-semibold" : "text-ink-muted"}`}>
          {r.persen_beban === null ? "belum diukur" : `beban ${angka(r.persen_beban)}%`}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center font-mono text-xs whitespace-nowrap">
        {r.arus_maks === null ? (
          <span className="text-ink-muted">tidak terukur</span>
        ) : (
          <>
            <span className={merahArus}>{angka(r.a_r)}/{angka(r.a_s)}/{angka(r.a_t)}</span>
            {tanpaArus && <span className="block font-sans text-[11px] text-amber-700">arus 0 — cek huruf jurusan</span>}
          </>
        )}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {!r.jtr_ada ? (
          <span className="text-[11px] text-ink-muted">JTR belum diinspeksi</span>
        ) : (
          <>
            <span className="block text-ink">{r.kabel ?? "—"}</span>
            <span className={`block text-[11px] ${r.kha_a === null ? "text-amber-700" : "text-ink-muted"}`}>
              {r.kha_a === null ? "KHA belum diatur" : `KHA ${angka(r.kha_a)} A`}
            </span>
          </>
        )}
      </td>
      <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${r.kha_lebih ? "text-red-600 font-bold" : "text-ink-soft"}`}>
        {r.beban_kha_pct === null ? "—" : `${angka(r.beban_kha_pct, 1)}%`}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
        <span className={`block ${r.panjang_lebih ? "text-red-600 font-bold" : "text-ink"}`}>{r.jtr_ada ? `${angka(r.terjauh_m)} m` : "—"}</span>
        {r.jtr_ada && <span className="block text-[11px] text-ink-muted">sirkuit {angka(r.sirkuit_m)} m</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft whitespace-nowrap">
        {r.jtr_ada ? `${angka(r.jumlah_tiang)} · ${angka(r.jumlah_sr)}` : "—"}
      </td>
      <td className="px-3 py-2.5 text-center whitespace-nowrap">
        {slotKosong === null ? (
          <span className="text-[11px] text-ink-muted">belum ada data</span>
        ) : (
          <>
            <span className="block text-ink">{angka(r.jurusan_terpakai)}/{angka(r.jurusan_tersedia)}</span>
            <span className={`block text-[11px] ${slotKosong > 0 ? "text-emerald-700" : "text-red-600 font-semibold"}`}>
              {slotKosong > 0 ? `${slotKosong} kosong` : "penuh"}
            </span>
          </>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold border ${NADA[r.status]}`}>
          {r.status === "merah" ? "Perlu diperbaiki" : r.status === "kuning" ? "Mendekati" : "Aman"}
        </span>
        {sebab && <span className="block text-[11px] text-red-600 mt-0.5">{sebab}</span>}
      </td>
      <td className="px-3 py-2.5 min-w-56">
        {rencana ? (
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <span className={`block text-xs font-semibold ${NADA_RENCANA[rencana.jenis]}`}>{LABEL_RENCANA[rencana.jenis]}</span>
              <span className="block text-[11px] text-ink-soft">{rencana.ringkas}</span>
              {usulan && (
                <span className={`inline-block mt-1 px-1.5 py-px rounded-full text-[10px] font-semibold border ${NADA_TAHAP[usulan.tahap]}`}>
                  {usulan.tahap === "Usulan" ? "Sudah diusulkan" : usulan.tahap}
                </span>
              )}
            </div>
            {r.jtr_ada && (
              <a
                href={alamatPetaRencana(r.gardu_kode, r.jurusan)}
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 p-1.5 rounded-lg text-navy-600 hover:bg-navy-50"
                title="Lihat di peta"
              >
                <IkonPeta size={15} />
              </a>
            )}
          </div>
        ) : (
          <span className="text-[11px] text-ink-muted">—</span>
        )}
      </td>
    </tr>
  );
}
