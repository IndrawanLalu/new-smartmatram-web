"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Loader2, TriangleAlert } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { BTN_GHOST, BTN_PRIMARY } from "@/app/admin/_ui";
import PratinjauNamaModal from "@/app/admin/jtm/_components/PratinjauNamaModal";
import type { PermintaanNama } from "@/lib/jtmNama";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { TOMBOL_PANEL } from "./InfoTiang";

/**
 * Balik arah JTM (`scripts/jtm-balik-arah.sql`): rantai induk yang terbalik
 * karena regu memulai rintisan dari ujung jaringan. Pratinjau dulu — induk
 * lama → baru per tiang dan segmen yang ditukar — lalu ganti nama BAGIAN
 * YANG DIBALIK saja: dari pangkal barunya ke hilir (user 22 Okt — dulu
 * Generate ulang seluruh penyulang, nama sampai ke pangkal penyulang ikut
 * berubah). Nama awalnya diketik admin, mis. lanjutan dari hulunya.
 *
 * `penyulang` = penyulang yang MENUMPANG (`jtm-balik-arah-tumpang.sql`): yang
 * dibalik rantai induk khusus penyulang itu; batang pemiliknya tetap. Hulu wajib.
 */

const ISIAN =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15";

interface Pratinjau {
  penyulang: string;
  ulp: string;
  lepas_dari: string | null;
  tiang: { kode: string; induk_lama: string | null; induk_baru: string | null }[];
  segmen: { lama: string; baru: string }[];
  segmen_sebagian: string[];
  ikut_terbalik: string[];
}

interface LangkahProps {
  /** Pangkal sebenarnya yang sudah diklik (null = belum). */
  ke: string | null;
  /** Penyulang yang menumpang (null = batang). */
  penyulang: string | null;
  onTanpaHulu: () => void;
  onBatal: () => void;
}

/** Petunjuk di panel kanan selama menunggu klik di peta. */
export function LangkahBalikArah({ ke, penyulang, onTanpaHulu, onBatal }: LangkahProps) {
  return (
    <div className="rounded-lg border border-sky-400/60 p-3 text-xs text-sky-100 space-y-2">
      {penyulang && (
        <p>
          Balik arah <b>di {penyulang}</b> saja — klik tiang di lapisan {penyulang}. Arah batang pemiliknya tidak berubah.
        </p>
      )}
      {ke && penyulang ? (
        <p>
          <b>{ke}</b> jadi pangkal. Klik tiang <b>hulu</b> {penyulang} tempat {ke} menyambung.
        </p>
      ) : ke ? (
        <>
          <p>
            <b>{ke}</b> jadi pangkal. Klik tiang <b>hulu</b> tempat {ke} menyambung ke jaringan — atau lewati kalau{" "}
            {ke} memang pangkal (tidak menyambung ke tiang mana pun).
          </p>
          <button onClick={onTanpaHulu} className={TOMBOL_PANEL}>{ke} pangkal, tanpa hulu</button>
        </>
      ) : (
        <p>
          Klik tiang yang <b>seharusnya jadi pangkal</b> — ujung lain rantai yang terbalik, di hilir tiang ini.
        </p>
      )}
      <button onClick={onBatal} className={TOMBOL_PANEL}>Batal</button>
    </div>
  );
}

interface Props {
  dariId: string;
  keId: string;
  huluId: string | null;
  penyulang: string | null;
  oleh: string;
  onBalik: (alasan: string) => Promise<boolean>;
  /** Pratinjau ditolak / ditutup — mode klik tetap jalan (bisa pilih hulu lain). */
  onTutup: () => void;
  /** Sudah dibalik; dipanggil lagi sesudah nama diterapkan atau dilewati. */
  onSelesai: () => void;
}

