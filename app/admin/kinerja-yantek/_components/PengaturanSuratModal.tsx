"use client";

import { useEffect, useState } from "react";
import { Check, Eraser, Loader2, Upload } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, FIELD } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { ambilTtd } from "../_lib/bahanSurat";
import type { PengaturanSurat } from "../_lib/woSurat";

/**
 * Kop, penerima, penandatangan, dan tanda tangan surat WO — sekali per ULP.
 * Tanda tangan disimpan di bucket PRIVAT `ttd`: yang bisa diambil lewat
 * tautan publik bisa ditempel di surat mana pun. Tanda tangan Manager boleh
 * dikosongkan — Manager lalu menandatangani langsung di surat cetak.
 */

interface Props {
  awal: PengaturanSurat;
  oleh: string;
  onTutup: () => void;
  onTersimpan: () => void;
}

type Teks = Exclude<keyof PengaturanSurat, "ulp" | "ttd_manager" | "ttd_tl">;

const ISIAN: { k: Teks; label: string; contoh: string; panjang?: boolean }[] = [
  { k: "kota", label: "Kota (di depan tanggal surat)", contoh: "Tanjung" },
  { k: "telepon", label: "Telepon", contoh: "(0370) 6136766" },
  { k: "alamat", label: "Alamat kantor", contoh: "Jln. Raya Tanjung Bayan KM 1 Tanjung", panjang: true },
  { k: "kotak_pos", label: "Kotak pos", contoh: "83352" },
  { k: "mitra", label: "Pelaksana (mitra)", contoh: "PT. Bumi Sentosa" },
  { k: "penerima", label: "Kepada Yth.", contoh: "Direktur Bumi Sentosa" },
  { k: "penerima_kota", label: "di", contoh: "Mataram" },
  { k: "cq", label: "Cq.", contoh: "Supervisor Teknik" },
  { k: "nama_manager", label: "Nama Manager ULP", contoh: "MAHRIM RANGGASAPE" },
  { k: "nama_tl", label: "Nama pembuat lampiran", contoh: "IMAM AL GHAZALI" },
  { k: "jabatan_tl", label: "Jabatan pembuat lampiran", contoh: "TL Teknik" },
];

const BATAS_TTD = 1024 * 1024;

