"use client";

import { useMemo, useState } from "react";
import { Link2, Loader2 } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW, FIELD } from "@/app/admin/_ui";
import { UNITS } from "@/lib/roles";
import {
  JENIS_TITIK,
  namaSegmen,
  type SegmenBaris,
  type SegmenBaru,
} from "../_hooks/useSegmen";

interface Props {
  penyulangList: string[];
  ulpAwal: string;
  /** Segmen yang sudah ada — dipakai MENYAMBUNG, bukan sekadar daftar. */
  segmenAda: SegmenBaris[];
  onSimpan: (v: SegmenBaru) => Promise<boolean>;
  onTutup: () => void;
}

const KOSONG = {
  penyulang: "",
  ulp: "",
  titik_awal_jenis: "REC",
  titik_awal_nama: "",
  titik_akhir_jenis: "LBS",
  titik_akhir_nama: "",
  penghantar_jenis: "",
  penghantar_ukuran: "",
  catatan: "",
};

export default function SegmenModal({
  penyulangList,
  ulpAwal,
  segmenAda,
  onSimpan,
  onTutup,
}: Props) {
  const [v, setV] = useState({ ...KOSONG, ulp: ulpAwal });
  const [menyimpan, setMenyimpan] = useState(false);
  const [sambungDari, setSambungDari] = useState("");

  const ubah = (patch: Partial<typeof KOSONG>) => setV((s) => ({ ...s, ...patch }));

  const sepenyulang = useMemo(
    () =>
      segmenAda.filter(
        (s) => s.penyulang.trim().toUpperCase() === v.penyulang.trim().toUpperCase(),
      ),
    [segmenAda, v.penyulang],
  );

  /**
   * Ujung yang belum tersambung: titik akhir sebuah segmen yang belum jadi
   * titik awal segmen mana pun. Di situlah ruas berikutnya bermula.
   *
   * Menawarkannya lebih dulu membuat penamaan bersambung dengan sendirinya —
   * "LBS PERPUSTAKAAN" tidak diketik dua kali, jadi tidak bisa lahir sebagai
   * "LBS. PERPUSTAKAAN" di baris berikutnya. Ejaan yang berbeda untuk tempat
   * yang sama adalah cara paling senyap membuat satu jaringan terbaca sebagai
   * dua potongan yang tidak nyambung.
   */
  const ujungTerbuka = useMemo(() => {
    const dipakaiSebagaiAwal = new Set(
      sepenyulang.map((s) => `${s.titik_awal_jenis}|${s.titik_awal_nama.toUpperCase()}`),
    );
    return sepenyulang.filter(
      (s) =>
        !dipakaiSebagaiAwal.has(`${s.titik_akhir_jenis}|${s.titik_akhir_nama.toUpperCase()}`),
    );
  }, [sepenyulang]);

  const sambung = (id: string) => {
    setSambungDari(id);
    const s = sepenyulang.find((x) => x.segmen_id === id);
    if (s) ubah({ titik_awal_jenis: s.titik_akhir_jenis, titik_awal_nama: s.titik_akhir_nama });
  };

  /** Nama titik yang sudah pernah dipakai di penyulang ini — supaya ejaan yang
   *  sama tidak lahir dua rupa pada bagian yang memang harus diketik. */
  const namaTitik = useMemo(() => {
    const set = new Set<string>();
    for (const s of sepenyulang) {
      if (s.titik_awal_nama) set.add(s.titik_awal_nama);
      if (s.titik_akhir_nama) set.add(s.titik_akhir_nama);
    }
    return [...set].sort();
  }, [sepenyulang]);

  const nama = namaSegmen(
    v.titik_awal_jenis,
    v.titik_awal_nama,
    v.titik_akhir_jenis,
    v.titik_akhir_nama,
  );

  const siap =
    v.penyulang.trim() !== "" &&
    v.ulp !== "" &&
    (v.titik_awal_nama.trim() !== "" || v.titik_awal_jenis === "UJUNG") &&
    (v.titik_akhir_nama.trim() !== "" || v.titik_akhir_jenis === "UJUNG");

  const simpan = async () => {
    setMenyimpan(true);
    const ok = await onSimpan({
      penyulang: v.penyulang,
      ulp: v.ulp,
      titik_awal_jenis: v.titik_awal_jenis,
      titik_awal_nama: v.titik_awal_nama,
      titik_akhir_jenis: v.titik_akhir_jenis,
      titik_akhir_nama: v.titik_akhir_nama,
      penghantar_jenis: v.penghantar_jenis.trim() || null,
      penghantar_ukuran: v.penghantar_ukuran ? Number(v.penghantar_ukuran) : null,
      catatan: v.catatan.trim() || null,
    });
    setMenyimpan(false);
    if (ok) onTutup();
  };

  return (
    <ModalShell
      title="Segmen baru"
      subtitle="Namanya dibentuk sendiri dari kedua ujungnya — itu yang membuat dua orang menyebut ruas yang sama dengan nama yang sama."
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onTutup} className={BTN_GHOST}>
            Batal
          </button>
          <button onClick={() => void simpan()} disabled={!siap || menyimpan} className={BTN_PRIMARY}>
            {menyimpan && <Loader2 size={15} className="animate-spin" />}
            Simpan
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={EYEBROW}>Penyulang</label>
            <input
              value={v.penyulang}
              onChange={(e) => {
                ubah({ penyulang: e.target.value });
                setSambungDari("");
              }}
              list="jtm-penyulang"
              placeholder="MATARAM"
              className={`${FIELD} mt-1 w-full`}
            />
            <datalist id="jtm-penyulang">
              {penyulangList.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label className={EYEBROW}>ULP</label>
            <select
              value={v.ulp}
              onChange={(e) => ubah({ ulp: e.target.value })}
              className={`${FIELD} mt-1 w-full`}
            >
              <option value="">— pilih —</option>
              {UNITS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {sepenyulang.length > 0 && (
          <div className="rounded-xl border border-line p-3">
            <label className={`${EYEBROW} flex items-center gap-1.5`}>
              <Link2 size={13} /> Sambungan dari segmen
            </label>
            <select
              value={sambungDari}
              onChange={(e) => sambung(e.target.value)}
              className={`${FIELD} mt-1 w-full`}
            >
              <option value="">— mulai sendiri, bukan lanjutan —</option>
              {ujungTerbuka.length > 0 && (
                <optgroup label="Ujung yang belum tersambung">
                  {ujungTerbuka.map((s) => (
                    <option key={s.segmen_id} value={s.segmen_id}>
                      {s.nama}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Segmen lain">
                {sepenyulang
                  .filter((s) => !ujungTerbuka.some((u) => u.segmen_id === s.segmen_id))
                  .map((s) => (
                    <option key={s.segmen_id} value={s.segmen_id}>
                      {s.nama}
                    </option>
                  ))}
              </optgroup>
            </select>
            <p className="text-[11px] text-ink-muted mt-1">
              Titik awalnya diambil dari titik akhir segmen itu — tidak diketik ulang, jadi
              ejaannya tidak bisa berbeda di dua baris.
            </p>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Ujung
            judul="Titik awal"
            jenis={v.titik_awal_jenis}
            nama={v.titik_awal_nama}
            daftarNama={namaTitik}
            dariSambungan={!!sambungDari}
            onLepas={() => setSambungDari("")}
            onJenis={(x) => ubah({ titik_awal_jenis: x })}
            onNama={(x) => ubah({ titik_awal_nama: x })}
          />
          <Ujung
            judul="Titik akhir"
            jenis={v.titik_akhir_jenis}
            nama={v.titik_akhir_nama}
            daftarNama={namaTitik}
            onJenis={(x) => ubah({ titik_akhir_jenis: x })}
            onNama={(x) => ubah({ titik_akhir_nama: x })}
          />
        </div>

        <div className="rounded-xl bg-surface px-4 py-3">
          <p className={EYEBROW}>Nama yang akan tersimpan</p>
          <p className="text-sm font-semibold text-ink mt-0.5">{nama}</p>
          <p className="text-[11px] text-ink-muted mt-1">
            Pengambilan (PENG) tidak memotong jaringan — dia percabangan di dalam segmen. Kalau
            titik awalnya sebuah tiang percabangan, segmen induknya ditemukan sendiri dari tiang
            itu.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className={EYEBROW}>Penghantar</label>
            <input
              value={v.penghantar_jenis}
              onChange={(e) => ubah({ penghantar_jenis: e.target.value })}
              placeholder="AAAC, AAACS, A3C…"
              className={`${FIELD} mt-1 w-full`}
            />
          </div>
          <div>
            <label className={EYEBROW}>Ukuran (mm²)</label>
            <input
              type="number"
              value={v.penghantar_ukuran}
              onChange={(e) => ubah({ penghantar_ukuran: e.target.value })}
              placeholder="150"
              className={`${FIELD} mt-1 w-full`}
            />
          </div>
        </div>

        <div>
          <label className={EYEBROW}>Catatan</label>
          <textarea
            value={v.catatan}
            onChange={(e) => ubah({ catatan: e.target.value })}
            rows={2}
            className={`${FIELD} mt-1 w-full h-auto py-2`}
          />
        </div>
      </div>
    </ModalShell>
  );
}

function Ujung({
  judul,
  jenis,
  nama,
  daftarNama,
  dariSambungan,
  onLepas,
  onJenis,
  onNama,
}: {
  judul: string;
  jenis: string;
  nama: string;
  daftarNama: string[];
  dariSambungan?: boolean;
  onLepas?: () => void;
  onJenis: (x: string) => void;
  onNama: (x: string) => void;
}) {
  const info = JENIS_TITIK.find((j) => j.kode === jenis);
  const idDaftar = `titik-${judul.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div
      className={`rounded-xl border p-3 ${
        dariSambungan ? "border-navy-200 bg-navy-50/40" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className={EYEBROW}>{judul}</p>
        {dariSambungan && (
          <button onClick={onLepas} className="text-[11px] font-semibold text-navy-600">
            ubah sendiri
          </button>
        )}
      </div>

      <select
        value={jenis}
        onChange={(e) => onJenis(e.target.value)}
        disabled={dariSambungan}
        className={`${FIELD} mt-1 w-full disabled:bg-surface disabled:text-ink-soft`}
      >
        {JENIS_TITIK.map((j) => (
          <option key={j.kode} value={j.kode}>
            {j.label}
          </option>
        ))}
      </select>

      <input
        value={nama}
        onChange={(e) => onNama(e.target.value)}
        list={idDaftar}
        disabled={dariSambungan}
        placeholder={jenis === "UJUNG" ? "boleh dikosongkan" : "nama tempat / kode"}
        className={`${FIELD} mt-2 w-full disabled:bg-surface disabled:text-ink-soft`}
      />
      <datalist id={idDaftar}>
        {daftarNama.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <p className="text-[11px] text-ink-muted mt-1">
        {dariSambungan
          ? "Diambil dari segmen sebelumnya"
          : info?.memotong
            ? "Memotong jaringan"
            : "Tidak memotong jaringan"}
      </p>
    </div>
  );
}
