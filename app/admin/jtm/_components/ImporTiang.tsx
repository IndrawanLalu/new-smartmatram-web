"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, TriangleAlert, Upload } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";
import { parseClipboardTable } from "@/lib/parseClipboardTable";
import { type CurrentUser, canSeeAllUnits, UNITS } from "@/lib/roles";
import { BTN_GHOST, BTN_PRIMARY, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useSegmen } from "../_hooks/useSegmen";

/** Kolom yang dipakai. Sisanya di berkas sumber sengaja diabaikan — termasuk
 *  PANJANG, yang turunan dari koordinat dan akan basi begitu satu titik
 *  dikoreksi. */
const KOLOM = [
  { key: "lat", label: "Lintang (LAT)", wajib: true, tebak: /^lat/i },
  { key: "lng", label: "Bujur (LNG)", wajib: true, tebak: /^(lng|lon)/i },
  { key: "nomor_lama", label: "Nomor tiang lama", wajib: false, tebak: /no.?_?tiang|^no$|nomor/i },
  { key: "jenis", label: "Jenis tiang", wajib: false, tebak: /jenis/i },
  { key: "konstruksi", label: "Konstruksi", wajib: false, tebak: /konstruksi/i },
  { key: "catatan", label: "Catatan", wajib: false, tebak: /gardu|keterangan|catatan/i },
] as const;

type KolomKey = (typeof KOLOM)[number]["key"];

interface Hasil {
  masuk: number;
  duplikat: number;
  tanpa_titik: number;
  bentang_maks_m: number;
  bentang_di_atas_wajar: number;
  ambang_wajar_m: number;
}

/** Koordinat di berkas lapangan sering memakai koma desimal. */
const angka = (s: string): number | null => {
  const v = parseFloat(s.trim().replace(",", "."));
  return Number.isFinite(v) ? v : null;
};

