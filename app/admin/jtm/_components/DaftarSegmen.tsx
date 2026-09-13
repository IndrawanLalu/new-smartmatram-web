"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, GitMerge, Inbox, Loader2, Plus, Search, TriangleAlert, Users, X,
} from "lucide-react";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useSegmen, type SegmenBaris } from "../_hooks/useSegmen";
import SegmenModal from "./SegmenModal";

const PER_HALAMAN = 20;

export default function DaftarSegmen({ user }: { user: CurrentUser }) {
  const [ulp, setUlp] = useState("");
  const [penyulang, setPenyulang] = useState("");
  const [cari, setCari] = useState("");
  const [halaman, setHalaman] = useState(1);
  const [modalBaru, setModalBaru] = useState(false);
  const [gabungDari, setGabungDari] = useState<SegmenBaris | null>(null);

  const { baris, penyulangList, lepas, total, loading, buat, gabung } = useSegmen(user, ulp);

  const tersaring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return baris.filter(
      (b) =>
        (!penyulang || b.penyulang === penyulang) &&
        (!q ||
          b.nama.toLowerCase().includes(q) ||
          b.penyulang.toLowerCase().includes(q) ||
          (b.penghantar_jenis ?? "").toLowerCase().includes(q)),
    );
  }, [baris, penyulang, cari]);

  const totalHalaman = Math.max(1, Math.ceil(tersaring.length / PER_HALAMAN));
  const hal = Math.min(halaman, totalHalaman);
  const tampil = useMemo(
    () => tersaring.slice((hal - 1) * PER_HALAMAN, hal * PER_HALAMAN),
    [tersaring, hal],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat segmen…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tiang yang sudah di master tapi belum masuk segmen mana pun.
          Regu menyapu PER SEGMEN, jadi tiang seperti ini tidak akan pernah
          muncul di HP — dan itu tidak kelihatan dari mana pun kalau tidak
          disebut di sini: daftar segmennya cuma tampak kosong. */}
      {lepas.jumlah > 0 && (
        <div className={`${CARD} p-4 flex items-start gap-3 border-attention/40`}>
          <TriangleAlert size={18} className="mt-0.5 shrink-0 text-attention" />
          <div className="text-sm text-ink-soft">
            <p className="font-semibold text-ink">
              {lepas.jumlah.toLocaleString("id-ID")} tiang belum masuk segmen mana pun
            </p>
            <p className="text-xs mt-1">
              Penyulang: {lepas.penyulang.join(", ")}. Tiangnya sudah ada di master dan sudah
              terhitung panjang rutenya, tapi <b>tidak akan terlihat regu saat menyapu</b> —
              satuan pekerjaannya segmen. Batas segmen tidak ada di berkas impor; yang
              memperlihatkannya cuma peta. Tandai rentang tiangnya di tab <b>Peta</b>.
            </p>
          </div>
        </div>
      )}

      {/* ── Ringkasan ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kartu label="Segmen" nilai={total.segmen.toLocaleString("id-ID")} />
        <Kartu label="Tiang terdaftar" nilai={total.tiang.toLocaleString("id-ID")} />
        <Kartu
          label="Panjang penghantar"
          nilai={`${total.km.toFixed(2)} km`}
          bantu="dijumlah dari tiap segmen — ruas berimpit terhitung pada masing-masing penyulang"
        />
        <Kartu
          label="Tiang dipikul bersama"
          nilai={total.bersama.toLocaleString("id-ID")}
          bantu="satu batang beton, lebih dari satu penyulang"
        />
      </div>

      {/* ── Saringan ── */}
      <div className={`${CARD} p-4 flex flex-wrap items-end gap-3`}>
        <div className="flex-1 min-w-[220px]">
          <label className={EYEBROW}>Cari</label>
          <div className="relative mt-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={cari}
              onChange={(e) => {
                setCari(e.target.value);
                setHalaman(1);
              }}
              placeholder="Nama segmen, penyulang, penghantar"
              className={`${FIELD} w-full pl-9 pr-8`}
            />
            {cari && (
              <button
                onClick={() => setCari("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
                aria-label="Kosongkan"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        <div>
          <label className={EYEBROW}>Penyulang</label>
          <select
            value={penyulang}
            onChange={(e) => {
              setPenyulang(e.target.value);
              setHalaman(1);
            }}
            className={`${FIELD} mt-1 block max-w-[200px]`}
          >
            <option value="">Semua penyulang</option>
            {[...new Set(baris.map((b) => b.penyulang))].sort().map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {canSeeAllUnits(user.role) && (
          <div>
            <label className={EYEBROW}>ULP</label>
            <select
              value={ulp}
              onChange={(e) => setUlp(e.target.value)}
              className={`${FIELD} mt-1 block`}
            >
              <option value="">Semua ULP</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <button onClick={() => setModalBaru(true)} className={BTN_PRIMARY}>
          <Plus size={16} /> Segmen baru
        </button>
      </div>

      {/* ── Tabel ── */}
      {tersaring.length === 0 ? (
        <div className={`${CARD} flex flex-col items-center gap-2 py-14 text-center`}>
          <Inbox size={32} className="text-ink-muted" />
          <p className="text-sm text-ink-soft max-w-md">
            Belum ada segmen. Buat satu, lalu impor tiangnya — atau impor tiang dulu dan
            sambungkan ke segmen belakangan.
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-left text-ink-soft">
                  <th className="px-4 py-2.5 font-semibold">Segmen</th>
                  <th className="px-3 py-2.5 font-semibold">Penyulang</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Tiang</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Panjang</th>
                  <th className="px-3 py-2.5 font-semibold text-right">Bersama</th>
                  <th className="px-3 py-2.5 font-semibold">Induk</th>
                  <th className="px-3 py-2.5 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {tampil.map((b) => (
                  <tr key={b.segmen_id} className="border-t border-line align-top">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink">{b.nama}</p>
                      <p className="text-[11px] text-ink-muted">
                        {b.ulp}
                        {b.penghantar_jenis
                          ? ` · ${b.penghantar_jenis}${b.penghantar_ukuran ? ` ${b.penghantar_ukuran}` : ""}`
                          : ""}
                        {b.sumber === "impor" ? " · dari impor" : ""}
                      </p>
                      {b.tanpa_batas_hubung && (
                        <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded-full bg-attention-tint text-attention">
                          kedua ujung bukan peralatan hubung
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">{b.penyulang}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-soft">
                      {Number(b.jumlah_tiang).toLocaleString("id-ID")}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                      {Number(b.panjang_km).toFixed(3)} km
                      {b.gawang_tanpa_titik > 0 && (
                        <span
                          className="block text-[10px] text-attention"
                          title="Bentang yang salah satu ujungnya belum punya titik — panjangnya lebih kecil dari semestinya"
                        >
                          {b.gawang_tanpa_titik} bentang tanpa titik
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {b.tiang_bersama > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[#8E24AA] font-semibold">
                          <Users size={12} /> {b.tiang_bersama}
                        </span>
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {b.induk_nama ?? <span className="text-ink-muted">—</span>}
                      {b.jumlah_anak > 0 && (
                        <span className="block text-[11px] text-ink-muted">
                          {b.jumlah_anak} cabang
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        onClick={() => setGabungDari(b)}
                        className="text-ink-muted hover:text-navy-600 p-1"
                        title="Gabungkan ke segmen lain"
                        aria-label={`Gabungkan ${b.nama}`}
                      >
                        <GitMerge size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalHalaman > 1 && (
            <div className="flex items-center justify-between px-4 py-2.5 border-t border-line text-xs text-ink-soft">
              <span>
                {(hal - 1) * PER_HALAMAN + 1}–{Math.min(hal * PER_HALAMAN, tersaring.length)} dari{" "}
                {tersaring.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHalaman((h) => Math.max(1, h - 1))}
                  disabled={hal === 1}
                  className={`${BTN_GHOST} h-8 px-2 disabled:opacity-40`}
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="px-2 tabular-nums">
                  {hal}/{totalHalaman}
                </span>
                <button
                  onClick={() => setHalaman((h) => Math.min(totalHalaman, h + 1))}
                  disabled={hal === totalHalaman}
                  className={`${BTN_GHOST} h-8 px-2 disabled:opacity-40`}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {modalBaru && (
        <SegmenModal
          penyulangList={penyulangList}
          ulpAwal={canSeeAllUnits(user.role) ? ulp : (user.unit ?? "")}
          onSimpan={buat}
          onTutup={() => setModalBaru(false)}
        />
      )}

      {gabungDari && (
        <GabungModal
          dari={gabungDari}
          kandidat={baris.filter(
            (b) => b.penyulang === gabungDari.penyulang && b.segmen_id !== gabungDari.segmen_id,
          )}
          onGabung={gabung}
          onTutup={() => setGabungDari(null)}
        />
      )}
    </div>
  );
}

function Kartu({ label, nilai, bantu }: { label: string; nilai: string; bantu?: string }) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="text-2xl font-semibold text-ink mt-1 tabular-nums">{nilai}</p>
      {bantu && <p className="text-[11px] text-ink-muted mt-0.5">{bantu}</p>}
    </div>
  );
}

function GabungModal({
  dari,
  kandidat,
  onGabung,
  onTutup,
}: {
  dari: SegmenBaris;
  kandidat: SegmenBaris[];
  onGabung: (dari: string, ke: string) => Promise<boolean>;
  onTutup: () => void;
}) {
  const [ke, setKe] = useState("");
  const [proses, setProses] = useState(false);

  const jalan = async () => {
    setProses(true);
    const ok = await onGabung(dari.segmen_id, ke);
    setProses(false);
    if (ok) onTutup();
  };

  return (
    <ModalShell
      title="Gabungkan segmen"
      subtitle={`${dari.nama} akan dinonaktifkan, tiangnya pindah ke segmen tujuan.`}
      maxWidth="max-w-lg"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>
            Batal
          </button>
          <button onClick={() => void jalan()} disabled={!ke || proses} className={BTN_PRIMARY}>
            {proses && <Loader2 size={15} className="animate-spin" />}
            Gabungkan
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className={EYEBROW}>Gabungkan ke</label>
          <select value={ke} onChange={(e) => setKe(e.target.value)} className={`${FIELD} mt-1 w-full`}>
            <option value="">— pilih segmen tujuan —</option>
            {kandidat.map((k) => (
              <option key={k.segmen_id} value={k.segmen_id}>
                {k.nama} ({Number(k.jumlah_tiang)} tiang)
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-ink-soft bg-surface rounded-xl p-3">
          Yang berpindah cuma <b>keanggotaan tiang</b>. Tiangnya sendiri tidak disentuh — yang
          salah memang bukan tiangnya, melainkan pembagian ruasnya. Segmen cabang yang berinduk
          pada segmen ini ikut dialihkan supaya pohonnya tidak putus.
          {kandidat.length === 0 && (
            <span className="block mt-2 text-attention">
              Belum ada segmen lain di penyulang {dari.penyulang}. Penggabungan beda penyulang
              ditolak — itu pemindahan kepemilikan, bukan penggabungan.
            </span>
          )}
        </p>
      </div>
    </ModalShell>
  );
}
