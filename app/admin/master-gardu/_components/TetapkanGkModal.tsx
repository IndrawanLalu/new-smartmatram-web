"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { ALASAN_GK, kunciGk, type AlasanGk } from "@/lib/garduKhusus";
import { BTN_GHOST, BTN_PRIMARY, CHIP, CHIP_OFF, CHIP_ON, EYEBROW, FIELD } from "@/app/admin/_ui";
import { KakiTabel } from "@/app/admin/_kit/Tabel";
import ModalShell from "@/app/admin/_components/ModalShell";
import type { GarduPilihGk } from "../_hooks/useGarduKhusus";

const PER_HAL = 20;

/**
 * Pilih gardu → alasan → Tetapkan gardu khusus. Saringan "AMG: khusus" hanya
 * PETUNJUK (keputusan user 13 Nov 2026): tanda AMG tidak selalu sama dengan
 * kenyataan di lapangan, jadi tidak ada yang ditetapkan tanpa dipilih orang.
 */
export default function TetapkanGkModal({
  muatPilihan, sudah, onTutup, onTetapkan,
}: {
  muatPilihan: () => Promise<GarduPilihGk[]>;
  /** `kunciGk` gardu yang sudah gardu khusus — tidak ditawarkan lagi. */
  sudah: Set<string>;
  onTutup: () => void;
  onTetapkan: (gardu: { kode: string; ulp: string }[], alasan: AlasanGk[], keterangan: string) => Promise<boolean>;
}) {
  const [daftar, setDaftar] = useState<GarduPilihGk[] | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [cari, setCari] = useState("");
  const [amg, setAmg] = useState(false);
  const [hal, setHal] = useState(1);
  const [pilih, setPilih] = useState<Map<string, GarduPilihGk>>(new Map());
  const [alasan, setAlasan] = useState<AlasanGk[]>([]);
  const [keterangan, setKeterangan] = useState("");
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    muatPilihan().then(setDaftar, (e: Error) => setGalat(e.message));
  }, [muatPilihan]);

  const tampil = useMemo(() => {
    const q = cari.trim().toUpperCase();
    return (daftar ?? []).filter((g) =>
      !sudah.has(kunciGk(g.kode, g.ulp)) &&
      (!amg || g.amg) &&
      (!q || [g.kode, g.nama ?? "", g.feeder ?? ""].some((v) => v.toUpperCase().includes(q))));
  }, [daftar, cari, amg, sudah]);
  const totalHal = Math.max(1, Math.ceil(tampil.length / PER_HAL));
  const halIni = tampil.slice((hal - 1) * PER_HAL, hal * PER_HAL);

  const ubah = (g: GarduPilihGk) =>
    setPilih((p) => {
      const m = new Map(p);
      const k = kunciGk(g.kode, g.ulp);
      if (m.has(k)) m.delete(k);
      else m.set(k, g);
      return m;
    });
  const pilihHalIni = () =>
    setPilih((p) => {
      const m = new Map(p);
      for (const g of halIni) m.set(kunciGk(g.kode, g.ulp), g);
      return m;
    });

  const kirim = async () => {
    setSibuk(true);
    const ok = await onTetapkan([...pilih.values()].map((g) => ({ kode: g.kode, ulp: g.ulp })), alasan, keterangan.trim());
    setSibuk(false);
    if (ok) onTutup();
  };

  return (
    <ModalShell
      title="Tetapkan gardu khusus"
      subtitle="Gardu terpilih keluar dari WO Inspeksi Gardu, Inspeksi JTR, dan Pemeliharaan Gardu"
      maxWidth="max-w-3xl"
      onClose={onTutup}
      footer={
        <>
          <span className="text-sm text-ink-soft">{pilih.size} gardu dipilih</span>
          <div className="flex gap-2">
            <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
            <button
              onClick={() => void kirim()}
              disabled={sibuk || pilih.size === 0 || alasan.length === 0}
              title={pilih.size === 0 ? "Pilih gardunya dulu" : alasan.length === 0 ? "Pilih alasannya dulu" : undefined}
              className={BTN_PRIMARY}
            >
              {sibuk && <Loader2 size={15} className="animate-spin" />}
              Tetapkan gardu khusus{pilih.size ? ` (${pilih.size})` : ""}
            </button>
          </div>
        </>
      }
    >
      <div>
        <p className={`${EYEBROW} mb-1.5`}>Alasan — wajib, boleh lebih dari satu</p>
        <div className="flex flex-wrap gap-2">
          {ALASAN_GK.map((a) => {
            const on = alasan.includes(a.kode);
            return (
              <button
                key={a.kode}
                onClick={() => setAlasan((x) => (on ? x.filter((y) => y !== a.kode) : [...x, a.kode]))}
                className={`${CHIP} ${on ? CHIP_ON : CHIP_OFF}`}
              >
                {a.label}
              </button>
            );
          })}
        </div>
        <input
          value={keterangan}
          onChange={(e) => setKeterangan(e.target.value)}
          placeholder="Keterangan (boleh kosong) — mis. gardu di basement hotel"
          className={`${FIELD} w-full mt-3`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={cari}
            onChange={(e) => { setCari(e.target.value); setHal(1); }}
            placeholder="Cari kode, nama, penyulang…"
            className={`${FIELD} pl-8 w-full`}
          />
        </div>
        <button
          onClick={() => { setAmg((x) => !x); setHal(1); }}
          title="Tanda GRD KHUSUS = YA dari data AMG — hanya petunjuk, periksa dulu"
          className={`${CHIP} ${amg ? CHIP_ON : CHIP_OFF}`}
        >
          AMG: khusus, belum ditetapkan
        </button>
        <button onClick={pilihHalIni} disabled={halIni.length === 0} className={BTN_GHOST}>Pilih yang tampil</button>
        {pilih.size > 0 && <button onClick={() => setPilih(new Map())} className={BTN_GHOST}>Kosongkan pilihan</button>}
      </div>

      {galat && <p className="text-sm text-red-700">{galat}</p>}
      {!daftar && !galat && (
        <div className="flex items-center gap-2 py-8 justify-center text-sm text-ink-soft">
          <Loader2 size={15} className="animate-spin" /> Memuat master gardu…
        </div>
      )}
      {daftar && (
        <div className="border border-line rounded-xl overflow-hidden">
          {halIni.length === 0 ? (
            <p className="text-sm text-ink-soft p-6 text-center">Tidak ada gardu yang cocok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {halIni.map((g) => {
                const k = kunciGk(g.kode, g.ulp);
                return (
                  <li key={k}>
                    <label className="flex items-center gap-3 px-4 py-2 cursor-pointer hover:bg-navy-50/50 text-sm">
                      <input type="checkbox" checked={pilih.has(k)} onChange={() => ubah(g)} className="accent-navy-600" />
                      <b className="w-20 shrink-0">{g.kode}</b>
                      <span className="flex-1 truncate text-ink-soft">{g.nama ?? "—"}</span>
                      <span className="text-xs text-ink-muted truncate max-w-40">{g.feeder ?? ""} · {g.ulp}</span>
                      {g.amg && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                          AMG: khusus
                        </span>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-line">
            <KakiTabel hal={hal} total={totalHal} onHal={setHal} ringkas={`${tampil.length} gardu`} />
          </div>
        </div>
      )}
    </ModalShell>
  );
}
