"use client";

import { useRef, useState } from "react";
import {
  AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload,
} from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fetchAllRows } from "@/lib/supabasePaginate";
import {
  bacaBerkasMaster, buatTemplateMaster, KOLOM_MASTER, namaBerkasTemplate,
  type BarisMaster, type HasilBaca,
} from "../_lib/garduMaster";

interface Props {
  onClose: () => void;
  onSelesai: () => void;
}

/** Berapa baris di-upsert sekali jalan. Cukup besar untuk cepat, cukup kecil
 *  supaya satu baris bermasalah tidak menjatuhkan seluruh unggahan. */
const BATCH = 200;

type Fase = "pilih" | "pratinjau" | "mengirim" | "selesai";

export default function ImportMasterGarduModal({ onClose, onSelesai }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fase, setFase] = useState<Fase>("pilih");
  const [namaBerkas, setNamaBerkas] = useState("");
  const [baca, setBaca] = useState<HasilBaca | null>(null);
  const [galatBerkas, setGalatBerkas] = useState<string | null>(null);
  const [kunciAda, setKunciAda] = useState<Set<string>>(new Set());
  const [progres, setProgres] = useState(0);
  const [hasil, setHasil] = useState<{ baru: number; diperbarui: number; gagal: number; pesan?: string } | null>(null);

  const baris: BarisMaster[] = baca?.baris ?? [];
  /** Kunci gardu = KODE + ULP. Kode saja tidak unik lintas ULP — ekspor AMG
   *  memuat enam kode yang muncul di dua ULP berbeda. */
  const kunci = (b: BarisMaster) => `${b.kode}|${b.ulp}`;

  const sah = baris.filter((b) => b.galat.length === 0);
  const bermasalah = baris.filter((b) => b.galat.length > 0);
  const baru = sah.filter((b) => !kunciAda.has(kunci(b)));
  const diperbarui = sah.filter((b) => kunciAda.has(kunci(b)));

  /** Baris BARU wajib punya ULP dan DAYA; yang memperbarui cukup KODE + ULP. */
  const baruKurang = baru.filter((b) => !b.ulp || !b.nilai.daya);

  async function unduhTemplate() {
    const blob = await buatTemplateMaster();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = namaBerkasTemplate();
    a.click();
    URL.revokeObjectURL(url);
  }

  async function pilihBerkas(file: File) {
    setGalatBerkas(null);
    setNamaBerkas(file.name);
    try {
      const hasilBaca = await bacaBerkasMaster(file);
      if (hasilBaca.baris.length === 0) {
        setGalatBerkas("Tidak ada baris berisi data di berkas ini.");
        return;
      }
      // Cek mana yang sudah ada supaya bisa dibedakan tambah vs perbarui —
      // dan supaya syarat kolom wajib hanya diterapkan pada yang benar-benar baru.
      //
      // WAJIB berpaginasi: PostgREST memotong di 1.000 baris. Sekarang masternya
      // 812 jadi belum terasa, tapi begitu ekspor AMG (2.526) masuk, impor
      // BERIKUTNYA akan mengira ribuan gardu lama sebagai baru dan menolaknya
      // karena dianggap kurang kolom wajib.
      const ada = await fetchAllRows<{ kode: string; ulp: string | null }>(() =>
        supabaseBrowser.from("gardu").select("kode,ulp").order("kode"),
      );
      setKunciAda(new Set(
        ada.map((g) => `${String(g.kode).toUpperCase()}|${String(g.ulp ?? "").toUpperCase()}`),
      ));
      setBaca(hasilBaca);
      setFase("pratinjau");
    } catch (e) {
      setGalatBerkas(e instanceof Error ? e.message : "Berkas gagal dibaca");
    }
  }

  async function kirim() {
    setFase("mengirim");
    setProgres(0);
    let gagal = 0;
    /** Pesan galat PERTAMA dari database. Tanpa ini, kegagalan menyeluruh —
     *  RLS menolak, kolom hilang, kunci tak cocok — hanya tampil sebagai angka
     *  dan penyebabnya tidak pernah sampai ke layar. */
    let pesanGalat: string | undefined;

    const siap = sah.filter((b) => !baruKurang.includes(b));

    const muatan = siap.map((b) => ({
      kode: b.kode,
      ulp: b.ulp,
      // `id` SENGAJA tidak dikirim. Kolomnya NOT NULL tanpa bawaan sampai
      // scripts/gardu-id-default.sql dijalankan; setelah itu INSERT mengisi
      // sendiri dan UPDATE tidak menyentuhnya. Mengirim id dari sini justru
      // berbahaya — pada baris yang diperbarui ia akan menimpa primary key
      // gardu yang sudah ada.
      //
      // `status` awal hanya untuk gardu BARU, supaya impor ulang tidak
      // menghidupkan kembali gardu yang sudah ditandai Nonaktif.
      ...(kunciAda.has(kunci(b)) ? {} : { status: "Aktif" }),
      ...b.nilai,
    }));

    /**
     * Dikelompokkan menurut SUSUNAN KOLOM, baru dipotong per batch.
     *
     * supabase-js menyusun daftar kolom dari GABUNGAN kunci seluruh objek dalam
     * satu panggilan (`PostgrestQueryBuilder.ts`: `values.reduce(...Object.keys)`),
     * lalu baris yang tidak punya kunci itu dikirim sebagai NULL — dan
     * `ON CONFLICT DO UPDATE` menimpanya. Tanpa pengelompokan ini, "sel kosong =
     * jangan ubah" berubah jadi "sel kosong = kosongkan", asal ada baris LAIN di
     * batch yang sama yang mengisi kolom itu.
     *
     * Dua kerusakan yang dicegah: berkas dengan isian tidak rata menghapus
     * alamat/merk/koordinat gardu lain, dan batch berisi campuran gardu baru +
     * lama menghapus kolom `status` gardu lama (karena `status` hanya
     * ditambahkan untuk yang baru).
     */
    const perSusunan = new Map<string, typeof muatan>();
    for (const m of muatan) {
      const tanda = Object.keys(m).sort().join("|");
      const daftar = perSusunan.get(tanda);
      if (daftar) daftar.push(m);
      else perSusunan.set(tanda, [m]);
    }

    let terkirim = 0;
    for (const kelompok of perSusunan.values()) {
      for (let i = 0; i < kelompok.length; i += BATCH) {
        const potongan = kelompok.slice(i, i + BATCH);
        const { error } = await supabaseBrowser
          .from("gardu")
          .upsert(potongan, { onConflict: "kode,ulp" });
        if (error) {
          gagal += potongan.length;
          pesanGalat ??= error.message;
        }
        terkirim += potongan.length;
        setProgres(terkirim);
      }
    }

    const berhasil = siap.length - gagal;
    setHasil({
      // Angka baru/diperbarui hanya sah kalau memang ada yang tersimpan.
      baru: gagal === siap.length ? 0 : baru.length - baruKurang.length,
      diperbarui: gagal === siap.length ? 0 : diperbarui.length,
      gagal,
      pesan: pesanGalat,
    });
    if (berhasil > 0) onSelesai();
    setFase("selesai");
  }

  return (
    <ModalShell
      onClose={onClose}
      title="Impor Master Gardu"
      subtitle="Unduh template, isi di Excel, lalu unggah"
      maxWidth="max-w-3xl"
    >
      <div className="p-5 space-y-4">
        {/* Langkah 1 — template */}
        <div className="rounded-xl border border-line p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet size={18} className="text-navy-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">1. Unduh template</p>
              <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
                Kolom berlatar kuning wajib diisi untuk gardu <b>baru</b>. Untuk gardu yang
                sudah ada, cukup isi <b>KODE</b> ditambah kolom yang mau diubah — sel yang
                dikosongkan tidak akan menimpa data lama.
              </p>
            </div>
            <button onClick={unduhTemplate} className={BTN_GHOST}>
              <Download size={14} /> Template
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {KOLOM_MASTER.map((k) => (
              <span
                key={k.header}
                title={k.petunjuk}
                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                  k.wajibBaru
                    ? "bg-attention-tint border-attention/30 text-attention font-semibold"
                    : "bg-surface border-line text-ink-muted"
                }`}
              >
                {k.header}
              </span>
            ))}
          </div>
        </div>

        {/* Langkah 2 — unggah */}
        {fase === "pilih" && (
          <div className="rounded-xl border border-dashed border-line p-6 text-center">
            <Upload size={22} className="mx-auto text-ink-muted mb-2" />
            <p className="text-sm text-ink mb-1">2. Unggah berkas yang sudah diisi</p>
            <p className="text-xs text-ink-muted mb-3">Format .xlsx</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void pilihBerkas(f); }}
            />
            <button onClick={() => inputRef.current?.click()} className={BTN_PRIMARY}>
              <Upload size={14} /> Pilih Berkas
            </button>
            {galatBerkas && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-red-700">
                <AlertCircle size={13} /> {galatBerkas}
              </div>
            )}
          </div>
        )}

        {/* Langkah 3 — pratinjau */}
        {fase === "pratinjau" && (
          <>
            <div className="rounded-xl border border-line p-4">
              <div className="flex items-center gap-2">
                <p className={EYEBROW}>{namaBerkas}</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-navy-50 text-navy-600 border border-navy-200 font-semibold">
                  {baca?.format === "amg" ? "Ekspor AMG" : "Template SMART"}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-2">
                <Angka label="Baris terbaca" nilai={baris.length} />
                <Angka label="Gardu baru" nilai={baru.length - baruKurang.length} tone="green" />
                <Angka label="Diperbarui" nilai={diperbarui.length} tone="navy" />
                <Angka
                  label="Bermasalah"
                  nilai={bermasalah.length + baruKurang.length}
                  tone={bermasalah.length + baruKurang.length > 0 ? "merah" : undefined}
                />
              </div>
            </div>

            {/* Koordinat ekspor AMG kotor — sebagian X/Y tertukar, sebagian di
                luar nalar. Hasil pembersihannya dilaporkan supaya tidak diam-diam. */}
            {baca?.format === "amg" && (
              <div className="rounded-xl border border-line p-3">
                <p className={`${EYEBROW} mb-1.5`}>Koordinat</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="text-green-700">{baca.ringkasKoordinat.benar} benar</span>
                  <span className="text-navy-600">
                    {baca.ringkasKoordinat.tertukar} tertukar → dibalik otomatis
                  </span>
                  <span className="text-red-600">
                    {baca.ringkasKoordinat.rusak} di luar nalar → dikosongkan
                  </span>
                  <span className="text-ink-muted">{baca.ringkasKoordinat.kosong} memang kosong</span>
                </div>
                <p className="text-[11px] text-ink-muted mt-1.5">
                  Yang tertukar dikenali dari rentangnya (lintang Lombok sekitar −8,5;
                  bujur sekitar 116) lalu ditukar balik. Yang di luar rentang dibuang supaya
                  tidak menaruh penanda ngawur di peta.
                </p>
              </div>
            )}

            {(bermasalah.length > 0 || baruKurang.length > 0) && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 max-h-52 overflow-auto">
                <p className="text-xs font-semibold text-red-700 mb-1.5">
                  Baris berikut dilewati — sisanya tetap diimpor
                </p>
                <ul className="space-y-0.5 text-[11px] text-red-700">
                  {bermasalah.slice(0, 30).map((b) => (
                    <li key={`e${b.baris}`}>Baris {b.baris} ({b.kode || "tanpa kode"}): {b.galat.join(", ")}</li>
                  ))}
                  {baruKurang.slice(0, 30).map((b) => (
                    <li key={`k${b.baris}`}>
                      Baris {b.baris} ({b.kode}): gardu baru wajib punya ULP dan DAYA_KVA
                    </li>
                  ))}
                  {bermasalah.length + baruKurang.length > 60 && <li>…dan lainnya</li>}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button onClick={() => { setFase("pilih"); setBaca(null); }} className={BTN_GHOST}>
                Ganti Berkas
              </button>
              <button
                onClick={kirim}
                disabled={sah.length - baruKurang.length === 0}
                className={BTN_PRIMARY}
              >
                Impor {sah.length - baruKurang.length} baris
              </button>
            </div>
          </>
        )}

        {fase === "mengirim" && (
          <div className="py-8 flex flex-col items-center gap-2">
            <Loader2 size={22} className="animate-spin text-navy-600" />
            <p className="text-sm text-ink">Mengimpor… {progres} baris</p>
          </div>
        )}

        {fase === "selesai" && hasil && (
          <>
            {hasil.gagal === 0 ? (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
                <CheckCircle2 size={18} className="text-green-700 shrink-0 mt-0.5" />
                <div className="text-sm text-green-800">
                  <p className="font-semibold">Impor selesai</p>
                  <p className="text-xs mt-0.5">
                    {hasil.baru} gardu baru · {hasil.diperbarui} diperbarui
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                <AlertCircle size={18} className="text-red-700 shrink-0 mt-0.5" />
                <div className="text-sm text-red-800 min-w-0">
                  <p className="font-semibold">
                    {hasil.baru + hasil.diperbarui === 0
                      ? "Impor GAGAL — tidak ada data yang tersimpan"
                      : `Sebagian gagal: ${hasil.gagal} baris`}
                  </p>
                  {hasil.baru + hasil.diperbarui > 0 && (
                    <p className="text-xs mt-0.5">
                      {hasil.baru} gardu baru · {hasil.diperbarui} diperbarui
                    </p>
                  )}
                  {hasil.pesan && (
                    <p className="text-[11px] mt-1.5 font-mono bg-white/60 rounded px-2 py-1 break-words">
                      {hasil.pesan}
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              {hasil.gagal > 0 && (
                <button onClick={() => setFase("pratinjau")} className={BTN_GHOST}>Coba Lagi</button>
              )}
              <button onClick={onClose} className={BTN_PRIMARY}>Tutup</button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}

function Angka({ label, nilai, tone }: { label: string; nilai: number; tone?: "green" | "navy" | "merah" }) {
  const warna =
    tone === "green" ? "text-green-700" :
    tone === "navy"  ? "text-navy-600"  :
    tone === "merah" ? "text-red-600"   : "text-ink";
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-muted truncate">{label}</p>
      <p className={`text-lg font-bold ${warna}`}>{nilai}</p>
    </div>
  );
}
