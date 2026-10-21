"use client";

import { useState } from "react";
import { Ban, ClipboardCheck, FileDown, Loader2, Map as IkonPeta, Save, Split } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { NADA_TAHAP, PERLU_BULAN, TUJUAN_WO, type UsulanJtr, type UsulanJtrState } from "../_hooks/useUsulanJtr";
import type { BarisMaterial } from "../_lib/materialJtr";
import { alamatPetaRencana, LABEL_RENCANA } from "../_lib/rencanaJtr";
import { labelBulanWo, pilihanBulanWo } from "../_utils/bulanWo";
import { unduhGambarSurvey } from "../_utils/unduhGambarSurvey";
import TabelMaterial from "@/app/admin/_components/TabelMaterial";
import UbahPecahUsulan, { type BahanPecah } from "./UbahPecahUsulan";

/**
 * Satu usulan tersimpan: dasar keputusan (dibekukan), material, tahap WO.
 * Selama masih "Usulan": material & catatan bisa diubah, dijadikan WO, atau
 * dibatalkan. Sesudah di-WO-kan, tahapnya mengikuti modul pekerjaannya.
 */

interface Props {
  u: UsulanJtr;
  boleh: boolean;
  oleh: string;
  st: Pick<UsulanJtrState, "ubah" | "ubahPecah" | "jadikanWo" | "batalkan" | "materialRef">;
  /** Data JTR & analisis jurusan ini — null bila belum ada (titik pecah tidak bisa diubah). */
  bahanPecah: BahanPecah | null;
  onTutup: () => void;
}

