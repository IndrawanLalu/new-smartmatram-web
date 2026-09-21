"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useJtrRef, type KategoriJtr, type RefJtr } from "../_hooks/useJtrRef";
import { useJtrItem, type ItemJtr } from "../_hooks/useJtrItem";

/**
 * Daftar pilihan isian tiang JTR — data, bukan kode.
 *
 * Sebelum ini semuanya konstanta di aplikasi HP, sehingga menambah satu ukuran
 * kabel berarti menunggu rilis, dan yang menambahkannya harus orang yang
 * memegang repo — bukan orang yang tahu barangnya.
 */

const DAFTAR: { kategori: KategoriJtr; judul: string; bantu: string }[] = [
  {
    kategori: "jenis_tiang",
    judul: "Jenis tiang",
    bantu: "Bahan badan tiang. Semuanya sah berdiri — tidak ada yang temuan.",
  },
  {
    kategori: "ukuran_tiang",
    judul: "Tinggi tiang",
    bantu: "Dalam meter. Kodenya angka — itu yang tersimpan sebagai tinggi tiang.",
  },
  {
    kategori: "kondisi_tiang",
    judul: "Kondisi tiang",
    bantu: "Yang ditandai temuan masuk ke rekap dan wajib difoto petugas.",
  },
  {
    kategori: "jenis_kabel",
    judul: "Jenis kabel",
    bantu: "Muncul di halaman Konduktor, satu per kabel yang lewat di tiang.",
  },
  {
    kategori: "ukuran_kabel",
    judul: "Ukuran kabel",
    bantu: "Penghantar mengecil menuju ujung jalur, jadi ukurannya dicatat per tiang.",
  },
  { kategori: "kondisi_kabel", judul: "Kondisi kabel", bantu: "Dinilai per kabel, bukan per tiang." },
  {
    kategori: "kondisi_aksesoris",
    judul: "Kondisi aksesoris",
    bantu:
      "Dipakai bersama oleh suspension, large angle, dan dead end. “Tidak Ada” bukan temuan — large angle memang cuma ada di tiang sudut.",
  },
  {
    kategori: "kondisi_andongan",
    judul: "Kondisi andongan",
    bantu: "Rendah dan kendor sama-sama menuntut penarikan ulang.",
  },
  {
    kategori: "kondisi_arde",
    judul: "Kondisi arde",
    bantu:
      "“Tidak Ada” bukan temuan — sebagian besar tiang JTR memang tanpa arde. Yang temuan adalah arde yang putus: itu pernah ada lalu rusak.",
  },
  {
    kategori: "jenis_stay",
    judul: "Jenis stay",
    bantu:
      "Bentuk penopang. Menjawab selain “Tidak Ada” memunculkan pertanyaan kondisinya di HP — tiang tanpa penopang tidak ditanyai.",
  },
  {
    kategori: "kondisi_stay",
    judul: "Kondisi stay",
    bantu:
      "Tiang lurus memang banyak yang tidak berskur, jadi “tidak ada” biasanya bukan temuan — tandai temuan hanya yang menuntut tindakan.",
  },
  { kategori: "jenis_jamperan", judul: "Jenis jamperan", bantu: "Jenis sambungannya, bukan jumlahnya." },
  { kategori: "kondisi_jamperan", judul: "Kondisi jamperan", bantu: "Dicatat hanya kalau jamperannya ada." },
  {
    kategori: "rawan_row",
    judul: "Penghalang ROW",
    bantu: "Tiap isian terhitung satu temuan tersendiri, supaya pohon dan bangunan bisa dihitung terpisah.",
  },
];

export default function PengaturanJtr() {
  const { per, loading, simpan, hapus } = useJtrRef();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat pengaturan…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Pengaturan JTR</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Daftar di bawah ini <b>data, bukan kode</b>. Ukuran kabel baru muncul tiap kali ada
          pembangunan, dan jenis penghalang ROW menyusul tiap kali ada yang belum terdaftar —
          kalau daftarnya ditulis di kode, tiap tambahan berarti menunggu rilis aplikasi.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
          Tanda <b>temuan</b> menentukan tiga hal sekaligus: jawaban itu masuk rekap temuan, HP
          meminta petugas memotret buktinya, dan halaman <i>Tiang Baik</i> memperingatkan kalau
          ia tanpa sengaja dijadikan jawaban bawaan. Satu tombol, dan seluruh sistem menurutinya.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
          Pilihan yang sudah tercatat di data tiang <b>tidak bisa dihapus</b> — nonaktifkan saja.
          Nonaktif menghilangkannya dari pilihan petugas tanpa membuat baris lama menyimpan nilai
          yang tidak ada lagi daftarnya.
        </p>
        <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
          Tulisan kecil di depan tiap baris adalah <b>kode</b> — itulah yang benar-benar tersimpan
          di data, dan dia tidak bisa diubah lagi sesudah dibuat. Mengganti labelnya saja hanya
          mengubah yang terlihat di layar. Kalau kodenya telanjur salah ketik dan belum terpakai,
          hapus barisnya lalu buat ulang.
        </p>
      </div>

      <Isian />

      {DAFTAR.map((d) => (
        <Bagian
          key={d.kategori}
          judul={d.judul}
          bantu={d.bantu}
          isi={per(d.kategori)}
          kategori={d.kategori}
          onSimpan={simpan}
          onHapus={hapus}
        />
      ))}
    </div>
  );
}

