"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, KeyRound, Loader2, Send, TestTube2 } from "lucide-react";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, CARD, FIELD } from "@/app/admin/_ui";
import { TAB_PRO_NTB } from "@/lib/proNtbSheet";
import type { BarisCek } from "../_lib/cekProNtb";
import OtomatisProNtb, { type SetelanOtomatis } from "./OtomatisProNtb";

/**
 * Kirim ke spreadsheet PRO NTB (8 Nov 2026, tahap 2) lewat Apps Script
 * (scripts/apps-script-pro-ntb.gs). "Coba kirim" hanya meminta rencana tulis
 * — tidak menulis. "Kirim sungguhan" baru aktif sesudah coba berhasil untuk
 * bulan yang sama. Dikirim SATU TAB per panggilan (9 Nov 2026): semua tab
 * sekaligus bisa melewati batas 6 menit Google. Isi kiriman (WO + realisasi
 * sebulan) disusun DI SERVER — sama dengan Kirim otomatis; NAMA TIM bawaan.
 */

interface Props {
  ulp: string;
  /** "YYYY-MM" — sebulan dari tanggal 1. */
  bulan: string;
  /** Hasil Cek — hanya untuk jumlah baris di layar. */
  baris: BarisCek[];
  pengatur: string | null;
}

interface HasilBaris {
  kode: string; tab: string; baris?: number; aksi: "tambah" | "tandai" | "ubah" | "hapus" | "gagal" | "sisa";
  berubah?: Record<string, [unknown, unknown]>; dilewati?: string[]; pesan?: string;
  /** Kolom yang nilainya di luar dropdown spreadsheet — tetap ditulis, bertanda "tidak valid". */
  luarDaftar?: string[];
}

const AKSI: Record<HasilBaris["aksi"], string> = {
  tambah: "Ditambah di bawah", tandai: "Ditandai (sudah ada)", ubah: "Diperbarui", hapus: "Dikosongkan", gagal: "Gagal",
  sisa: "Belum (waktu habis)",
};
const TD = "px-2.5 py-1.5 border-b border-line align-top text-xs";
const PER_HAL = 20;

