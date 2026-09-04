"use client";

import { useState } from "react";
import { Loader2, Plus, AlertCircle } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { KOLOM_MASTER, PREFIX_AMG, ULP_LIST } from "../_lib/garduMaster";

/**
 * Tambah satu gardu ke master.
 *
 * Field-nya DIBANGKITKAN dari `KOLOM_MASTER` — definisi yang sama dengan template
 * impor dan pembaca unggahan. Menuliskan ulang daftar kolom di sini akan membuat
 * tiga tempat yang "seharusnya sama", dan yang satu pasti ketinggalan saat yang
 * lain diubah.
 *
 * Jalur ini bukan pelengkap impor. Begitu aplikasi mobile berpindah dari Google
 * Sheet ke master Supabase, menambah gardu lewat spreadsheet tidak lagi mungkin —
 * dan modal ini jadi satu-satunya cara menambah gardu satuan.
 */

const FIELD =
  "h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:border-navy-500 focus:ring-2 focus:ring-navy-500/15";

/** Nilai form: seluruh field disimpan sebagai teks, dikonversi saat menyimpan.
 *  Input angka yang setengah diketik ("-8.") bukan angka yang sah, dan memaksa
 *  konversi tiap ketukan membuat kolomnya melompat-lompat saat diisi. */
type Form = Record<string, string>;

const kosong = (): Form =>
  Object.fromEntries(KOLOM_MASTER.map((k) => [k.field, ""]));

interface TambahGarduModalProps {
  /** ULP yang sedang aktif di halaman — jadi nilai awal supaya tidak perlu dipilih
   *  ulang untuk kasus yang paling sering. Kosong = user melihat semua ULP. */
  ulpAwal: string;
  onClose: () => void;
  onSelesai: () => void;
}