const tgl = (s: string | null) => (s ? new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—");
const angka = (v: number | null) => (v === null ? "—" : Math.round(v).toLocaleString("id-ID"));

export default function RincianUsulanJtr({ u, boleh, oleh, st, bahanPecah, onTutup }: Props) {
  const toast = useToast();
  const bisaUbah = boleh && u.status === "Usulan";
  const [material, setMaterial] = useState<BarisMaterial[]>(u.material);
  const [catatan, setCatatan] = useState(u.catatan ?? "");
  const [mode, setMode] = useState<"lihat" | "wo" | "batal" | "pecah">("lihat");
  const bisaPecah = bisaUbah && !!bahanPecah && (u.pekerjaan === "tambah-jurusan" || u.pekerjaan === "sisip");
  const [bulan, setBulan] = useState(() => pilihanBulanWo()[0].nilai);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [menggambar, setMenggambar] = useState(false);
  const berubah = JSON.stringify(material) !== JSON.stringify(u.material) || catatan !== (u.catatan ?? "");
  const d = u.dasar;

  const jalankan = async (f: () => Promise<unknown>, pesan: string, tutup = false) => {
    if (material.some((x) => !x.nama.trim())) {
      toast.error("Nama material tidak boleh kosong — hapus barisnya bila tidak dipakai.");
      return;
    }
    setSibuk(true);
    try {
      await f();
      toast.success(pesan);
      setMode("lihat");
      if (tutup) onTutup();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  const gambar = async () => {
    setMenggambar(true);
    try {
      // Material yang sedang disunting ikut tergambar, walau belum disimpan.
      await unduhGambarSurvey({ ...u, material, catatan: catatan || null });
    } catch (e) {
      toast.error(`Gambar survey gagal: ${(e as Error).message}`);
    } finally {
      setMenggambar(false);
    }
  };

  const tombol = (() => {
    if (!bisaUbah) return null;
    if (mode === "wo") {
      return (
        <button
          disabled={sibuk}
          onClick={() => void jalankan(() => st.jadikanWo(u.id, material, catatan, PERLU_BULAN.includes(u.pekerjaan) ? bulan : null, oleh), "WO terbit.")}
          className={BTN_PRIMARY}
        >
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCheck size={14} />} Terbitkan WO
        </button>
      );
    }
    if (mode === "batal") {
      return (
        <button
          disabled={sibuk || !alasan.trim()}
          onClick={() => void jalankan(() => st.batalkan(u.id, alasan, oleh), "Usulan dibatalkan.", true)}
          className={`${BTN_PRIMARY} bg-red-600! hover:bg-red-700!`}
        >
          {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />} Batalkan usulan
        </button>
      );
    }
    return (
      <>
        <button onClick={() => setMode("batal")} className={`${BTN_GHOST} text-red-600`}><Ban size={14} /> Batalkan</button>
        {bisaPecah && (
          <button onClick={() => setMode("pecah")} className={BTN_GHOST}><Split size={14} /> Ubah titik pecah</button>
        )}
        {berubah && (
          <button disabled={sibuk} onClick={() => void jalankan(() => st.ubah(u.id, material, catatan, oleh), "Usulan diperbarui.")} className={BTN_GHOST}>
            <Save size={14} /> Simpan perubahan
          </button>
        )}
        {u.pekerjaan !== "sisip" && (
          <button onClick={() => setMode("wo")} className={BTN_PRIMARY}><ClipboardCheck size={14} /> Jadikan WO</button>
        )}
      </>
    );
  })();

  if (mode === "pecah" && bahanPecah) {
    return (
      <UbahPecahUsulan
        u={u} bahan={bahanPecah} materialRef={st.materialRef}
        onSimpan={async (isi) => {
          await st.ubahPecah(u.id, isi, oleh);
          setMaterial(isi.material);
        }}
        onKembali={() => setMode("lihat")}
      />
    );
  }

  return (
    <ModalShell
      title={`${LABEL_RENCANA[u.pekerjaan]} — ${u.gardu_kode} jurusan ${u.jurusan}`}
      subtitle={`${u.penyulang ?? "-"} · diusulkan ${u.dibuat_oleh ?? "-"}, ${tgl(u.dibuat_at)}`}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          {mode !== "lihat" ? (
            <button onClick={() => setMode("lihat")} className={`${BTN_GHOST} mr-auto`}>Kembali</button>
          ) : (
            <>
              <a href={alamatPetaRencana(u.gardu_kode, u.jurusan, u.opsi?.kunci)} target="_blank" rel="noopener" className={BTN_GHOST}>
                <IkonPeta size={14} /> Lihat di peta
              </a>
              <button disabled={menggambar} onClick={() => void gambar()} className={`${BTN_GHOST} mr-auto`}>
                {menggambar ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Gambar survey
              </button>
            </>
          )}
          {tombol}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <p className="flex-1 text-base font-semibold text-ink">{u.ringkas}</p>
          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${NADA_TAHAP[u.tahap]}`}>{u.tahap}</span>
        </div>

        {u.status !== "Usulan" && (
          <p className="text-sm text-ink-soft">
            {u.status === "Batal"
              ? `Dibatalkan: ${u.batal_alasan ?? "-"}`
              : `WO ke ${u.regu ?? "-"}${u.wo_bulan ? ` · bulan ${labelBulanWo(u.wo_bulan)}` : ""} · terbit ${tgl(u.wo_at)} oleh ${u.wo_oleh ?? "-"}${u.tgl_selesai ? ` · selesai ${tgl(u.tgl_selesai)}` : ""}`}
          </p>
        )}

        <section className="space-y-1.5">
          <p className={EYEBROW}>Dasar usulan (saat disimpan)</p>
          <p className="text-sm text-ink">
            Arus R/S/T {angka(d.a_r)}/{angka(d.a_s)}/{angka(d.a_t)} A · trafo {angka(d.kva)} kVA ({angka(d.persen_beban)}%) · kabel {d.kabel ?? "—"} ·
            terjauh {angka(d.terjauh_m)} m · {angka(d.jumlah_sr)} SR · ukur {d.tanggal_pengukuran ?? "—"}
          </p>
          <ul className="list-disc pl-5 space-y-0.5 text-sm text-ink-soft">
            {[...d.alasan, ...d.rinci].map((x) => <li key={x}>{x}</li>)}
          </ul>
        </section>

        <TabelMaterial isi={material} onUbah={bisaUbah && mode === "lihat" ? setMaterial : undefined} />

        <label className="block space-y-1.5">
          <span className={EYEBROW}>Catatan</span>
          {bisaUbah && mode === "lihat" ? (
            <textarea value={catatan} onChange={(e) => setCatatan(e.target.value)} rows={2} className={`${FIELD} w-full h-auto py-2`} />
          ) : (
            <p className="text-sm text-ink">{catatan || "—"}</p>
          )}
        </label>

        {mode === "wo" && (
          <section className="rounded-xl border border-navy-200 bg-navy-50/60 p-3 space-y-2 text-sm">
            <p className="font-semibold text-ink">Jadikan WO → {TUJUAN_WO[u.pekerjaan]}</p>
            {PERLU_BULAN.includes(u.pekerjaan) ? (
              <label className="flex items-center gap-2">
                <span className="text-ink-soft">Bulan WO</span>
                <select value={bulan} onChange={(e) => setBulan(e.target.value)} className={FIELD}>
                  {pilihanBulanWo().map((b) => <option key={b.nilai} value={b.nilai}>{b.label}</option>)}
                </select>
                <span className="text-xs text-ink-muted">ditandai pada pengukuran terakhir gardu {u.gardu_kode}</span>
              </label>
            ) : (
              <p className="text-ink-soft">Tugas muncul di HP HARJAR. Material dan catatan di atas ikut tertulis di tugas.</p>
            )}
          </section>
        )}

        {mode === "batal" && (
          <label className="block space-y-1.5">
            <span className={EYEBROW}>Alasan pembatalan</span>
            <input value={alasan} onChange={(e) => setAlasan(e.target.value)} autoFocus placeholder="mis. sudah dikerjakan lewat pekerjaan lain" className={`${FIELD} w-full`} />
          </label>
        )}
      </div>
    </ModalShell>
  );
}