export default function ImporTiang({ user }: { user: CurrentUser }) {
  const toast = useToast();
  const [teks, setTeks] = useState("");
  const [peta, setPeta] = useState<Record<KolomKey, number>>({
    lat: -1, lng: -1, nomor_lama: -1, jenis: -1, konstruksi: -1, catatan: -1,
  });
  const [penyulang, setPenyulang] = useState("");
  const [ulp, setUlp] = useState(canSeeAllUnits(user.role) ? "" : (user.unit ?? ""));
  const [segmenId, setSegmenId] = useState("");
  const [proses, setProses] = useState(false);
  const [hasil, setHasil] = useState<Hasil | null>(null);

  const { baris: segmenList, penyulangList, muat: muatSegmen } = useSegmen(user, ulp);

  const tabel = useMemo(() => (teks.trim() ? parseClipboardTable(teks) : null), [teks]);

  /** Tebak pemetaan begitu tabel ditempel — mengisi enam pilihan dengan tangan
   *  tiap kali impor adalah pekerjaan yang tidak perlu ada. */
  const tempel = (isi: string) => {
    setTeks(isi);
    setHasil(null);
    const t = parseClipboardTable(isi);
    if (t.headers.length === 0) return;
    const baru = { ...peta };
    for (const k of KOLOM) {
      const i = t.headers.findIndex((h) => k.tebak.test(h.trim()));
      baru[k.key] = i;
    }
    setPeta(baru);
  };

  const barisSiap = useMemo(() => {
    if (!tabel || peta.lat < 0 || peta.lng < 0) return [];
    return tabel.rows
      .map((r) => ({
        lat: angka(r[peta.lat] ?? ""),
        lng: angka(r[peta.lng] ?? ""),
        nomor_lama: peta.nomor_lama >= 0 ? (r[peta.nomor_lama] ?? "") : "",
        jenis: peta.jenis >= 0 ? (r[peta.jenis] ?? "") : "",
        konstruksi: peta.konstruksi >= 0 ? (r[peta.konstruksi] ?? "") : "",
        catatan: peta.catatan >= 0 ? (r[peta.catatan] ?? "") : "",
      }))
      .filter((r) => r.lat !== null && r.lng !== null);
  }, [tabel, peta]);

  const segmenPenyulang = useMemo(
    () => segmenList.filter((s) => s.penyulang.toUpperCase() === penyulang.trim().toUpperCase()),
    [segmenList, penyulang],
  );

  const siap = penyulang.trim() !== "" && ulp !== "" && barisSiap.length > 0;

  const impor = async () => {
    setProses(true);
    setHasil(null);
    const { data, error } = await supabaseBrowser.rpc("impor_tiang_jtm", {
      p_penyulang: penyulang.trim(),
      p_ulp: ulp,
      p_baris: barisSiap,
      p_segmen_id: segmenId || null,
      p_oleh: user.name || user.email,
    });
    setProses(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setHasil(data as unknown as Hasil);
    toast.success(`${(data as unknown as Hasil).masuk} tiang masuk master.`);
    void muatSegmen();
  };

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Impor tiang dari Excel</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Salin baris dari Excel atau Sheet (termasuk barisan judulnya), lalu tempel di bawah.
          Yang dibaca cuma koordinat dan keterangan tiang — <b>kolom panjang sengaja diabaikan</b>,
          karena panjang diturunkan dari koordinat dan angka yang disalin akan berselisih dengan
          kenyataan begitu satu titik dikoreksi.
        </p>
        <p className="text-xs text-ink-soft mt-2 max-w-3xl">
          Induk tiap tiang ditentukan dari <b>tiang terdekat yang sudah ada</b>, bukan dari urutan
          baris. Urutan terlihat menggoda, tapi satu baris cabang di tengah membuat seluruh
          rantai sesudahnya salah tanpa ada yang tahu.
        </p>

        <textarea
          value={teks}
          onChange={(e) => tempel(e.target.value)}
          onPaste={(e) => {
            const isi = e.clipboardData.getData("text");
            if (isi) {
              e.preventDefault();
              tempel(isi);
            }
          }}
          rows={6}
          placeholder="Tempel di sini…"
          className={`${FIELD} mt-3 w-full h-auto py-2 font-mono text-xs`}
        />

        {tabel && (
          <p className="text-xs text-ink-muted mt-1">
            {tabel.rows.length.toLocaleString("id-ID")} baris terbaca · {tabel.headers.length} kolom
          </p>
        )}
      </div>

      {tabel && tabel.headers.length > 0 && (
        <div className={`${CARD} p-5 space-y-4`}>
          <div>
            <p className={EYEBROW}>Pasangkan kolom</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-2">
              {KOLOM.map((k) => (
                <div key={k.key}>
                  <label className="text-xs text-ink-soft">
                    {k.label}
                    {k.wajib && <span className="text-danger"> *</span>}
                  </label>
                  <select
                    value={peta[k.key]}
                    onChange={(e) => setPeta((s) => ({ ...s, [k.key]: Number(e.target.value) }))}
                    className={`${FIELD} mt-1 w-full`}
                  >
                    <option value={-1}>— tidak dipakai —</option>
                    {tabel.headers.map((h, i) => (
                      <option key={`${h}-${i}`} value={i}>
                        {h || `(kolom ${i + 1})`}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-3 gap-3 border-t border-line pt-4">
            <div>
              <label className={EYEBROW}>Penyulang pemilik</label>
              <input
                value={penyulang}
                onChange={(e) => {
                  setPenyulang(e.target.value);
                  setSegmenId("");
                }}
                list="impor-penyulang"
                placeholder="GUNUNG SARI"
                className={`${FIELD} mt-1 w-full`}
              />
              <datalist id="impor-penyulang">
                {penyulangList.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <p className="text-[11px] text-ink-muted mt-1">
                Menentukan prefiks nama tiang. Dibuatkan sistem kalau belum ada.
              </p>
            </div>

            <div>
              <label className={EYEBROW}>ULP</label>
              <select
                value={ulp}
                onChange={(e) => setUlp(e.target.value)}
                disabled={!canSeeAllUnits(user.role)}
                className={`${FIELD} mt-1 w-full disabled:bg-surface`}
              >
                <option value="">— pilih —</option>
                {UNITS.map((u) => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={EYEBROW}>Masukkan ke segmen</label>
              <select
                value={segmenId}
                onChange={(e) => setSegmenId(e.target.value)}
                className={`${FIELD} mt-1 w-full`}
              >
                <option value="">— tidak dulu —</option>
                {segmenPenyulang.map((s) => (
                  <option key={s.segmen_id} value={s.segmen_id}>
                    {s.nama}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-ink-muted mt-1">
                Boleh dikosongkan — tiang tetap masuk master, segmennya disambungkan belakangan.
              </p>
            </div>
          </div>

          {/* Tiang tanpa segmen masuk master tapi TIDAK terlihat di inspeksi —
              satuan pekerjaan regu adalah segmen. Tanpa peringatan ini orang
              baru tahu setelah membuka HP dan menemukan daftarnya kosong. */}
          {!segmenId && (
            <p className="flex items-start gap-2 text-xs text-ink-soft bg-attention-tint rounded-xl p-3">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-attention" />
              <span>
                Belum memilih segmen. Tiangnya tetap masuk master, tapi{" "}
                <b>tidak akan terlihat di inspeksi</b> sampai dimasukkan ke sebuah segmen —
                regu memeriksa per segmen, bukan per penyulang. Ini wajar kalau berkasnya
                memuat beberapa segmen sekaligus: batas ruas tidak ada di Excel, dan yang
                memperlihatkannya cuma peta. Tandai rentang tiangnya nanti di tab Peta.
              </span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-ink-soft">
              <b>{barisSiap.length.toLocaleString("id-ID")}</b> baris berkoordinat siap diimpor
              {tabel.rows.length !== barisSiap.length && (
                <span className="text-attention">
                  {" "}
                  · {(tabel.rows.length - barisSiap.length).toLocaleString("id-ID")} baris tanpa
                  koordinat akan dilewati
                </span>
              )}
            </p>
            <button onClick={() => void impor()} disabled={!siap || proses} className={BTN_PRIMARY}>
              {proses ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
              Impor
            </button>
          </div>
        </div>
      )}

      {hasil && (
        <div className={`${CARD} p-5`}>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <CheckCircle2 size={16} className="text-green-600" /> Impor selesai
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <Angka label="Masuk master" nilai={hasil.masuk} />
            <Angka
              label="Sudah ada"
              nilai={hasil.duplikat}
              bantu="titiknya berimpit dengan tiang yang sudah tercatat"
            />
            <Angka label="Tanpa koordinat" nilai={hasil.tanpa_titik} />
            <Angka
              label="Bentang terpanjang"
              nilai={`${hasil.bentang_maks_m} m`}
              bantu={`ambang wajar ${hasil.ambang_wajar_m} m`}
            />
          </div>

          {hasil.bentang_di_atas_wajar > 0 && (
            <p className="flex items-start gap-2 text-xs text-ink-soft bg-attention-tint rounded-xl p-3 mt-3">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-attention" />
              <span>
                <b>{hasil.bentang_di_atas_wajar} bentang</b> melebihi {hasil.ambang_wajar_m} m.
                Biasanya berarti salah satu dari dua hal: ada tiang yang belum tercatat di
                antaranya, atau koordinat di berkas sumber meleset. Lihat di tab Peta — dua-duanya
                langsung kelihatan di sana.
              </span>
            </p>
          )}

          <button onClick={() => { setTeks(""); setHasil(null); }} className={`${BTN_GHOST} mt-3`}>
            Impor berkas lain
          </button>
        </div>
      )}
    </div>
  );
}

function Angka({ label, nilai, bantu }: { label: string; nilai: number | string; bantu?: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[11px] text-ink-muted">{label}</p>
      <p className="text-xl font-semibold text-ink tabular-nums">
        {typeof nilai === "number" ? nilai.toLocaleString("id-ID") : nilai}
      </p>
      {bantu && <p className="text-[10px] text-ink-muted mt-0.5">{bantu}</p>}
    </div>
  );
}
