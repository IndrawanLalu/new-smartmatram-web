"use client";

import { useEffect, useState } from "react";
import { Ban, Check, Loader2, Pencil, Undo2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import type { AlasanRef, BarisTabel, KoreksiOptimasi, UsulanMaster, WoTerbuka } from "../_hooks/useOptimasiTrafo";
import { NADA_STATUS } from "../_lib/tampilan";
import { IsiCatatan, IsiWo } from "./IsiDetailOptimasi";
import FormKoreksiOptimasi, { ID_FORM_KOREKSI } from "./FormKoreksiOptimasi";

/**
 * Detail satu pekerjaan optimasi — tempat admin memeriksa, mengoreksi, dan
 * memutuskan.
 *
 * Verifikasi MENGUBAH MASTER GARDU (kVA, nomor seri, merk, tahun), jadi
 * daftar perubahannya selalu terlihat di modal ini sebelum tombolnya ditekan,
 * dan tetap diminta konfirmasi sekali lagi.
 *
 * Koreksi hanya selama "Menunggu verifikasi" (diputuskan 24 Sep 2026). Setelah
 * diverifikasi, master sudah berubah — koreksinya lewat Master Gardu yang punya
 * jejak auditnya sendiri.
 */

interface Props {
  b: BarisTabel;
  alasan: AlasanRef[];
  oleh: string;
  onTutup: () => void;
  onVerifikasi: (id: string, oleh: string) => Promise<number>;
  onBatalkan: (id: string, alasan: string, oleh: string) => Promise<void>;
  onKembalikan: (id: string, alasan: string, oleh: string) => Promise<void>;
  onBatalkanWo: (w: WoTerbuka, alasan: string, oleh: string) => Promise<void>;
  onPastikan: (id: string, oleh: string) => Promise<void>;
  onKoreksi: (id: string, v: KoreksiOptimasi) => Promise<void>;
  ambilUsulan: (id: string) => Promise<UsulanMaster[]>;
}

export default function DetailOptimasiModal({
  b, alasan, oleh, onTutup, onVerifikasi, onBatalkan, onKembalikan, onBatalkanWo, onPastikan, onKoreksi, ambilUsulan,
}: Props) {
  const toast = useToast();
  const c = b.catatan;
  const [mode, setMode] = useState<"lihat" | "koreksi">("lihat");
  const [dialog, setDialog] = useState<"verifikasi" | "batal" | "batalWo" | "kembalikan" | null>(null);
  const [sibuk, setSibuk] = useState(false);
  const [usulan, setUsulan] = useState<UsulanMaster[] | null>(null);
  const [galatUsulan, setGalatUsulan] = useState<string | null>(null);
  const [versi, setVersi] = useState(0);

  const id = c?.id ?? null;
  useEffect(() => {
    if (!id) return;
    let hidup = true;
    ambilUsulan(id).then(
      (u) => { if (hidup) { setUsulan(u); setGalatUsulan(null); } },
      (e: Error) => { if (hidup) setGalatUsulan(e.message); },
    );
    return () => { hidup = false; };
  }, [id, versi, ambilUsulan]);

  const jalankan = async (kerja: () => Promise<string>) => {
    setSibuk(true);
    try {
      toast.success(await kerja());
      setVersi((n) => n + 1);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal.");
      return false;
    } finally {
      setSibuk(false);
    }
  };

  const menunggu = c?.statusDb === "Selesai";
  const jumlahUbah = usulan?.filter((u) => u.status === "menunggu").length ?? 0;

  const footer = !c ? (
    b.wo && !b.batal ? (
      <>
        <button onClick={() => setDialog("batalWo")} className={BTN_GHOST} disabled={sibuk}>
          <Ban size={14} /> Batalkan WO
        </button>
        <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
      </>
    ) : (
      <button onClick={onTutup} className={`${BTN_GHOST} ml-auto`}>Tutup</button>
    )
  ) : mode === "koreksi" ? (
    <>
      <button onClick={() => setMode("lihat")} className={BTN_GHOST} disabled={sibuk}>Batal</button>
      <button type="submit" form={ID_FORM_KOREKSI} className={BTN_PRIMARY} disabled={sibuk}>
        {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan koreksi
      </button>
    </>
  ) : menunggu ? (
    <>
      <div className="flex gap-2">
        <button onClick={() => setDialog("batal")} className={BTN_GHOST} disabled={sibuk}>
          <Ban size={14} /> Salah input
        </button>
        <button onClick={() => setDialog("kembalikan")} className={BTN_GHOST} disabled={sibuk}>
          <Undo2 size={14} /> Kembalikan ke petugas
        </button>
        <button onClick={() => setMode("koreksi")} className={BTN_GHOST} disabled={sibuk}>
          <Pencil size={14} /> Koreksi
        </button>
      </div>
      <button onClick={() => setDialog("verifikasi")} className={BTN_PRIMARY} disabled={sibuk}>
        {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Verifikasi &amp; setujui
      </button>
    </>
  ) : (
    <button onClick={onTutup} className={`${BTN_GHOST} ml-auto`}>Tutup</button>
  );

  return (
    <>
      <ModalShell
        title={`${mode === "koreksi" ? "Koreksi optimasi" : "Optimasi trafo"} ${b.kodeGardu}`}
        subtitle={`${b.ulp}${b.penyulang ? ` · ${b.penyulang}` : ""} · ${b.status}`}
        maxWidth="max-w-4xl"
        onClose={onTutup}
        footer={footer}
      >
        <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${NADA_STATUS[b.status]}`}>
          {b.status}
        </span>

        {b.wo && <IsiWo w={b.wo} batal={b.batal} />}

        {c && mode === "lihat" && (
          <IsiCatatan
            c={c}
            usulan={usulan}
            galatUsulan={galatUsulan}
            sibuk={sibuk}
            onPastikan={() =>
              void jalankan(async () => {
                await onPastikan(c.id, oleh);
                return "Jejak dipastikan.";
              })
            }
          />
        )}

        {c && mode === "koreksi" && (
          <FormKoreksiOptimasi
            c={c}
            alasan={alasan}
            onSimpan={(v) =>
              void jalankan(async () => {
                await onKoreksi(c.id, v);
                setMode("lihat");
                return "Koreksi tersimpan. Perubahan master ikut disusun ulang.";
              })
            }
          />
        )}
      </ModalShell>

      {c && dialog === "verifikasi" && (
        <ConfirmDialog
          title="Verifikasi dan setujui?"
          message={
            jumlahUbah > 0
              ? `${jumlahUbah} isian master gardu ${c.kodeGardu} akan langsung diubah sesuai daftar "Perubahan master gardu". Setelah ini catatan tidak bisa dikoreksi lagi.`
              : `Master gardu ${c.kodeGardu} sudah sesuai, tidak ada yang diubah. Setelah ini catatan tidak bisa dikoreksi lagi.`
          }
          confirmLabel="Verifikasi & setujui"
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            void jalankan(async () => {
              const n = await onVerifikasi(c.id, oleh);
              return n > 0 ? `Diverifikasi — ${n} isian master diperbarui.` : "Diverifikasi.";
            });
          }}
        />
      )}

      {b.wo && dialog === "batalWo" && (
        <BatalkanModal
          judul={`Batalkan WO optimasi ${b.kodeGardu}?`}
          keterangan="WO ini hilang dari daftar tugas regu di HP dan tidak dihitung sebagai WO terbit di Rekap Kinerja. Catatannya tetap tersimpan dengan status Dibatalkan beserta alasannya."
          peringatan="Kalau regu telanjur mengerjakannya, catatan mereka tetap diterima sebagai pekerjaan di luar WO — tidak ada pekerjaan yang hilang."
          labelTombol="Batalkan WO"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasanBatal) =>
            jalankan(async () => {
              await onBatalkanWo(b.wo!, alasanBatal, oleh);
              return "WO dibatalkan.";
            })
          }
        />
      )}

      {c && dialog === "kembalikan" && (
        <BatalkanModal
          judul={`Kembalikan optimasi ${c.kodeGardu} ke petugas?`}
          keterangan="Catatan ini muncul lagi di HP regu sebagai draf berisi isian lama untuk diperbaiki dan dikirim ulang. Selama itu tidak dihitung sebagai realisasi. Usulan master-nya tetap menunggu."
          labelTombol="Kembalikan ke petugas"
          placeholder="Apa yang harus diperbaiki — mis. foto papan nama baru buram, nomor seri lama salah ketik"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasanKembali) =>
            jalankan(async () => {
              await onKembalikan(c.id, alasanKembali, oleh);
              return "Dikembalikan ke petugas.";
            })
          }
        />
      )}

      {c && dialog === "batal" && (
        <BatalkanModal
          judul={`Tandai optimasi ${c.kodeGardu} salah input?`}
          keterangan="Catatannya tetap tersimpan dengan status Dibatalkan dan tidak ikut dihitung sebagai realisasi. Kalau pekerjaannya memang ada, minta regu mencatat ulang dengan benar."
          peringatan="Usulan perubahan master dari catatan ini ikut ditolak — master gardu tidak berubah."
          labelTombol="Tandai salah input"
          onTutup={() => setDialog(null)}
          onBatalkan={(alasanBatal) =>
            jalankan(async () => {
              await onBatalkan(c.id, alasanBatal, oleh);
              return "Ditandai salah input.";
            })
          }
        />
      )}
    </>
  );
}
