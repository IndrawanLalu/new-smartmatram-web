"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, ShieldAlert, TriangleAlert } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import type { HasilPratinjau, PratinjauGanti } from "../_hooks/usePenyulangRef";

/**
 * Ganti nama penyulang — selalu dilingkupi satu ULP.
 *
 * Seluruh angka di layar ini datang dari `pratinjau_ganti_nama_penyulang`, dan
 * tidak satu pun dihitung di sini. Alasannya bukan kemalasan: fungsi yang
 * MELAKSANAKAN penggantian memakai hitungan yang sama persis, jadi yang
 * dijanjikan layar dan yang benar-benar berubah tidak bisa berbeda. Layar yang
 * menghitung sendiri akan memakai aturan pencocokan yang sedikit lain, dan
 * selisihnya baru ketahuan sesudah tombolnya ditekan.
 *
 * Bagian yang paling penting di sini bukan daftar "berubah", melainkan daftar
 * "TIDAK berubah". Tanpa itu admin TANJUNG mengira sudah membetulkan seluruh
 * kekeliruan — padahal separuhnya masih berdiri di ULP sebelah.
 */

const JUDUL_TINDAKAN: Record<PratinjauGanti["tindakan"], { label: string; warna: string }> = {
  ganti: { label: "Ganti nama", warna: "bg-navy-50 text-navy-700 border-navy-200" },
  pisah: { label: "Pisah jadi penyulang tersendiri", warna: "bg-amber-50 text-amber-800 border-amber-300" },
  daftar_baru: { label: "Sekalian didaftarkan ke master", warna: "bg-emerald-50 text-emerald-800 border-emerald-200" },
};

const KETERANGAN_TINDAKAN: Record<PratinjauGanti["tindakan"], string> = {
  ganti:
    "Nama ini cuma dipakai ULP Anda, jadi baris masternya berganti nama di tempat. Riwayat dan identitasnya utuh.",
  pisah:
    "Nama ini juga dipakai ULP lain — berarti dua penyulang berbeda yang kebetulan senama. Penyulang BARU dibuat untuk ULP Anda; punya ULP lain tidak disentuh sama sekali.",
  daftar_baru:
    "Nama ini belum ada di master. Penyulang baru dibuat dengan nama barunya, dan aset ULP Anda dipindahkan ke sana.",
};

