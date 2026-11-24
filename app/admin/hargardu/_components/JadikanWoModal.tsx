"use client";

import { useMemo, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { useRoles } from "@/app/admin/_hooks/useRoles";
import PilihRegu, { PERAN_PER_REGU } from "@/app/admin/_components/PilihRegu";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useJadikanWo } from "../_hooks/useJadikanWo";
import { kunciBaris, type BarisPerbaikan } from "../_hooks/usePerluPerbaikan";

/** Regu yang lewat WO Perbaikan / WO Pemeliharaan Gardu; regu lain menerima TUGAS. */
const REGU_WO = "HARGAR";

interface Props {
  baris: BarisPerbaikan[];
  onTutup: () => void;
  /** Menandai baris terpilih tanpa memuat ulang seluruh daftar. */
  onSelesai: (kunci: string[], pada: string, patch?: Partial<BarisPerbaikan>) => void;
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
  const { kirim, teruskan, memproses } = useJadikanWo();

  const [regu, setRegu] = useState("");
  const [periode, setPeriode] = useState(bulanIni());
  const [catatan, setCatatan] = useState("");
  /** Nama regu (RABAS 1 …) untuk peran yang menerima tugas per regu. */
  const [tim, setTim] = useState("");

  const jalurWo = regu.toUpperCase() === REGU_WO;
  const perRegu = PERAN_PER_REGU.includes(regu.toUpperCase());

  const eksekutor = useMemo(() => roles.filter((r) => r.is_eksekutor), [roles]);

  /** Satu WO per ULP — regu Ampenan tidak boleh melihat pekerjaan Gerung. */
  const perUlp = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of baris) m.set(b.ulp, (m.get(b.ulp) ?? 0) + 1);
    return [...m].sort((a, b) => a[0].localeCompare(b[0]));
  }, [baris]);

  const ulpTunggal = perUlp.length === 1 ? perUlp[0][0] : null;
  const siap = !!regu && (!perRegu || (!!tim && !!ulpTunggal));

  const simpanTugas = async () => {
    try {
      const h = await teruskan(baris, regu, tim, catatan.trim(), user.name ?? user.email ?? "");
      if (h.tugas > 0) {
        toast.success(`${h.temuan} temuan di ${h.tugas} gardu ditugaskan ke ${h.regu} — muncul di daftar tugas HP regu itu.`);
      }
      if (h.ditolak.length > 0) toast.error(`${h.ditolak.length} gardu dilewati — ${h.ditolak.map((d) => `${d.objek}: ${d.sebab}`).join(" · ")}`);
      const lewat = new Set(h.ditolak.map((d) => d.objek.toUpperCase()));
      onSelesai(
        baris.filter((b) => !lewat.has(b.gardu_kode.toUpperCase())).map(kunciBaris),
        new Date().toISOString(),
        { jalur: "tugas", tugas_regu: h.regu },
      );
      onTutup();
    } catch (e) {
      toast.error(`Gagal menugaskan: ${e instanceof Error ? e.message : e}. Daftar dimuat ulang.`);
      onGagal();
      onTutup();
    }
  };

  const simpan = async () => {
    if (!siap) return;
    if (!jalurWo) return simpanTugas();
    const [tahun, bulan] = periode.split("-").map(Number);
    try {
      const h = await kirim(baris, {
        bulan,
        tahun,
        regu,
        catatan: catatan.trim(),
        oleh: user.name ?? user.email ?? "",
      });
      toast.success(
        [
          h.perbaikan > 0 && `${h.perbaikan} gardu jadi WO Perbaikan (dalam garansi, tidak dihitung realisasi)`,
          h.woPemeliharaan > 0 && `${h.woPemeliharaan} gardu masuk WO Pemeliharaan Gardu`,
        ].filter(Boolean).join(" · ") + ` — regu ${regu}.`,
      );
      if (h.ditolak.length > 0) toast.error(`${h.ditolak.length} dilewati — ${h.ditolak.map((d) => `${d.objek}: ${d.sebab}`).join(" · ")}`);
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
            disabled={!siap || memproses}
          >
            {memproses ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ClipboardList size={15} />
            )}
            {jalurWo || !regu ? "Jadikan WO" : "Tugaskan"}
          </button>
        </>
      }
    >
      {regu && !jalurWo ? (
        <p className="text-xs text-ink-soft">
          Regu <b>{regu}</b> menerima temuan ini sebagai <b>tugas</b>{regu.toUpperCase() === "PERABASAN" ? " pohon" : ""} di HP
          — satu tugas per gardu. Tidak masuk WO Pemeliharaan Gardu dan tidak dihitung realisasinya. Begitu regu
          menyelesaikan tugasnya, temuan di sini ikut menjadi <b>Sudah dikerjakan</b>.
        </p>
      ) : (
      <p className="text-xs text-ink-soft">
        Jalurnya dipilih <b>otomatis per gardu</b> menurut masa garansi Pemeliharaan Gardu (Atur SLA):
        gardu yang <b>masih dalam garansi</b> jadi <b>WO Perbaikan</b> — regu hanya memperbaiki temuan ini,
        tidak dihitung realisasi. Yang <b>di luar garansi</b> masuk <b>WO Pemeliharaan Gardu</b> bulan itu
        (formulir lengkap, dihitung realisasi). Keduanya muncul di HP regu, tab <b>WO temuan</b>.
      </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className={EYEBROW}>Regu pelaksana</label>
          <select
            value={regu}
            onChange={(e) => { setRegu(e.target.value); setTim(""); }}
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

        {perRegu ? (
          <PilihRegu peran={regu} ulp={ulpTunggal} nilai={tim} onPilih={setTim} />
        ) : jalurWo || !regu ? (
        <div>
          <label className={EYEBROW}>Masuk WO bulan</label>
          <input
            type="month"
            value={periode}
            onChange={(e) => setPeriode(e.target.value)}
            className={`${FIELD} mt-1 block w-full`}
          />
        </div>
        ) : null}
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
          {perUlp.map(([u, n]) => `${u} (${n})`).join(" · ")}
          {jalurWo || !regu ? " — WO bulan itu dipakai lagi bila sudah ada, tidak dibuat baru tiap kali." : ""}
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
