"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, TriangleAlert } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { useToast } from "@/app/admin/_components/Toast";
import { useCurrentUser } from "@/app/admin/_context/UserContext";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { canSeeAllUnits, UNITS } from "@/lib/roles";

/**
 * "Berlaku mulai bulan …" aturan tegangan ujung per ULP
 * (`rencana-tegangan-ujung.md` §6 no. 5). Sejak bulan itu: realisasi WO butuh
 * beban + tegangan ujung, "Kirim ke AMG" menunggu tegangan ujung, formulir
 * beban di HP tanpa isian tegangan ujung. Kosong = seperti semula.
 *
 * Tanggal, bukan saklar: realisasi diturunkan, jadi saklar akan menghitung
 * ulang bulan-bulan yang sudah dilaporkan.
 *
 * Batas jarak titik ukur dari tiang JTR gardu (bawaan 100 m, keputusan user
 * 5 Okt 2026) diatur di sini juga, per ULP — dipakai HP saat Simpan dan server
 * saat Kirim (`tegangan-ujung-jarak.sql`).
 */

const JARAK_BAWAAN = 100;

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const labelBulan = (iso: string) => `${NAMA_BULAN[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const bulanIni = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 7);

export default function AturanUjungModal({ onTutup }: { onTutup: () => void }) {
  const user = useCurrentUser();
  const toast = useToast();
  const ulpBoleh = canSeeAllUnits(user.role) ? UNITS.map((u) => u.value) : [user.unit ?? ""].filter(Boolean);
  const [aturan, setAturan] = useState<Record<string, string | null> | null>(null);
  const [isian, setIsian] = useState<Record<string, string>>({});
  const [sibuk, setSibuk] = useState<string | null>(null);
  const [jarak, setJarak] = useState<Record<string, number>>({});
  const [isianJarak, setIsianJarak] = useState<Record<string, string>>({});

  useEffect(() => {
    supabaseBrowser
      .from("aturan_tegangan_ujung")
      .select("*")
      .then(({ data, error }) => {
        if (error) {
          toast.error(
            error.code === "PGRST205" ? "Tabel aturan belum ada — jalankan scripts/tegangan-ujung.sql di Supabase." : error.message,
          );
          setAturan({});
          return;
        }
        const a = Object.fromEntries((data ?? []).map((r) => [String(r.ulp), r.berlaku_mulai ? String(r.berlaku_mulai) : null]));
        setAturan(a);
        setIsian(Object.fromEntries(Object.entries(a).map(([u, v]) => [u, v ? v.slice(0, 7) : ""])));
        // Kolom jarak baru ada sesudah tegangan-ujung-jarak.sql — sebelum itu bawaan.
        const j = Object.fromEntries((data ?? []).map((r) => [String(r.ulp), Number(r.jarak_maks_m ?? JARAK_BAWAAN)]));
        setJarak(j);
        setIsianJarak(Object.fromEntries(Object.entries(j).map(([u, v]) => [u, String(v)])));
      });
  }, [toast]);

  const simpan = async (ulp: string) => {
    const v = isian[ulp] ?? "";
    setSibuk(ulp);
    const { error } = await supabaseBrowser.rpc("atur_tegangan_ujung", {
      p_ulp: ulp,
      p_berlaku_mulai: v ? `${v}-01` : null,
      p_oleh: user.name ?? user.email,
    });
    setSibuk(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAturan((p) => ({ ...(p ?? {}), [ulp]: v ? `${v}-01` : null }));
    toast.success(v ? `Aturan ULP ${ulp} berlaku mulai ${labelBulan(`${v}-01`)}.` : `Aturan ULP ${ulp} dikosongkan — seperti semula.`);
  };

  const simpanJarak = async (ulp: string) => {
    const v = Number(isianJarak[ulp]);
    if (!Number.isInteger(v) || v < 10 || v > 1000) {
      toast.error("Batas jarak harus bilangan bulat 10–1000 m.");
      return;
    }
    setSibuk(`jarak-${ulp}`);
    const { error } = await supabaseBrowser.rpc("atur_jarak_tegangan_ujung", { p_ulp: ulp, p_jarak: v, p_oleh: user.name ?? user.email });
    setSibuk(null);
    if (error) {
      toast.error(
        error.message.includes("Could not find the function")
          ? "Pengaturan jarak belum terpasang — jalankan scripts/tegangan-ujung-jarak.sql di Supabase."
          : error.message,
      );
      return;
    }
    setJarak((p) => ({ ...p, [ulp]: v }));
    toast.success(`Batas jarak titik ukur ULP ${ulp}: ${v} m dari tiang JTR terdekat.`);
  };

  return (
    <ModalShell
      title="Aturan tegangan ujung"
      subtitle="Berlaku mulai bulan — per ULP"
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={<button onClick={onTutup} className={BTN_GHOST}>Tutup</button>}
    >
      <p className="text-xs text-ink-soft">
        Sejak bulan yang dipilih, di ULP itu: <b>realisasi WO Pengukuran</b> baru terhitung setelah beban <b>dan</b>{" "}
        tegangan ujung terkirim, <b>Kirim ke AMG</b> menunggu tegangan ujung, dan formulir beban di HP tidak lagi
        berisi tegangan ujung. Bulan sebelumnya tidak berubah. Kosong = seperti semula.
      </p>
      <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
        <TriangleAlert size={15} className="shrink-0 mt-0.5" />
        <p>
          Pastikan <b>agen AMG</b> di PC LAN PLN sudah diperbarui sebelum mengisi bulan — agen lama membaca tegangan ujung
          dari formulir beban dan akan mengirimnya kosong.
        </p>
      </div>

      {aturan === null ? (
        <div className="flex items-center gap-2 text-sm text-ink-soft py-6 justify-center">
          <Loader2 size={15} className="animate-spin" /> Memuat…
        </div>
      ) : (
        <div className="space-y-2">
          {ulpBoleh.map((ulp) => {
            const kini = aturan[ulp] ?? null;
            const lewat = !!kini && kini.slice(0, 7) < bulanIni();
            return (
              <div key={ulp} className="flex flex-wrap items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <div className="w-[140px]">
                  <p className="text-sm font-semibold text-ink">{ulp}</p>
                  <p className="text-[11px] text-ink-muted">{kini ? `berlaku ${labelBulan(kini)}` : "belum berlaku"}</p>
                </div>
                <div>
                  <label className={EYEBROW}>Berlaku mulai</label>
                  <input
                    type="month"
                    min={bulanIni()}
                    value={isian[ulp] ?? ""}
                    disabled={lewat}
                    onChange={(e) => setIsian((p) => ({ ...p, [ulp]: e.target.value }))}
                    className={`${FIELD} mt-1 block w-[170px] disabled:opacity-60`}
                  />
                </div>
                <button
                  onClick={() => void simpan(ulp)}
                  disabled={lewat || sibuk !== null || (isian[ulp] ?? "") === (kini ? kini.slice(0, 7) : "")}
                  className={`${BTN_PRIMARY} ml-auto`}
                >
                  {sibuk === ulp ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Simpan
                </button>
                {lewat && <p className="w-full text-[11px] text-ink-muted">Sudah berlaku — bulan yang sudah lewat tidak diubah dari sini.</p>}
                <div className="w-full flex flex-wrap items-end gap-3 border-t border-line pt-2.5">
                  <div>
                    <label className={EYEBROW}>Batas jarak titik ukur</label>
                    <div className="mt-1 flex items-center gap-1.5">
                      <input
                        type="number"
                        min={10}
                        max={1000}
                        value={isianJarak[ulp] ?? String(JARAK_BAWAAN)}
                        onChange={(e) => setIsianJarak((p) => ({ ...p, [ulp]: e.target.value }))}
                        className={`${FIELD} w-[100px] text-right`}
                      />
                      <span className="text-xs text-ink-muted">m dari tiang JTR gardu yang terdekat</span>
                    </div>
                  </div>
                  <button
                    onClick={() => void simpanJarak(ulp)}
                    disabled={sibuk !== null || Number(isianJarak[ulp] ?? JARAK_BAWAAN) === (jarak[ulp] ?? JARAK_BAWAAN)}
                    className={`${BTN_GHOST} ml-auto`}
                  >
                    {sibuk === `jarak-${ulp}` ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Simpan batas
                  </button>
                  <p className="w-full text-[11px] text-ink-muted">
                    Lebih jauh dari ini, Simpan di HP dan Kirim ditolak. Gardu tanpa data JTR tidak dicek jaraknya.
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}