export default function BalikArahJtm({ dariId, keId, huluId, penyulang, oleh, onBalik, onTutup, onSelesai }: Props) {
  const toast = useToast();
  const [p, setP] = useState<Pratinjau | null>(null);
  const [alasan, setAlasan] = useState("");
  const [sibuk, setSibuk] = useState(false);
  const [dibalik, setDibalik] = useState(false);
  const [namaAwal, setNamaAwal] = useState("");
  const [permintaan, setPermintaan] = useState<PermintaanNama | null>(null);

  useEffect(() => {
    let hidup = true;
    void supabaseBrowser
      .rpc("pratinjau_balik_arah_jtm", { p_dari: dariId, p_ke: keId, p_hulu: huluId, ...(penyulang ? { p_penyulang: penyulang } : {}) })
      .then(({ data, error }) => {
        if (!hidup) return;
        if (error) {
          toast.error(
            error.message.includes("Could not find the function")
              ? `Fungsi balik arah belum ada — jalankan scripts/${penyulang ? "jtm-balik-arah-tumpang.sql" : "jtm-balik-arah.sql"} di Supabase.`
              : error.message,
          );
          onTutup();
          return;
        }
        setP(data as Pratinjau);
      });
    return () => { hidup = false; };
    // Sekali saat dibuka.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p) return null;

  const pangkal = p.tiang[0];

  if (permintaan) {
    return (
      <PratinjauNamaModal
        judul={`Ganti nama ${pangkal.kode} → ${permintaan.namaMulai} (hilir ikut)`}
        subjudul={`Penyulang ${p.penyulang} · bagian yang dibalik saja`}
        permintaan={permintaan}
        oleh={oleh}
        onTutup={onSelesai}
        onSelesai={onSelesai}
      />
    );
  }

  if (dibalik) {
    const baru = namaAwal.trim().toUpperCase();
    return (
      <ModalShell
        title="Ganti nama bagian yang dibalik"
        subtitle={`Penyulang ${p.penyulang}`}
        maxWidth="max-w-md"
        onClose={onSelesai}
        footer={
          <div className="flex justify-end gap-2">
            <button onClick={onSelesai} className={BTN_GHOST}>Lewati</button>
            <button
              onClick={() => setPermintaan({ penyulang: p.penyulang, ulp: p.ulp, mulai: keId, namaMulai: baru })}
              disabled={!baru}
              className={BTN_PRIMARY}
            >
              Pratinjau nama
            </button>
          </div>
        }
      >
        <div className="p-5 space-y-3 text-sm text-ink">
          <p className="text-ink-soft">
            Arah sudah dibalik. Nama mulai dari <b className="text-ink">{pangkal.kode}</b> (pangkal baru
            {pangkal.induk_baru ? `, menyambung dari ${pangkal.induk_baru}` : ""}) sampai hilirnya ikut berganti —
            tiang di hulunya tidak disentuh.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-ink-soft">Nama baru {pangkal.kode}</span>
            <input
              autoFocus
              value={namaAwal}
              onChange={(e) => setNamaAwal(e.target.value)}
              placeholder={pangkal.induk_baru ? `mis. lanjutan dari ${pangkal.induk_baru}` : "mis. MSR-001"}
              className={ISIAN}
            />
          </label>
        </div>
      </ModalShell>
    );
  }

  const balik = async () => {
    setSibuk(true);
    const ok = await onBalik(alasan.trim());
    setSibuk(false);
    if (ok) {
      setNamaAwal(pangkal.kode);
      setDibalik(true);
    }
  };

  return (
    <ModalShell
      title={`Balik arah ${p.tiang[p.tiang.length - 1].kode} … ${pangkal.kode}`}
      subtitle={`Penyulang ${p.penyulang}${penyulang ? " (menumpang)" : ""} · ${p.tiang.length} tiang`}
      maxWidth="max-w-xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST} disabled={sibuk}>Batal</button>
          <button onClick={() => void balik()} disabled={!alasan.trim() || sibuk} className={BTN_PRIMARY}>
            {sibuk && <Loader2 size={15} className="animate-spin" />}
            Balik arah
          </button>
        </div>
      }
    >
      <div className="p-5 space-y-4 text-sm text-ink">
        <p className="text-ink-soft">
          {pangkal.kode} jadi pangkal{pangkal.induk_baru ? `, menyambung dari ${pangkal.induk_baru}` : ""}.
          {p.lepas_dari && ` ${p.tiang[p.tiang.length - 1].kode} tidak lagi menyambung dari ${p.lepas_dari}.`} Cabang
          yang keluar dari tengah rantai tetap di tiangnya.{" "}
          {penyulang
            ? `Hanya induk di ${p.penyulang} yang berubah — batang pemiliknya dan penyulang lain tetap.`
            : "Arah jalur utama di percabangan rantai ini dikosongkan."}
        </p>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="kepala-kit sticky top-0">
              <tr>
                <th className="px-3 py-1.5 text-left">Tiang</th>
                <th className="px-3 py-1.5 text-left">Induk lama</th>
                <th className="px-3 py-1.5 text-left">Induk baru</th>
              </tr>
            </thead>
            <tbody>
              {p.tiang.map((t) => (
                <tr key={t.kode} className="border-t border-line">
                  <td className="px-3 py-1 font-medium">{t.kode}</td>
                  <td className="px-3 py-1 text-ink-soft">{t.induk_lama ?? "pangkal"}</td>
                  <td className="px-3 py-1">{t.induk_baru ?? "pangkal"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {p.segmen.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-ink-soft">Pangkal ↔ ujung segmen ditukar</p>
            <ul className="mt-1 space-y-1 text-xs">
              {p.segmen.map((s) => (
                <li key={s.lama} className="flex flex-wrap items-center gap-1.5">
                  <span className="text-ink-soft">{s.lama}</span>
                  <ArrowRight size={12} className="text-ink-muted" />
                  <span className="font-medium">{s.baru}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {(p.segmen_sebagian.length > 0 || p.ikut_terbalik.length > 0) && (
          <div className="flex gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
            <TriangleAlert size={14} className="shrink-0 mt-0.5" />
            <div className="space-y-1">
              {p.segmen_sebagian.length > 0 && (
                <p>
                  Rantai hanya melewati sebagian segmen {p.segmen_sebagian.join(", ")} — pangkal/ujungnya tidak ditukar,
                  periksa sendiri sesudahnya.
                </p>
              )}
              {p.ikut_terbalik.length > 0 && (
                <p>Penyulang yang menumpang di rantai ini ikut terbalik: {p.ikut_terbalik.join(", ")}.</p>
              )}
            </div>
          </div>
        )}

        <textarea
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={2}
          autoFocus
          placeholder="Alasan — mis. regu memulai rintisan dari ujung jaringan"
          className={ISIAN}
        />
        <p className="text-xs text-ink-soft">
          Sesudah dibalik, nama bagian ini saja yang diganti — mulai {pangkal.kode} ke hilirnya, lewat pratinjau.
        </p>
      </div>
    </ModalShell>
  );
}
