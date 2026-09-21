"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Trees, X } from "lucide-react";
import { CARD, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, type CurrentUser } from "@/lib/roles";
import type { Regu, WoItem, WoRingkas } from "../_hooks/useWoPerabasan";

/**
 * WO perabasan yang sudah terbit, beserta capaiannya.
 *
 * Capaian yang ditampilkan HANYA dari item yang sudah diverifikasi — itu yang
 * dihitung view, dan layar ini tidak menghitung ulang. Yang berstatus Selesai
 * sengaja belum masuk: laporan yang belum diperiksa siapa pun bukan capaian,
 * dan kalau ikut dihitung, angkanya akan turun lagi saat admin menolaknya.
 * Grafik yang bisa turun sendiri membuat orang berhenti mempercayainya.
 */

const WARNA_STATUS: Record<string, string> = {
  Dijadwalkan: "bg-slate-100 text-ink-soft border-line",
  "Dalam Proses": "bg-amber-50 text-amber-700 border-amber-200",
  Selesai: "bg-sky-50 text-sky-700 border-sky-200",
  Diverifikasi: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Ditolak: "bg-red-50 text-red-700 border-red-200",
  Dibatalkan: "bg-slate-100 text-ink-muted border-line line-through",
};

export default function DaftarWo({
  wo,
  item,
  regu,
  tanpaRegu,
  loading,
  user,
  onBatalkanItem,
  onTugaskanRegu,
}: {
  wo: WoRingkas[];
  item: WoItem[];
  regu: Regu[];
  tanpaRegu: WoItem[];
  loading: boolean;
  user: CurrentUser;
  onBatalkanItem: (itemId: string, alasan: string) => Promise<boolean>;
  onTugaskanRegu: (itemId: string, namaRegu: string) => Promise<boolean>;
}) {
  const bolehSemua = canSeeAllUnits(user.role);
  const [saring, setSaring] = useState(bolehSemua ? "" : (user.unit ?? ""));
  const [buka, setBuka] = useState<string | null>(null);

  const daftarUlp = useMemo(() => [...new Set(wo.map((w) => w.ulp))].sort(), [wo]);
  const tampil = useMemo(() => wo.filter((w) => !saring || w.ulp === saring), [wo, saring]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat WO perabasan…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {bolehSemua && daftarUlp.length > 0 && (
        <div className={`${CARD} p-4 flex flex-wrap gap-2`}>
          <button
            onClick={() => setSaring("")}
            className={`${CHIP} ${saring === "" ? CHIP_ON : CHIP_OFF}`}
          >
            Semua ULP
          </button>
          {daftarUlp.map((u) => (
            <button
              key={u}
              onClick={() => setSaring(u)}
              className={`${CHIP} ${saring === u ? CHIP_ON : CHIP_OFF}`}
            >
              {u}
            </button>
          ))}
        </div>
      )}

      {/* Pekerjaan yang tidak muncul di HP siapa pun. Ditaruh DI ATAS daftar WO
          karena dari kartu WO ia terlihat persis sama dengan pekerjaan yang
          sedang berjalan — bedanya cuma bahwa tidak ada yang mengerjakannya. */}
      {tanpaRegu.filter((i) => !saring || i.ulp === saring).length > 0 && (
        <div className={`${CARD} p-5 border-red-200`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-red-700">
            Belum ditugaskan ke regu
          </p>
          <p className="text-xs text-ink-soft mt-1 max-w-3xl">
            Segmen berikut sudah masuk WO tapi <b>tidak muncul di HP regu mana pun</b>. Pilih
            regunya di baris masing-masing — tiap regu hanya melihat segmennya sendiri, sepola
            temuan.
          </p>
          <div className="mt-3 space-y-1.5">
            {tanpaRegu
              .filter((i) => !saring || i.ulp === saring)
              .map((i) => (
                <div key={i.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-xs text-ink-soft w-[120px] truncate">{i.penyulang}</span>
                  <span className="text-ink flex-1 min-w-[180px]">{i.segmen_nama}</span>
                  <span className="font-mono tabular-nums text-xs text-ink-soft w-[64px] text-right">
                    {i.panjang_km !== null ? Number(i.panjang_km).toFixed(2) : "—"}
                  </span>
                  <PilihRegu
                    item={i}
                    regu={regu.filter((g) => g.ulp === i.ulp)}
                    onTugaskan={onTugaskanRegu}
                  />
                </div>
              ))}
          </div>
        </div>
      )}

      {tampil.length === 0 && (
        <div className={`${CARD} p-10 text-center`}>
          <Trees size={28} className="mx-auto text-ink-muted opacity-40" />
          <p className="text-sm text-ink-soft mt-2">Belum ada WO perabasan.</p>
          <p className="text-xs text-ink-muted mt-1">
            Terbitkan lewat tab <b>Terbitkan WO</b> — segmennya diambil dari Master Segmen.
          </p>
        </div>
      )}

      {tampil.map((w) => {
        const isi = item.filter((i) => i.wo_id === w.wo_id);
        const terbuka = buka === w.wo_id;
        const persen = Math.min(w.capaian_persen ?? 0, 100);

        return (
          <div key={w.wo_id} className={CARD}>
            <button
              onClick={() => setBuka(terbuka ? null : w.wo_id)}
              className="w-full text-left p-5 flex flex-wrap items-start gap-4"
            >
              {terbuka ? (
                <ChevronDown size={16} className="text-ink-muted mt-1 shrink-0" />
              ) : (
                <ChevronRight size={16} className="text-ink-muted mt-1 shrink-0" />
              )}
              <div className="min-w-[200px] flex-1">
                <p className="font-semibold text-ink">{w.nama}</p>
                <p className="text-xs text-ink-muted mt-0.5">
                  {w.ulp} · {w.tgl_wo} · {w.item} segmen
                  {w.pohon_dirabas > 0 && ` · ${w.pohon_dirabas} pohon dirabas`}
                </p>
              </div>

              <div className="min-w-[260px] flex-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="text-ink-soft">
                    <b className="text-ink tabular-nums text-sm">{w.capaian_km.toFixed(2)}</b> /{" "}
                    {w.target_km.toFixed(2)} km
                  </span>
                  <span className="text-ink-muted tabular-nums">{(w.capaian_persen ?? 0).toFixed(1)}%</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full bg-navy-600 rounded-full transition-all"
                    style={{ width: `${persen}%` }}
                  />
                </div>
                {/* Dipisah, bukan dijumlah buta: km dari segmen berpanjang
                    ketikan tidak sebanding dengan yang diukur dari tiang. */}
                {w.capaian_km_ketikan > 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    {w.capaian_km_hitungan.toFixed(2)} km terukur · ✎{" "}
                    {w.capaian_km_ketikan.toFixed(2)} km dari angka ketikan
                  </p>
                )}
                <p className="text-[11px] text-ink-muted mt-0.5">
                  rencana {w.rencana_km.toFixed(2)} km · {w.item_selesai} dari {w.item} segmen
                  diverifikasi
                </p>
              </div>
            </button>

            {terbuka && (
              <div className="px-5 pb-5">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-ink-soft border-b border-line bg-surface">
                        {["#", "Penyulang", "Segmen", "Km", "Regu", "Status", "Petugas", ""].map((h) => (
                          <th key={h} className="px-3 py-2 font-semibold text-xs">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {isi.map((i) => (
                        <BarisItem
                          key={i.id}
                          i={i}
                          regu={regu.filter((g) => g.ulp === i.ulp)}
                          onBatalkan={onBatalkanItem}
                          onTugaskan={onTugaskanRegu}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Pemilih regu satu baris.
 *
 * Dipakai di dua tempat — kartu "belum ditugaskan" dan tabel item — jadi
 * disendirikan. Yang berstatus Selesai TIDAK bisa dipindah: database
 * menolaknya, dan alasannya masuk akal — nama regu yang tercatat mengerjakan
 * akan berbeda dari yang tertulis di WO, dan tidak ada yang bisa menjelaskan
 * selisihnya belakangan.
 */
function PilihRegu({
  item,
  regu,
  onTugaskan,
}: {
  item: WoItem;
  regu: Regu[];
  onTugaskan: (itemId: string, namaRegu: string) => Promise<boolean>;
}) {
  const [sibuk, setSibuk] = useState(false);
  const terkunci = ["Selesai", "Diverifikasi", "Dibatalkan"].includes(item.status);

  if (terkunci) {
    return (
      <span className="text-xs text-ink-soft w-[120px] truncate" title="Tidak bisa dipindah lagi">
        {item.regu ?? "—"}
      </span>
    );
  }

  if (regu.length === 0) {
    return (
      <span className="text-[11px] text-red-700 w-[120px]" title={`ULP ${item.ulp} belum punya regu rabas aktif`}>
        belum ada regu
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <select
        value={item.regu ?? ""}
        disabled={sibuk}
        onChange={async (e) => {
          setSibuk(true);
          await onTugaskan(item.id, e.target.value);
          setSibuk(false);
        }}
        className={`${FIELD} w-[130px] h-8 text-xs disabled:opacity-60 ${
          item.regu ? "" : "border-red-300 text-red-700"
        }`}
        aria-label={`Regu untuk ${item.segmen_nama}`}
      >
        <option value="">— belum dibagi —</option>
        {regu.map((g) => (
          <option key={g.regu} value={g.regu}>
            {g.regu}
          </option>
        ))}
      </select>
      {/* Tanpa pemutar ini, dropdown yang belum berubah selama sepersekian
          detik terbaca sebagai tombol yang tidak bekerja — dan admin
          menekannya lagi. */}
      {sibuk && <Loader2 size={13} className="animate-spin text-ink-muted shrink-0" />}
    </span>
  );
}

function BarisItem({
  i,
  regu,
  onBatalkan,
  onTugaskan,
}: {
  i: WoItem;
  regu: Regu[];
  onBatalkan: (itemId: string, alasan: string) => Promise<boolean>;
  onTugaskan: (itemId: string, namaRegu: string) => Promise<boolean>;
}) {
  const [sibuk, setSibuk] = useState(false);
  const bisaDibatalkan = !["Diverifikasi", "Dibatalkan"].includes(i.status);

  const batalkan = async () => {
    const alasan = prompt(
      `Keluarkan "${i.segmen_nama}" dari WO ini?\n\nTuliskan alasannya — enam bulan lagi tidak ada yang bisa menjawab kenapa segmen ini keluar kalau tidak dicatat sekarang.`,
    );
    if (!alasan?.trim()) return;
    setSibuk(true);
    await onBatalkan(i.id, alasan.trim());
    setSibuk(false);
  };

  return (
    <tr className="border-b border-line last:border-0">
      <td className="px-3 py-2 text-ink-muted tabular-nums text-xs">{i.urutan}</td>
      <td className="px-3 py-2 text-ink-soft text-xs whitespace-nowrap">{i.penyulang}</td>
      <td className="px-3 py-2 text-ink">{i.segmen_nama}</td>
      <td className="px-3 py-2 font-mono tabular-nums text-xs">
        {i.panjang_km !== null ? Number(i.panjang_km).toFixed(2) : "—"}
        {i.panjang_dari === "ketikan" && <span className="text-amber-600"> ✎</span>}
      </td>
      <td className="px-3 py-2">
        <PilihRegu item={i} regu={regu} onTugaskan={onTugaskan} />
      </td>
      <td className="px-3 py-2">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full border font-semibold ${WARNA_STATUS[i.status] ?? ""}`}
          title={i.verified_note ?? i.catatan ?? undefined}
        >
          {i.status}
        </span>
        {i.status === "Ditolak" && i.verified_note && (
          <span className="block text-[10px] text-red-700 mt-0.5 max-w-[220px] leading-tight">
            {i.verified_note}
          </span>
        )}
      </td>
      <td className="px-3 py-2 text-ink-soft text-xs">{i.petugas_nama ?? "—"}</td>
      <td className="px-3 py-2">
        {bisaDibatalkan && (
          <button
            onClick={() => void batalkan()}
            disabled={sibuk}
            title="Keluarkan dari WO ini"
            className="text-ink-muted hover:text-red-600 transition-colors disabled:opacity-40"
          >
            {sibuk ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
          </button>
        )}
      </td>
    </tr>
  );
}