/**
 * Isian yang diperiksa petugas.
 *
 * Yang bisa diubah di sini cuma NAMA, urutan, dan hidup-matinya — bukan
 * daftarnya. Tiap isian berpasangan dengan satu kolom database, jadi menambah
 * isian berarti menambah kolom, dan itu tidak bisa dikerjakan dari halaman web.
 * Yang justru sering perlu adalah menyebutnya dengan istilah yang dipakai regu
 * setempat, dan itu tidak boleh menunggu rilis aplikasi.
 */
function Isian() {
  const { kelompokSemua, item, loading, setIsian } = useJtrItem();

  if (loading) return null;

  const namaIsian = (field: string) => item.find((i) => i.field === field)?.nama ?? field;

  return (
    <div className={`${CARD} p-5`}>
      <p className={EYEBROW}>Isian yang diperiksa</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">
        Nama di sini yang muncul di layar petugas — “Stay” boleh Anda ganti jadi “Penopang”
        tanpa rilis aplikasi. Isian yang dinonaktifkan berhenti ditanyakan, tapi data yang
        sudah tercatat tetap utuh.
      </p>
      <p className="text-[11px] text-ink-muted mt-2 max-w-3xl">
        Daftarnya sendiri <b>tidak bisa ditambah dari sini</b>: tiap isian berpasangan dengan
        satu kolom database, jadi isian yang benar-benar baru butuh perubahan di sisi program.
      </p>

      {kelompokSemua.map(([nama, daftar]) => (
        <div key={nama} className="mt-4">
          <p className="text-[11px] font-semibold text-ink-soft">{nama}</p>
          <div className="mt-2 space-y-1.5">
            {daftar.map((i) => (
              <BarisIsian key={i.field} i={i} namaIsian={namaIsian} onSimpan={setIsian} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BarisIsian({
  i,
  namaIsian,
  onSimpan,
}: {
  i: ItemJtr;
  namaIsian: (field: string) => string;
  onSimpan: (
    field: string,
    patch: { nama?: string; aktif?: boolean; urutan?: number },
  ) => Promise<boolean>;
}) {
  const [nama, setNama] = useState(i.nama);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${i.aktif ? "" : "opacity-55"}`}>
      <span className="font-mono text-[11px] text-ink-muted w-[140px] truncate" title={i.field}>
        {i.field}
      </span>
      <input
        value={nama}
        onChange={(e) => setNama(e.target.value)}
        onBlur={() => nama.trim() && nama !== i.nama && void onSimpan(i.field, { nama: nama.trim() })}
        className={`${FIELD} w-[220px]`}
        aria-label={`Nama isian ${i.field}`}
      />

      {/* Isian bersyarat perlu terlihat di sini: kalau tidak, admin yang
          mengosongkan bawaannya akan bingung kenapa petugas tidak pernah
          dimintai jawabannya. */}
      {i.syaratItem && (
        <span className="text-[11px] text-ink-muted">
          hanya kalau <b className="text-ink">{namaIsian(i.syaratItem)}</b>{" "}
          {i.syaratNegasi ? "bukan" : "="} {i.syaratNilai.join(" / ")}
        </span>
      )}

      <button
        onClick={() => void onSimpan(i.field, { aktif: !i.aktif })}
        className={`${BTN_GHOST} h-8 px-2.5 text-xs ml-auto`}
      >
        {i.aktif ? "Diperiksa" : "Dilewati"}
      </button>
    </div>
  );
}

function Bagian({
  judul,
  bantu,
  isi,
  kategori,
  onSimpan,
  onHapus,
}: {
  judul: string;
  bantu: string;
  isi: RefJtr[];
  kategori: KategoriJtr;
  onSimpan: (v: RefJtr) => Promise<boolean>;
  onHapus: (k: KategoriJtr, kode: string) => Promise<boolean>;
}) {
  const [kode, setKode] = useState("");
  const [sibuk, setSibuk] = useState(false);

  // Kode dan label JTR hampir selalu sama — yang tersimpan di kolom `tiang`
  // memang teks yang dibaca orang ("Baik", "Tidak Ada TUI"), bukan slug. Jadi
  // satu kotak isian saja, dan labelnya menyusul kodenya. Yang mau berbeda
  // tinggal menyunting labelnya di barisnya sendiri.
  const tambah = async () => {
    setSibuk(true);
    const urutan = isi.reduce((m, x) => Math.max(m, x.urutan), 0) + 10;
    const ok = await onSimpan({
      kategori,
      kode: kode.trim(),
      label: kode.trim(),
      normal: true,
      urutan,
      aktif: true,
    });
    setSibuk(false);
    if (ok) setKode("");
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className={EYEBROW}>{judul}</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">{bantu}</p>

      <div className="mt-3 space-y-1.5">
        {isi.map((b) => (
          <Baris key={b.kode} b={b} onSimpan={onSimpan} onHapus={onHapus} />
        ))}
        {isi.length === 0 && <p className="text-xs text-ink-muted py-2">Belum ada isinya.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input
          value={kode}
          onChange={(e) => setKode(e.target.value)}
          placeholder="Pilihan baru, ditulis apa adanya"
          className={`${FIELD} w-[260px]`}
        />
        <button onClick={() => void tambah()} disabled={!kode.trim() || sibuk} className={BTN_GHOST}>
          <Plus size={15} /> Tambah
        </button>
      </div>
    </div>
  );
}

function Baris({
  b,
  onSimpan,
  onHapus,
}: {
  b: RefJtr;
  onSimpan: (v: RefJtr) => Promise<boolean>;
  onHapus: (k: KategoriJtr, kode: string) => Promise<boolean>;
}) {
  const [label, setLabel] = useState(b.label);
  const [urutan, setUrutan] = useState(String(b.urutan));

  const ubah = (patch: Partial<RefJtr>) =>
    void onSimpan({ ...b, label, urutan: Number(urutan) || b.urutan, ...patch });

  return (
    <div className={`flex flex-wrap items-center gap-2 ${b.aktif ? "" : "opacity-55"}`}>
      <input
        value={urutan}
        onChange={(e) => setUrutan(e.target.value)}
        onBlur={() => Number(urutan) !== b.urutan && ubah({})}
        className={`${FIELD} w-[64px] text-center tabular-nums`}
        aria-label="Urutan"
      />
      {/* Kode ditampilkan tapi tidak bisa disunting: dia tersimpan di ratusan
          baris `tiang`, dan mengubahnya di sini akan memutus sambungannya
          dengan data lapangan tanpa ada yang memberi tahu. */}
      <span
        className={`font-mono text-[11px] w-[130px] truncate ${
          b.kode === b.label ? "text-ink-muted" : "text-amber-700 font-semibold"
        }`}
        title={
          b.kode === b.label
            ? b.kode
            : `Tersimpan di data sebagai "${b.kode}", bukan "${b.label}"`
        }
      >
        {b.kode}
      </span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== b.label && ubah({})}
        className={`${FIELD} w-[200px]`}
        aria-label="Label"
      />

      {/* Label boleh berbeda dari kodenya — "9" tampil "9 m" memang disengaja.
          Tapi kalau bedanya TIDAK disengaja, layar menampilkan yang benar
          sementara database menyimpan yang salah, dan tidak ada yang menyadari
          sampai ada yang membaca datanya mentah-mentah setahun kemudian. */}
      {b.kode !== b.label && (
        <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
          tersimpan sebagai “{b.kode}”
        </span>
      )}

      <button
        onClick={() => ubah({ normal: !b.normal })}
        className={`${BTN_GHOST} h-8 px-2.5 text-xs ${
          b.normal ? "" : "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-100"
        }`}
        title="Apakah jawaban ini sebuah temuan"
      >
        {b.normal ? "Normal" : "Temuan"}
      </button>

      <button onClick={() => ubah({ aktif: !b.aktif })} className={`${BTN_GHOST} h-8 px-2.5 text-xs`}>
        {b.aktif ? "Aktif" : "Nonaktif"}
      </button>

      <button
        onClick={() => {
          if (confirm(`Hapus "${b.label}"?`)) void onHapus(b.kategori, b.kode);
        }}
        className="text-ink-muted hover:text-danger p-1"
        title="Hapus — ditolak kalau masih dipakai"
        aria-label={`Hapus ${b.label}`}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