export default function PengaturanSuratModal({ awal, oleh, onTutup, onTersimpan }: Props) {
  const toast = useToast();
  const [isi, setIsi] = useState(awal);
  const [berkas, setBerkas] = useState<{ manager?: File; tl?: File }>({});
  const [lihat, setLihat] = useState<{ manager: string | null; tl: string | null }>({ manager: null, tl: null });
  const [sibuk, setSibuk] = useState(false);
  /** Tanda tangan Manager dihapus saat Simpan (tanda tangan basah). */
  const [kosongkanManager, setKosongkanManager] = useState(false);

  useEffect(() => {
    let hidup = true;
    Promise.all([ambilTtd(awal.ttd_manager), ambilTtd(awal.ttd_tl)])
      .then(([manager, tl]) => { if (hidup) setLihat({ manager, tl }); })
      .catch(() => { /* pratinjau saja — kegagalan terlihat saat PDF dibuat */ });
    return () => { hidup = false; };
  }, [awal.ttd_manager, awal.ttd_tl]);

  const pilih = (siapa: "manager" | "tl", f: File | undefined) => {
    if (!f) return;
    if (f.type !== "image/png") return toast.error("Tanda tangan harus berkas PNG (latar transparan paling baik).");
    if (f.size > BATAS_TTD) return toast.error("Berkas tanda tangan maksimal 1 MB.");
    setBerkas((b) => ({ ...b, [siapa]: f }));
    setLihat((l) => ({ ...l, [siapa]: URL.createObjectURL(f) }));
    if (siapa === "manager") setKosongkanManager(false);
  };

  const kosongkan = () => {
    setKosongkanManager(true);
    setBerkas((b) => ({ ...b, manager: undefined }));
    setLihat((l) => ({ ...l, manager: null }));
  };

  const simpan = async () => {
    setSibuk(true);
    try {
      const baru = { ...isi };
      if (kosongkanManager && isi.ttd_manager) {
        // Berkas lama ikut dibuang: tanda tangan yang tidak dipakai tidak
        // perlu tersimpan. Gagal menghapus tidak menggagalkan pengaturan.
        await supabaseBrowser.storage.from("ttd").remove([isi.ttd_manager]);
        baru.ttd_manager = null;
      }
      for (const siapa of ["manager", "tl"] as const) {
        const f = berkas[siapa];
        if (!f) continue;
        const path = `${isi.ulp}/${siapa}.png`;
        const { error } = await supabaseBrowser.storage.from("ttd").upload(path, f, { upsert: true, contentType: "image/png" });
        if (error) throw new Error(`Unggah tanda tangan: ${error.message}`);
        baru[siapa === "manager" ? "ttd_manager" : "ttd_tl"] = path;
      }
      const bersih = Object.fromEntries(
        Object.entries(baru).map(([k, v]) => [k, typeof v === "string" && v.trim() === "" ? null : v]),
      );
      const { error } = await supabaseBrowser
        .from("wo_surat_pengaturan")
        .upsert({ ...bersih, jabatan_tl: baru.jabatan_tl?.trim() || "TL Teknik", oleh, updated_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
      toast.success(`Pengaturan surat ULP ${isi.ulp} tersimpan.`);
      onTersimpan();
      onTutup();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal menyimpan");
    } finally {
      setSibuk(false);
    }
  };

  const kotakTtd = (siapa: "manager" | "tl", label: string) => (
    <div className="flex-1 min-w-[200px] rounded-xl border border-line p-3">
      <p className="text-xs font-semibold text-ink mb-2">{label}</p>
      <div className="h-20 rounded-lg bg-surface flex items-center justify-center mb-2">
        {lihat[siapa] ? (
          // eslint-disable-next-line @next/next/no-img-element -- data/blob URL pribadi, bukan aset statis
          <img src={lihat[siapa]!} alt={label} className="max-h-18 object-contain" />
        ) : (
          <span className="text-[11px] text-ink-muted">belum ada</span>
        )}
      </div>
      <div className="flex gap-2">
        <label className={`${BTN_GHOST} cursor-pointer flex-1`}>
          <Upload size={13} /> Pilih PNG
          <input type="file" accept="image/png" className="hidden" onChange={(e) => pilih(siapa, e.target.files?.[0])} />
        </label>
        {siapa === "manager" && lihat.manager && (
          <button onClick={kosongkan} className={BTN_GHOST} title="Kosongkan — Manager tanda tangan langsung">
            <Eraser size={13} /> Kosongkan
          </button>
        )}
      </div>
      {siapa === "manager" && (
        <p className="text-[11px] text-ink-muted mt-1.5">
          {kosongkanManager
            ? "Akan dikosongkan saat Simpan — Manager menandatangani langsung di surat cetak."
            : "Boleh kosong: tempat tanda tangan dibiarkan kosong untuk ditandatangani langsung."}
        </p>
      )}
    </div>
  );

  return (
    <ModalShell
      title={`Pengaturan Surat WO — ULP ${isi.ulp}`}
      subtitle="Kop, penerima, dan penandatangan. Dipakai setiap surat ULP ini."
      maxWidth="max-w-3xl"
      onClose={onTutup}
      footer={
        <>
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={() => void simpan()} className={BTN_PRIMARY} disabled={sibuk}>
            {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Simpan
          </button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        {ISIAN.map(({ k, label, contoh, panjang }) => (
          <label key={k} className={`text-xs text-ink-soft ${panjang ? "sm:col-span-2" : ""}`}>
            {label}
            <input
              value={isi[k] ?? ""}
              onChange={(e) => setIsi((x) => ({ ...x, [k]: e.target.value }))}
              placeholder={contoh}
              className={`${FIELD} w-full mt-1 block`}
            />
          </label>
        ))}
        <label className="text-xs text-ink-soft sm:col-span-2">
          Tembusan (satu per baris)
          <textarea
            value={isi.tembusan ?? ""}
            onChange={(e) => setIsi((x) => ({ ...x, tembusan: e.target.value }))}
            rows={2}
            placeholder="Manager Bagian Jaringan PT. PLN (Persero) UP3 Mataram"
            className="w-full mt-1 rounded-xl border border-line px-3 py-2 text-sm focus:outline-none focus:border-navy-500"
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {kotakTtd("manager", "Tanda tangan Manager ULP")}
        {kotakTtd("tl", "Tanda tangan pembuat lampiran")}
      </div>
    </ModalShell>
  );
}
