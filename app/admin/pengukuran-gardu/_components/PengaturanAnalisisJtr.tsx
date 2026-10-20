"use client";

import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { bacaKha, simpanPengaturan, type KhaKabel, type PengaturanJtr } from "../_hooks/useAnalisisJtr";

/**
 * Pengaturan Analisis JTR — batas arus jurusan, panjang lintasan, % KHA, dan
 * KHA tiap kabel yang terpasang. Berlaku seluruh UP3, jadi hanya akun UP3 yang
 * bisa menyimpan (RLS di scripts/analisis-jtr.sql); role lain hanya melihat.
 */

interface Props {
  awal: PengaturanJtr;
  boleh: boolean;
  oleh: string;
  onTutup: () => void;
  onTersimpan: () => void;
}

const BATAS: { kunci: keyof PengaturanJtr; label: string; satuan: string; ket: string }[] = [
  { kunci: "batas_arus_jurusan_a", label: "Arus jurusan maksimum", satuan: "A", ket: "Arus fasa terbesar di satu jurusan" },
  { kunci: "batas_kha_pct", label: "Beban kabel maksimum", satuan: "% KHA", ket: "Arus dibanding KHA kabel terkecil di jurusan" },
  { kunci: "batas_panjang_m", label: "Lintasan terjauh maksimum", satuan: "m", ket: "Dari gardu ke tiang ujung, lewat kabel" },
];

export default function PengaturanAnalisisJtr({ awal, boleh, oleh, onTutup, onTersimpan }: Props) {
  const toast = useToast();
  const [batas, setBatas] = useState<Record<keyof PengaturanJtr, string>>({
    batas_arus_jurusan_a: String(awal.batas_arus_jurusan_a),
    batas_kha_pct: String(awal.batas_kha_pct),
    batas_panjang_m: String(awal.batas_panjang_m),
  });
  const [kha, setKha] = useState<(KhaKabel & { isi: string })[] | null>(null);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    bacaKha()
      .then((d) => setKha(d.map((k) => ({ ...k, isi: k.kha_a === null ? "" : String(k.kha_a) }))))
      .catch((e: Error) => {
        toast.error(e.message);
        setKha([]);
      });
  }, [toast]);

  const simpan = async () => {
    const p = {
      batas_arus_jurusan_a: Number(batas.batas_arus_jurusan_a),
      batas_kha_pct: Number(batas.batas_kha_pct),
      batas_panjang_m: Number(batas.batas_panjang_m),
    };
    if (Object.values(p).some((v) => !(v > 0))) {
      toast.error("Semua batas wajib diisi angka lebih dari 0.");
      return;
    }
    const k = (kha ?? []).map((x) => ({ ...x, kha_a: x.isi.trim() === "" ? null : Number(x.isi) }));
    if (k.some((x) => x.kha_a !== null && !(x.kha_a > 0))) {
      toast.error("KHA harus angka lebih dari 0, atau dikosongkan.");
      return;
    }
    setSibuk(true);
    try {
      await simpanPengaturan(p, k, oleh);
      toast.success("Pengaturan Analisis JTR tersimpan.");
      onTersimpan();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSibuk(false);
    }
  };

  return (
    <ModalShell
      title="Pengaturan Analisis JTR"
      subtitle={boleh ? "Berlaku untuk seluruh UP3" : "Hanya akun UP3 yang bisa mengubah"}
      maxWidth="max-w-xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>Tutup</button>
          {boleh && (
            <button onClick={() => void simpan()} disabled={sibuk || kha === null} className={BTN_PRIMARY}>
              {sibuk ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <section className="space-y-2.5">
          <p className={EYEBROW}>Batas merah</p>
          {BATAS.map((b) => (
            <label key={b.kunci} className="flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-ink">{b.label}</span>
                <span className="block text-xs text-ink-muted">{b.ket}</span>
              </span>
              <input
                type="number" min={1} value={batas[b.kunci]} disabled={!boleh}
                onChange={(e) => setBatas((x) => ({ ...x, [b.kunci]: e.target.value }))}
                className={`${FIELD} w-24 text-right`}
              />
              <span className="w-12 text-xs text-ink-soft">{b.satuan}</span>
            </label>
          ))}
          <p className="text-xs text-ink-muted">Kuning = sudah mencapai 80% dari batas arus atau batas % KHA.</p>
        </section>

        <section className="space-y-2">
          <p className={EYEBROW}>KHA kabel terpasang</p>
          {kha === null ? (
            <Loader2 size={16} className="animate-spin text-ink-muted" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="py-1.5 font-semibold">Kabel</th>
                  <th className="py-1.5 font-semibold text-right">Terpasang</th>
                  <th className="py-1.5 font-semibold text-right w-32">KHA (A)</th>
                </tr>
              </thead>
              <tbody>
                {kha.map((k, i) => (
                  <tr key={`${k.jenis}|${k.ukuran}`} className="border-t border-line">
                    <td className="py-1.5 text-ink font-medium">{k.jenis} {k.ukuran}</td>
                    <td className="py-1.5 text-right text-ink-soft tabular-nums">{k.jumlah_kabel} gawang</td>
                    <td className="py-1.5 text-right">
                      <input
                        type="number" min={1} value={k.isi} disabled={!boleh} placeholder="belum diatur"
                        onChange={(e) => setKha((x) => x && x.map((y, j) => (j === i ? { ...y, isi: e.target.value } : y)))}
                        className={`${FIELD} w-28 text-right`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="text-xs text-ink-muted">
            KHA kosong = jurusan berkabel itu tidak bisa dinilai beban kabelnya. Ukuran baru dari lapangan muncul di sini otomatis.
          </p>
        </section>
      </div>
    </ModalShell>
  );
}