export default function TambahGarduModal({ ulpAwal, onClose, onSelesai }: TambahGarduModalProps) {
  const [form, setForm] = useState<Form>(() => ({ ...kosong(), ulp: ulpAwal }));
  const [galat, setGalat] = useState<string[]>([]);
  const [menyimpan, setMenyimpan] = useState(false);
  const [sukses, setSukses] = useState<string | null>(null);

  const ubah = (field: string, nilai: string) => {
    setForm((p) => ({ ...p, [field]: nilai }));
    setGalat([]);
    setSukses(null);
  };

  /** Aturannya sengaja sama persis dengan cabang "template" di `bacaBerkasMaster`
   *  — gardu yang ditolak lewat unggahan tidak boleh lolos lewat modal. */
  function periksa(): string[] {
    const e: string[] = [];
    const kode = form.kode.trim().toUpperCase();
    const ulp = form.ulp.trim().toUpperCase();

    if (!kode) e.push("KODE wajib diisi.");
    if (!ulp) e.push("ULP wajib dipilih.");
    else if (!ULP_LIST.includes(ulp as (typeof ULP_LIST)[number])) e.push(`ULP "${ulp}" tidak dikenal.`);

    const daya = Number(form.daya.replace(",", "."));
    if (!form.daya.trim()) e.push("DAYA_KVA wajib diisi untuk gardu baru.");
    else if (!Number.isFinite(daya) || daya <= 0) e.push("DAYA_KVA harus angka lebih besar dari 0.");

    const adaLat = form.lat.trim() !== "";
    const adaLng = form.lng.trim() !== "";
    if (adaLat !== adaLng) e.push("LAT dan LNG harus diisi berpasangan.");
    if (adaLat) {
      const lat = Number(form.lat.replace(",", "."));
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) e.push("LAT di luar rentang -90..90.");
    }
    if (adaLng) {
      const lng = Number(form.lng.replace(",", "."));
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) e.push("LNG di luar rentang -180..180.");
    }
    return e;
  }

  async function simpan() {
    const e = periksa();
    if (e.length) { setGalat(e); return; }

    setMenyimpan(true);
    setGalat([]);
    try {
      const kode = form.kode.trim().toUpperCase();
      const ulp = form.ulp.trim().toUpperCase();

      // Diperiksa lebih dulu supaya pesannya bisa menyebut gardunya. Indeks unik
      // (kode, ulp) tetap jadi penjaga terakhir kalau ada yang menyisip di sela.
      const { data: ada, error: eCek } = await supabaseBrowser
        .from("gardu")
        .select("kode")
        .eq("kode", kode)
        .eq("ulp", ulp)
        .maybeSingle();
      if (eCek) throw new Error(eCek.message);
      if (ada) {
        setGalat([`Gardu ${kode} di ULP ${ulp} sudah ada. Ubah lewat Impor Master kalau mau memperbaruinya.`]);
        return;
      }

      const teks = (f: string) => (form[f].trim() === "" ? null : form[f].trim());
      const angka = (f: string) => {
        const v = form[f].replace(",", ".").trim();
        return v === "" ? null : Number(v);
      };

      // `id` tidak dikirim — kolomnya sudah punya nilai bawaan di database
      // (scripts/gardu-id-default.sql), dan mengisinya dari sini justru berisiko.
      const { error } = await supabaseBrowser.from("gardu").insert({
        kode,
        ulp,
        daya: angka("daya"),
        nama: teks("nama"),
        alamat: teks("alamat"),
        feeder: teks("feeder"),
        merk: teks("merk"),
        status: teks("status") ?? "Aktif",
        kode_amg: teks("kode_amg") ?? (PREFIX_AMG[ulp] ? PREFIX_AMG[ulp] + kode : null),
        lat: angka("lat"),
        lng: angka("lng"),
      });
      if (error) throw new Error(error.message);

      setSukses(`Gardu ${kode} (${ulp}) ditambahkan.`);
      setForm({ ...kosong(), ulp });
      onSelesai();
    } catch (err) {
      setGalat([err instanceof Error ? err.message : "Gagal menyimpan gardu."]);
    } finally {
      setMenyimpan(false);
    }
  }

  return (
    <ModalShell
      title="Tambah Gardu"
      subtitle="Satu gardu ke master. Kolom bertanda * wajib diisi."
      maxWidth="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <p className="text-xs text-ink-muted">
            Untuk menambah banyak gardu sekaligus, pakai Impor Master.
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-ink-soft border border-line rounded-lg hover:bg-surface"
            >
              Tutup
            </button>
            <button
              onClick={simpan}
              disabled={menyimpan}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-navy-600 text-white hover:bg-navy-500 disabled:opacity-50"
            >
              {menyimpan ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Simpan Gardu
            </button>
          </div>
        </>
      }
    >
      {galat.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
            <AlertCircle size={14} /> Belum bisa disimpan
          </p>
          <ul className="mt-1 ml-5 list-disc text-sm text-red-700 space-y-0.5">
            {galat.map((g) => <li key={g}>{g}</li>)}
          </ul>
        </div>
      )}

      {sukses && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {sukses} Form dikosongkan — silakan isi gardu berikutnya.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {KOLOM_MASTER.map((k) => (
          <div key={k.field}>
            <label className="block text-xs font-semibold text-ink-soft mb-1">
              {k.header}
              {k.wajibBaru && <span className="text-red-600"> *</span>}
            </label>

            {k.pilihan ? (
              <select
                value={form[k.field]}
                onChange={(e) => ubah(k.field, e.target.value)}
                className={FIELD}
              >
                <option value="">{k.field === "status" ? "Aktif (bawaan)" : "— pilih —"}</option>
                {k.pilihan.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            ) : (
              <input
                value={form[k.field]}
                onChange={(e) => ubah(k.field, e.target.value)}
                inputMode={k.numerik ? "decimal" : "text"}
                placeholder={k.field === "kode" ? "AM264" : ""}
                className={FIELD}
              />
            )}

            <p className="text-[11px] text-ink-muted mt-1 leading-snug">{k.petunjuk}</p>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}
