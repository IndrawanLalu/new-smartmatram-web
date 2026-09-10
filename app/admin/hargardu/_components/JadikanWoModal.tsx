"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useJadikanWo, JUDUL_WO } from "../_hooks/useJadikanWo";
import { kunciBaris, type BarisPerbaikan } from "../_hooks/usePerluPerbaikan";

interface Props {
  baris: BarisPerbaikan[];
  onTutup: () => void;
  /** Menandai baris terpilih tanpa memuat ulang seluruh daftar. */
  onSelesai: (kunci: string[], pada: string) => void;
  /**
   * Dipanggil kalau penugasan gagal di tengah jalan. Sebagian baris WO bisa
   * terlanjur dibuat, jadi layar harus dibaca ulang dari basis data — menebak
   * dari sisi klien berarti menawarkan tombol yang membuat WO kembar.
   */
  onGagal: () => void;
}

const bulanIni = () => new Date().toISOString().slice(0, 7);

export default function JadikanWoModal({ baris, onTutup, onSelesai, onGagal }: Props) {
  const user = useCurrentUser();
  const toast = useToast();
  const { roles } = useRoles();
  const { kirim, memproses } = useJadikanWo();

  const [regu, setRegu] = useState("");
  const [periode, setPeriode] = useState(bulanIni());
  const [catatan, setCatatan] = useState("");

  const eksekutor = useMemo(() => roles.filter((r) => r.is_eksekutor), [roles]);

  /** Satu WO per ULP — regu Ampenan tidak boleh melihat pekerjaan Gerung. */
  const perUlp = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of baris) m.set(b.ulp, (m.get(b.ulp) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [baris]);

  const simpan = async () => {
    if (!regu) return;
    const [tahun, bulan] = periode.split("-").map(Number);
    try {
      const { jumlah } = await kirim(baris, {
        bulan,
        tahun,
        regu,
        catatan: catatan.trim(),
        oleh: user.name ?? user.email ?? "",
        olehId: user.id,
      });
      toast.success(`${jumlah} temuan masuk WO "${JUDUL_WO}" untuk regu ${regu}.`);
      onSelesai(baris.map(kunciBaris), new Date().toISOString());
      onTutup();
    } catch (e) {
      toast.error(
        `Gagal membuat WO: ${e instanceof Error ? e.message : e}. Daftar dimuat ulang — periksa mana yang sudah masuk sebelum mengulang.`,
      );
      onGagal();
      onTutup();
    }
  };

  return (
    <ModalShell
      title="Jadikan Work Order"
      subtitle={`${baris.length} temuan terpilih`}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={memproses}>
            Batal
          </button>
          <button
            onClick={() => void simpan()}
            className={BTN_PRIMARY}
            disabled={!regu || memproses}
          >
            {memproses ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ClipboardList size={15} />
            )}
            Jadikan WO
          </button>
        </>
      }
    >
      <p className="text-xs text-ink-soft">
        Temuannya <b>tidak disalin</b> jadi catatan baru — yang disimpan cuma penugasannya.
        Baris ini tetap hilang sendiri dari daftar begitu pemeliharaan berikutnya mencatat
        itemnya normal, entah WO-nya sudah ditutup atau belum.
      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={EYEBROW}>Regu pelaksana</label>
          <select
            value={regu}
            onChange={(e) => setRegu(e.target.value)}
            className={`${FIELD} mt-1 block w-full`}
          >
            <option value="">Pilih regu…</option>
            {eksekutor.map((r) => (
              <option key={r.code} value={r.code}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={EYEBROW}>Masuk WO bulan</label>
          <input
            type="month"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className={`${FIELD} mt-1 block w-full`}
          />
        </div>
      </div>

      <div>
        <label className={EYEBROW}>Catatan penugasan (opsional)</label>
        <input
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          placeholder="mis. tunggu material tersedia"
          className={`${FIELD} mt-1 block w-full`}
        />
      </div>

      <div className="rounded-xl border border-line overflow-hidden">
        <div className="bg-surface px-4 py-2 text-xs text-ink-soft">
          Masuk ke WO <b className="text-ink">{JUDUL_WO}</b> —{" "}
          {perUlp.map(([u, n]) => `${u} (${n})`).join(" · ")}. WO bulan itu dipakai lagi bila
          sudah ada, tidak dibuat baru tiap kali.
        </div>
        <ul className="max-h-52 overflow-y-auto divide-y divide-line">
          {baris.map((b) => (
            <li key={kunciBaris(b)} className="px-4 py-2 text-sm flex flex-wrap gap-x-2">
              <span className="font-semibold text-ink">{b.gardu_kode}</span>
              <span className="text-ink-soft">
                {b.item_nama}: {b.nilai_label ?? b.nilai ?? "—"}
                {b.bagian && b.bagian !== "-" ? ` (${b.bagian})` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ModalShell>
  );
}