export default function GantiNamaModal({
  namaLama,
  ulp,
  oleh,
  onPratinjau,
  onGanti,
  onClose,
}: {
  namaLama: string;
  ulp: string;
  oleh?: string;
  onPratinjau: (lama: string, ulp: string, baru: string) => Promise<HasilPratinjau>;
  onGanti: (lama: string, ulp: string, baru: string, oleh?: string) => Promise<PratinjauGanti | null>;
  onClose: () => void;
}) {
  const [nama, setNama] = useState("");
  const [lihat, setLihat] = useState<PratinjauGanti | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [sibuk, setSibuk] = useState(false);

  // Ditunda 400 ms. Tanpa penundaan, tiap huruf memanggil database — dan
  // pratinjau nama yang baru diketik separuh tidak menjawab pertanyaan siapa pun.
  useEffect(() => {
    let batal = false;
    setMemuat(true);
    const t = setTimeout(async () => {
      const h = await onPratinjau(namaLama, ulp, nama.trim());
      if (batal) return;
      if (h.ok) {
        setLihat(h.data);
        setGalat(null);
      } else {
        setLihat(null);
        setGalat(h.pesan);
      }
      setMemuat(false);
    }, 400);
    return () => {
      batal = true;
      clearTimeout(t);
    };
  }, [namaLama, ulp, nama, onPratinjau]);

  const totalBerubah = useMemo(
    () => (lihat?.berubah ?? []).reduce((n, b) => n + b.baris, 0),
    [lihat],
  );
  const totalTetap = useMemo(
    () => (lihat?.tetap_ulp_lain ?? []).reduce((n, b) => n + b.baris, 0),
    [lihat],
  );

  const bersih = nama.trim().toUpperCase();
  const siap = bersih.length > 1 && bersih !== namaLama && !memuat && !!lihat;

  const kirim = async () => {
    setSibuk(true);
    const hasil = await onGanti(namaLama, ulp, bersih, oleh);
    setSibuk(false);
    if (hasil) onClose();
  };

  return (
    <ModalShell
      title="Ganti nama penyulang"
      subtitle={`${namaLama} · ULP ${ulp}`}
      maxWidth="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <p className="text-[11px] text-ink-muted">
            Berlaku seketika. <b>Tidak ada tombol pengembali</b> — yang tercatat cuma jejak audit.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={onClose} className={BTN_GHOST}>
              Batal
            </button>
            <button onClick={() => void kirim()} disabled={!siap || sibuk} className={BTN_PRIMARY}>
              {sibuk ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              Ganti nama sekarang
            </button>
          </div>
        </>
      }
    >
      <div>
        <label className={EYEBROW}>Nama baru</label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-ink-soft line-through">{namaLama}</span>
          <ArrowRight size={14} className="text-ink-muted" />
          <input
            value={nama}
            onChange={(e) => setNama(e.target.value.toUpperCase())}
            placeholder="NAMA PENYULANG YANG BENAR"
            autoFocus
            className={`${FIELD} flex-1 min-w-[220px] font-semibold`}
          />
        </div>
        <p className="text-[11px] text-ink-muted mt-1.5">
          Huruf, angka, spasi, titik, strip, dan garis miring. Nama penyulang unik di seluruh basis
          data — jadi nama yang sudah dipakai ULP mana pun akan ditolak.
        </p>
      </div>

      {galat && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {galat}
        </div>
      )}

      {memuat && !lihat && (
        <div className="flex items-center gap-2 text-sm text-ink-soft py-6 justify-center">
          <Loader2 size={16} className="animate-spin" /> Menghitung akibatnya…
        </div>
      )}

      {lihat && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center h-7 px-2.5 rounded-full text-xs font-semibold border ${JUDUL_TINDAKAN[lihat.tindakan].warna}`}
            >
              {JUDUL_TINDAKAN[lihat.tindakan].label}
            </span>
            {memuat && <Loader2 size={13} className="animate-spin text-ink-muted" />}
          </div>
          <p className="text-xs text-ink-soft -mt-2">{KETERANGAN_TINDAKAN[lihat.tindakan]}</p>

          {/* ── Yang berubah ── */}
          <Bagian
            judul="Berubah"
            ringkas={`${totalBerubah.toLocaleString("id-ID")} baris di ${lihat.berubah.length} tabel`}
            kosong="Tidak ada satu baris pun yang memakai nama ini di ULP Anda."
            warna="border-line"
          >
            {lihat.berubah.map((b) => (
              <Baris
                key={`${b.tabel}.${b.kolom}`}
                kiri={`${b.tabel}${b.kolom && b.kolom !== "penyulang" ? `.${b.kolom}` : ""}`}
                kanan={`${b.baris.toLocaleString("id-ID")} baris`}
              />
            ))}
          </Bagian>

          {/* ── Yang TIDAK berubah. Bagian terpenting di layar ini. ── */}
          {(lihat.tetap_ulp_lain.length > 0 ||
            lihat.tidak_terlingkup.length > 0 ||
            lihat.tidak_ikut.length > 0) && (
            <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                TIDAK berubah
              </p>

              {lihat.tetap_ulp_lain.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-amber-900">
                    <b>{totalTetap.toLocaleString("id-ID")} baris</b> di ULP lain tetap memakai nama{" "}
                    <b>{lihat.nama_lama}</b>. Penggantian ini tidak menyentuh mereka — memang tidak
                    boleh, karena itu penyulang yang berbeda.
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {lihat.tetap_ulp_lain.map((t) => (
                      <Baris
                        key={t.ulp}
                        kiri={`ULP ${t.ulp}`}
                        kanan={`${t.baris.toLocaleString("id-ID")} baris`}
                        kuning
                      />
                    ))}
                  </div>
                </div>
              )}

              {lihat.tidak_terlingkup.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-amber-900">
                    Tabel berikut <b>tidak menyimpan ULP</b>, jadi barisnya tidak bisa dipisah dan
                    tetap memakai nama lama:
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {lihat.tidak_terlingkup.map((t) => (
                      <Baris
                        key={t.tabel}
                        kiri={t.tabel}
                        kanan={`${t.baris.toLocaleString("id-ID")} baris`}
                        judul={t.alasan}
                        kuning
                      />
                    ))}
                  </div>
                </div>
              )}

              {lihat.tidak_ikut.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs text-amber-900">
                    Tabel berikut <b>sengaja</b> dibiarkan memakai nama lama — tunjuk namanya untuk
                    melihat sebabnya:
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {lihat.tidak_ikut.map((t) => (
                      <Baris
                        key={t.tabel}
                        kiri={t.tabel}
                        kanan={`${t.baris.toLocaleString("id-ID")} baris`}
                        judul={t.alasan}
                        kuning
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {lihat.peringatan.length > 0 && (
            <div className="space-y-1.5">
              {lihat.peringatan.map((p) => (
                <div key={p} className="flex items-start gap-2 text-xs text-amber-800">
                  <TriangleAlert size={14} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>{p}</span>
                </div>
              ))}
            </div>
          )}

          {lihat.tindakan === "pisah" && (
            <div className="flex items-start gap-2 text-[11px] text-ink-muted">
              <ShieldAlert size={13} className="shrink-0 mt-0.5" />
              <span>
                Penyulang barunya mendapat prefiks nama tiang sendiri, dibuat sistem dari namanya.
              </span>
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

function Bagian({
  judul,
  ringkas,
  kosong,
  warna,
  children,
}: {
  judul: string;
  ringkas: string;
  kosong: string;
  warna: string;
  children: React.ReactNode;
}) {
  const adaIsi = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className={`rounded-xl border ${warna} p-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <p className={EYEBROW}>{judul}</p>
        {adaIsi && <span className="text-[11px] text-ink-muted">{ringkas}</span>}
      </div>
      {adaIsi ? (
        <div className="mt-2 space-y-1">{children}</div>
      ) : (
        <p className="text-xs text-ink-muted mt-1.5">{kosong}</p>
      )}
    </div>
  );
}

function Baris({
  kiri,
  kanan,
  judul,
  kuning,
}: {
  kiri: string;
  kanan: string;
  judul?: string;
  kuning?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 text-xs ${kuning ? "text-amber-900" : "text-ink-soft"}`}
      title={judul}
    >
      <span className={`truncate ${judul ? "cursor-help underline decoration-dotted" : ""}`}>
        {kiri}
      </span>
      <span className="tabular-nums shrink-0 font-medium">{kanan}</span>
    </div>
  );
}