export default function KirimProNtb({ ulp, bulan, baris, pengatur }: Props) {
  const toast = useToast();
  const [status, setStatus] = useState<{ adaKunci: boolean; url: string | null; otomatis?: SetelanOtomatis | null } | null>(null);
  const [kunciBaru, setKunciBaru] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  /** Form ganti URL (sesudah "Deployment baru" — kunci tetap). */
  const [gantiUrl, setGantiUrl] = useState(false);
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [hasil, setHasil] = useState<{ coba: boolean; hasil: HasilBaris[]; bulan: string; versiLama: boolean } | null>(null);
  /** Tab yang sedang dikirim, mis. "WO RABAS (1/9)". */
  const [kemajuan, setKemajuan] = useState<string | null>(null);
  const [tanya, setTanya] = useState(false);
  const [hal, setHal] = useState(1);
  const [nonce, setNonce] = useState(0);
  const [galat, setGalat] = useState<string | null>(null);
  /** Galat kiriman terakhir — tetap tampil (bukan toast) sampai kiriman berikutnya. */
  const [galatKirim, setGalatKirim] = useState<string | null>(null);

  const jumlahSmart = baris.filter((c) => c.smart).length;

  useEffect(() => {
    fetch(`/api/pro-ntb/kirim?ulp=${encodeURIComponent(ulp)}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
        setStatus(j);
      })
      .catch((e: Error) => { setStatus({ adaKunci: false, url: null }); setGalat(e.message); });
  }, [ulp, nonce]);

  const panggil = async (isi: Record<string, unknown>, tanda: string) => {
    setSibuk(tanda);
    try {
      const r = await fetch("/api/pro-ntb/kirim", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ulp, ...isi }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `server menjawab ${r.status}`);
      return j;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    } finally {
      setSibuk(null);
    }
  };

  const kirim = async (coba: boolean) => {
    setSibuk(coba ? "coba" : "kirim");
    setGalatKirim(null);
    setHal(1);
    const isi: HasilBaris[] = [];
    const galatTab: string[] = [];
    let versiLama = false;
    // Semua tab, juga yang kosong: baris SMART yang dihapus di SMART ikut dikosongkan.
    for (const [i, tab] of TAB_PRO_NTB.entries()) {
      setKemajuan(`${tab} (${i + 1}/${TAB_PRO_NTB.length})`);
      try {
        const r = await fetch("/api/pro-ntb/kirim", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ulp, aksi: "kirim", tab, coba, bulan,
            cekSesudah: !coba && i === TAB_PRO_NTB.length - 1,
          }),
        });
        const j = await r.json().catch(() => ({ error: `server menjawab ${r.status}` }));
        isi.push(...((j.hasil ?? []) as HasilBaris[]));
        if (!r.ok) {
          galatTab.push(`${tab}: ${j.error ?? `server menjawab ${r.status}`}`);
          // Skrip lama mengabaikan `tab` → berhenti, jangan diteruskan ke tab lain.
          if (/versi lama/.test(j.error ?? "")) { versiLama = true; break; }
        }
      } catch (e) {
        galatTab.push(`${tab}: ${(e as Error).message}`);
      }
      setHasil({ coba, hasil: [...isi], bulan, versiLama });
    }
    setHasil({ coba, hasil: isi, bulan, versiLama });
    setKemajuan(null);
    setSibuk(null);
    const gagal = isi.filter((h) => h.aksi === "gagal").length;
    if (galatTab.length) setGalatKirim(galatTab.join(" · "));
    else if (gagal) setGalatKirim(`${gagal} baris gagal — lihat baris merah di bawah.`);
    else toast.success(coba ? "Rencana tulis diterima — belum ada yang ditulis." : `${isi.length} baris tertulis ke spreadsheet.`);
  };

  /** Ringkasan per tab: berhasil vs gagal — supaya terlihat di mana masalahnya. */
  const perTab = useMemo(() => {
    const m = new Map<string, { ok: number; gagal: number }>();
    for (const h of hasil?.hasil ?? []) {
      const x = m.get(h.tab) ?? { ok: 0, gagal: 0 };
      if (h.aksi === "gagal") x.gagal++; else x.ok++;
      m.set(h.tab, x);
    }
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [hasil]);

  // "ubah" tanpa sel berubah = sudah sama — dihitung terpisah.
  const berubah = (h: HasilBaris) => h.aksi !== "ubah" || Object.keys(h.berubah ?? {}).length > 0;
  const hitung = (a: HasilBaris["aksi"]) => hasil?.hasil.filter((h) => h.aksi === a && berubah(h)).length ?? 0;
  const tetap = hasil?.hasil.filter((h) => !berubah(h)).length ?? 0;
  // Baris yang gagal (mis. LOKASI tidak ada di dropdown) dilewati skrip; sisanya tetap boleh dikirim.
  const cobaSah = hasil?.coba && hasil.bulan === bulan && !hasil.versiLama && !sibuk;
  const terpasang = !!status?.adaKunci && !!status.url;
  const jalanOtomatis = !!status?.otomatis?.otomatis_mulai && !status.otomatis.otomatis_selesai;

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-ink">Kirim ke spreadsheet</p>
        <span className="text-xs text-ink-soft">
          {jumlahSmart} baris SMART (WO + realisasi sebulan) · yang sudah ada diperbarui di tempatnya, yang belum ditambah di bawah baris terakhir. Kolom STATUS &amp; JAM tidak diisi SMART.
        </span>
      </div>

      {galat && <p className="text-xs text-red-700">{galat}</p>}
      {!status ? (
        <p className="text-xs text-ink-muted flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Memeriksa pemasangan skrip…</p>
      ) : !terpasang ? (
        <div className="space-y-2 text-xs text-ink-soft">
          <p>
            Skrip spreadsheet {ulp} belum dipasang. Langkah: <b>1.</b> Buat kunci di bawah. <b>2.</b> Di spreadsheet:
            Ekstensi → Apps Script → tambah file skrip baru, tempel isi <code>scripts/apps-script-pro-ntb.gs</code>, ganti
            <code> RAHASIA</code> dengan kuncinya. <b>3.</b> Terapkan → Deployment baru → Aplikasi web (jalankan sebagai: Saya,
            akses: Siapa saja). <b>4.</b> Tempel URL aplikasi web di bawah.
          </p>
          {pengatur ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={async () => { const j = await panggil({ aksi: "kunci" }, "kunci"); if (j) { setKunciBaru(j.rahasia); setNonce((n) => n + 1); } }}
                  className={BTN_GHOST} disabled={!!sibuk}>
                  <KeyRound size={14} /> {status.adaKunci ? "Buat kunci baru" : "Buat kunci"}
                </button>
                {kunciBaru && (
                  <span className="inline-flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-2 py-1 font-mono text-amber-900">
                    {kunciBaru}
                    <button onClick={() => void navigator.clipboard.writeText(kunciBaru).then(() => toast.success("Kunci tersalin."))} aria-label="Salin kunci"><Copy size={13} /></button>
                  </span>
                )}
              </div>
              {kunciBaru && <p className="text-amber-700">Kunci hanya tampil sekali — salin sekarang ke skrip.</p>}
              {status.adaKunci && (
                <div className="flex flex-wrap items-end gap-2">
                  <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" className={`${FIELD} flex-1 min-w-[300px]`} />
                  <button onClick={async () => { if (await panggil({ aksi: "url", url }, "url")) { setUrl(""); setNonce((n) => n + 1); } }}
                    className={BTN_PRIMARY} disabled={!!sibuk || !url.trim()}>Simpan URL</button>
                </div>
              )}
            </>
          ) : <p className="text-ink-muted">Minta UP3/admin memasang skripnya.</p>}
        </div>
      ) : (
        <>
          {jalanOtomatis && (
            <p className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              Kirim otomatis sedang berjalan — Kirim sungguhan menunggu sampai selesai.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">Skrip: {status.url}</span>
            {pengatur && !gantiUrl && (
              <button onClick={() => setGantiUrl(true)} className="text-xs text-brand-700 hover:underline">Ganti URL</button>
            )}
            <span className="flex-1" />
            <button onClick={() => void kirim(true)} className={BTN_GHOST} disabled={!!sibuk}>
              {sibuk === "coba" ? <Loader2 size={14} className="animate-spin" /> : <TestTube2 size={14} />} Coba kirim
            </button>
            {pengatur && (
              <button onClick={() => setTanya(true)} className={BTN_PRIMARY} disabled={!!sibuk || !cobaSah || jalanOtomatis}
                title={cobaSah ? undefined : "Jalankan Coba kirim dulu untuk bulan ini"}>
                {sibuk === "kirim" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Kirim sungguhan
              </button>
            )}
          </div>

          {gantiUrl && pengatur && (
            <div className="flex flex-wrap items-end gap-2 rounded-xl border border-line px-3 py-2">
              <p className="w-full text-[11px] text-ink-soft">
                URL baru dari &quot;Deployment baru&quot;. Kunci RAHASIA tetap sama — tidak perlu diganti di skrip.
                (Kelola deployment → Edit → Versi baru tidak mengubah URL.)
              </p>
              <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" className={`${FIELD} flex-1 min-w-[300px]`} />
              <button onClick={() => { setGantiUrl(false); setUrl(""); }} className={BTN_GHOST} disabled={!!sibuk}>Batal</button>
              <button
                onClick={async () => {
                  if (await panggil({ aksi: "url", url }, "url")) {
                    toast.success("URL skrip diganti.");
                    setUrl(""); setGantiUrl(false); setHasil(null); setNonce((n) => n + 1);
                  }
                }}
                className={BTN_PRIMARY} disabled={!!sibuk || !url.trim()}
              >Simpan URL</button>
            </div>
          )}

          {kemajuan && (
            <p className="text-xs text-ink-soft flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {sibuk === "coba" ? "Coba kirim" : "Mengirim"} {kemajuan}…
            </p>
          )}

          {status.otomatis !== undefined && (
            <OtomatisProNtb ulp={ulp} setelan={status.otomatis} pengatur={!!pengatur} onBerubah={() => setNonce((n) => n + 1)} />
          )}

          {galatKirim && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              <b>{hasil?.coba === false ? "Kirim" : "Coba kirim"} belum berhasil penuh:</b> {galatKirim}
            </div>
          )}

          {hasil && (
            <>
              {perTab.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {perTab.map(([tab, x]) => (
                    <span key={tab} className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${x.gagal ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                      {tab}: {x.ok} {hasil.coba ? "siap" : "berhasil"}{x.gagal ? ` · ${x.gagal} gagal` : ""}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-ink-soft">
                <b>{hasil.coba ? "Rencana (belum ditulis)" : "Sudah ditulis"}:</b>{" "}
                {(["tambah", "tandai", "ubah", "hapus", "gagal", "sisa"] as const).filter((a) => a !== "sisa" || hitung(a))
                  .map((a) => `${AKSI[a]} ${hitung(a)}`).join(" · ")} · Tidak berubah {tetap}
              </p>
              {hitung("gagal") > 0 && <p className="text-xs text-red-700">{hitung("gagal")} baris gagal — lihat pesannya di bawah.</p>}
              {hasil.hasil.some((h) => h.luarDaftar?.length) && (
                <p className="text-xs text-amber-700">
                  {hasil.hasil.filter((h) => h.luarDaftar?.length).length} baris nilainya di luar daftar dropdown spreadsheet
                  (mis. nama segmen baru) — tetap ditulis apa adanya, selnya bertanda &quot;tidak valid&quot;.
                </p>
              )}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <tbody>
                    {[...hasil.hasil].sort((a, b) => Number(b.aksi === "gagal") - Number(a.aksi === "gagal"))
                      .slice((hal - 1) * PER_HAL, hal * PER_HAL).map((h) => (
                      <tr key={h.kode}>
                        <td className={`${TD} whitespace-nowrap`}>{h.tab}</td>
                        <td className={`${TD} whitespace-nowrap tabular-nums`}>{h.baris ? `baris ${h.baris}` : "—"}</td>
                        <td className={`${TD} whitespace-nowrap ${h.aksi === "gagal" ? "text-red-700 font-semibold" : ""}`}>{AKSI[h.aksi]}</td>
                        <td className={TD}>
                          {h.pesan ?? Object.entries(h.berubah ?? {}).map(([k, [l, b]]) => `${k}: ${String(l ?? "") || "kosong"} → ${String(b)}`).join(" · ")}
                          {!!h.dilewati?.length && <span className="block text-[10px] text-ink-muted">kolom rumus dilewati: {h.dilewati.join(", ")}</span>}
                          {!!h.luarDaftar?.length && <span className="block text-[10px] text-amber-700">di luar dropdown: {h.luarDaftar.join(", ")}</span>}
                        </td>
                        <td className={`${TD} font-mono text-[10px] text-ink-muted`}>{h.kode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasil.hasil.length > PER_HAL && (
                <div className="flex justify-end gap-2 text-xs">
                  <button className={BTN_GHOST} disabled={hal <= 1} onClick={() => setHal(hal - 1)}>Sebelumnya</button>
                  <button className={BTN_GHOST} disabled={hal * PER_HAL >= hasil.hasil.length} onClick={() => setHal(hal + 1)}>Berikutnya</button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tanya && (
        <ConfirmDialog
          title={`Kirim WO + realisasi ${bulan} ke spreadsheet PRO NTB ${ulp}?`}
          message={`Sesuai rencana coba: ${hitung("tambah")} ditambah, ${hitung("tandai")} ditandai, ${hitung("ubah")} diperbarui, ${hitung("hapus")} dikosongkan${hitung("gagal") ? `, ${hitung("gagal")} dilewati (gagal)` : ""}. Kolom rumus dan isian STATUS/JAM tidak disentuh.`}
          confirmLabel="Tulis sekarang"
          tone="primary"
          onConfirm={() => { setTanya(false); void kirim(false); }}
          onClose={() => setTanya(false)}
        />
      )}
    </div>
  );
}
