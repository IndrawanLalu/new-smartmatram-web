"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown, ChevronRight, History, Loader2, Pencil, Plus, ShieldAlert, Trash2,
} from "lucide-react";
import type { CurrentUser } from "@/lib/roles";
import { BTN_PRIMARY, CARD, EYEBROW } from "@/app/admin/_ui";
import { usePengaturanRef, type ItemRef } from "../_hooks/usePengaturanRef";
import ItemRefModal from "./ItemRefModal";
import OpsiEditor from "./OpsiEditor";

const DIMENSI_LABEL: Record<string, string> = {
  tunggal: "sekali",
  fasa: "per fasa",
  jurusan: "per jurusan",
};

const AKSI_LABEL: Record<string, string> = {
  tambah: "ditambah",
  ubah: "diubah",
  nonaktif: "dinonaktifkan",
  hapus: "dihapus",
};

const waktu = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function PengaturanItem({ user }: { user: CurrentUser }) {
  const {
    kelompok, opsiPer, pakaiItem, pakaiOpsi, riwayat, loading,
    simpanItem, hapusItem, simpanOpsi, hapusOpsi,
  } = usePengaturanRef(user.name || user.email);

  const [terbuka, setTerbuka] = useState<string | null>(null);
  const [modal, setModal] = useState<{ awal?: ItemRef } | null>(null);

  const namaKelompok = useMemo(() => kelompok.map((k) => k.nama), [kelompok]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat daftar isian…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 flex flex-wrap items-start justify-between gap-3`}>
        <div className="max-w-2xl">
          <p className={EYEBROW}>Daftar isian pemeriksaan</p>
          <p className="text-xs text-ink-soft mt-1">
            Satu daftar untuk <b>semua ULP</b>, dan hanya UP3 yang boleh mengubahnya — kalau tiap
            unit mengarang kosakatanya sendiri, angka se-UP3 tidak bisa dijumlahkan lagi.
            Perubahan di sini langsung dipakai formulir HP regu, tanpa menunggu rilis aplikasi.
          </p>
        </div>
        <button onClick={() => setModal({})} className={BTN_PRIMARY}>
          <Plus size={16} /> Item baru
        </button>
      </div>

      {kelompok.map((k) => (
        <div key={k.nama} className={`${CARD} overflow-hidden`}>
          <div className="px-4 py-2.5 bg-surface border-b border-line flex items-baseline gap-2">
            <p className="text-sm font-semibold text-ink">{k.nama}</p>
            <p className="text-[11px] text-ink-muted">{k.daftar.length} item</p>
          </div>

          {k.daftar.map((i) => {
            const dipakai = pakaiItem[i.kode] ?? 0;
            const berpilihan = i.tipe === "pilihan";
            const buka = terbuka === i.kode;

            return (
              <div key={i.kode} className="border-b border-line last:border-b-0">
                <div
                  className={`flex flex-wrap items-center gap-2 px-4 py-2.5 ${
                    i.aktif ? "" : "opacity-55"
                  }`}
                >
                  <button
                    onClick={() => setTerbuka(buka ? null : i.kode)}
                    disabled={!berpilihan}
                    className="text-ink-muted hover:text-ink disabled:opacity-0 shrink-0"
                    aria-label={buka ? "Tutup pilihan" : "Lihat pilihan"}
                  >
                    {buka ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-medium text-ink">{i.nama}</p>
                    <p className="font-mono text-[11px] text-ink-muted">{i.kode}</p>
                  </div>

                  <Tanda>{DIMENSI_LABEL[i.dimensi]}</Tanda>
                  <Tanda>{i.tipe === "angka" ? `angka${i.satuan ? ` · ${i.satuan}` : ""}` : i.tipe}</Tanda>
                  {i.wajib && <Tanda>wajib</Tanda>}
                  {i.tampil_dashboard && <Tanda nyala>dashboard</Tanda>}
                  {!i.aktif && <Tanda>nonaktif</Tanda>}
                  {berpilihan && (
                    <span className="text-[11px] text-ink-muted">
                      {opsiPer(i.kode).length} pilihan
                    </span>
                  )}

                  <span className="text-[11px] text-ink-muted w-[92px] text-right tabular-nums">
                    {dipakai > 0 ? `${dipakai.toLocaleString("id-ID")}× dipakai` : "belum dipakai"}
                  </span>

                  <button
                    onClick={() => setModal({ awal: i })}
                    className="text-ink-muted hover:text-navy-600 p-1"
                    aria-label={`Ubah ${i.nama}`}
                  >
                    <Pencil size={15} />
                  </button>

                  {dipakai > 0 ? (
                    <span
                      className="text-ink-muted p-1"
                      title="Sudah dipakai catatan pemeriksaan — nonaktifkan lewat tombol ubah, jangan dihapus. Menghapusnya membuat laporan lama menunjuk item yang tidak ada lagi."
                    >
                      <ShieldAlert size={15} />
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        if (confirm(`Hapus item "${i.nama}"? Belum pernah dipakai.`))
                          void hapusItem(i.kode);
                      }}
                      className="text-ink-muted hover:text-danger p-1"
                      aria-label={`Hapus ${i.nama}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {buka && berpilihan && (
                  <OpsiEditor
                    itemKode={i.kode}
                    opsi={opsiPer(i.kode)}
                    pakai={pakaiOpsi}
                    onSimpan={simpanOpsi}
                    onHapus={hapusOpsi}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* ── Jejak perubahan ──
          Yang tidak bisa dijaga kode: kalau kosakatanya sering diganti-ganti,
          angka antar tahun jadi sulit dibandingkan meski semuanya tercatat
          benar. Itu disiplin orang — yang bisa dilakukan di sini cuma membuat
          sebabnya bisa ditelusuri kalau suatu saat angkanya patah. */}
      <div className={`${CARD} p-5`}>
        <p className={`${EYEBROW} flex items-center gap-1.5`}>
          <History size={13} /> Riwayat perubahan
        </p>
        {riwayat.length === 0 ? (
          <p className="text-sm text-ink-soft mt-2">Daftar isian belum pernah diubah.</p>
        ) : (
          <ul className="mt-2.5 space-y-1.5">
            {riwayat.map((r) => (
              <li key={r.id} className="text-xs text-ink-soft flex flex-wrap gap-x-2">
                <span className="text-ink-muted tabular-nums">{waktu(r.pada)}</span>
                <span className="font-mono text-ink">{r.kunci}</span>
                <span>{AKSI_LABEL[r.aksi] ?? r.aksi}</span>
                {r.oleh_nama && <span className="text-ink-muted">oleh {r.oleh_nama}</span>}
                <RingkasUbah lama={r.nilai_lama} baru={r.nilai_baru} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {modal && (
        <ItemRefModal
          awal={modal.awal}
          kelompokTersedia={namaKelompok}
          dipakai={modal.awal ? (pakaiItem[modal.awal.kode] ?? 0) : 0}
          onSimpan={simpanItem}
          onTutup={() => setModal(null)}
        />
      )}
    </div>
  );
}

function Tanda({ children, nyala }: { children: React.ReactNode; nyala?: boolean }) {
  return (
    <span
      className={`text-[11px] px-2 py-0.5 rounded-full border ${
        nyala
          ? "bg-navy-50 border-navy-50 text-navy-600 font-medium"
          : "bg-white border-line text-ink-muted"
      }`}
    >
      {children}
    </span>
  );
}

/** Kolom mana yang berpindah, dan dari apa ke apa. Tanpa ini riwayatnya cuma
 *  menyebut "diubah" — dan yang perlu ditelusuri justru isinya. */
function RingkasUbah({
  lama,
  baru,
}: {
  lama: Record<string, unknown> | null;
  baru: Record<string, unknown> | null;
}) {
  const teks = useMemo(() => {
    if (!lama || !baru) return "";
    const abai = new Set(["updated_at", "created_at"]);
    return Object.keys(baru)
      .filter((k) => !abai.has(k) && String(lama[k] ?? "") !== String(baru[k] ?? ""))
      .map((k) => `${k}: ${lama[k] ?? "—"} → ${baru[k] ?? "—"}`)
      .join(", ");
  }, [lama, baru]);

  return teks ? <span className="text-ink-muted">({teks})</span> : null;
}
