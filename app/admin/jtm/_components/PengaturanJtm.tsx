"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { BTN_GHOST, CARD, EYEBROW, FIELD } from "@/app/admin/_ui";
import { useJtmRef, BENTUK, type Bentuk, type Kategori, type RefBaris } from "../_hooks/useJtmRef";
import { kodeTitik } from "@/lib/jenisTitikJtm";
import IsianJtm from "./IsianJtm";
import AmbangDtJtm from "./AmbangDtJtm";
import AmbangLapanganJtm from "./AmbangLapanganJtm";

const DAFTAR: { kategori: Kategori; judul: string; bantu: string; pakaiIkon: boolean }[] = [
  {
    kategori: "pangkal",
    judul: "Pangkal segmen",
    bantu:
      "Sumber jaringan seperti GI, PLTD, GH — boleh juga jadi ujung segmen. Ditulis berspasi di nama segmen (\"GH GOMONG\"). Kodenya satu kata tanpa spasi; yang dinonaktifkan hilang dari pilihan, tapi segmen lama tetap terbaca.",
    pakaiIkon: false,
  },
  {
    kategori: "penanda",
    judul: "Penanda tiang",
    bantu:
      "Tiang yang memikul gardu, LBS, atau recloser digambar berbeda di peta. Bentuk dan warnanya diatur di sini — menambah penanda baru tidak perlu mengunggah gambar apa pun.",
    pakaiIkon: true,
  },
  {
    kategori: "penghantar",
    judul: "Jenis penghantar",
    bantu: "Pilihan yang muncul saat membuat segmen.",
    pakaiIkon: false,
  },
  {
    kategori: "ukuran",
    judul: "Ukuran penghantar",
    bantu: "Dalam mm². Kodenya angka — itu yang tersimpan sebagai ukuran segmen.",
    pakaiIkon: false,
  },
];

/** Jenis titik yang sudah punya arti tetap — tidak boleh dipakai pangkal baru. */
const TITIK_TETAP = ["tiang", "gardu", "ujung", "akhir", "rec", "lbs", "peng", "pmt"];

/** Pratinjau bentuk, digambar sama persis dengan ikonnya di peta. */
export function Ikon({ bentuk, warna, ukuran = 16 }: { bentuk: Bentuk | null; warna: string | null; ukuran?: number }) {
  const w = warna ?? "#1D3573";
  const gaya: React.CSSProperties = { width: ukuran, height: ukuran, background: w, display: "inline-block" };
  if (bentuk === "bulat") gaya.borderRadius = "50%";
  if (bentuk === "belah") gaya.transform = "rotate(45deg)";
  if (bentuk === "segitiga") {
    return (
      <span
        style={{
          width: 0,
          height: 0,
          display: "inline-block",
          borderLeft: `${ukuran / 2}px solid transparent`,
          borderRight: `${ukuran / 2}px solid transparent`,
          borderBottom: `${ukuran}px solid ${w}`,
        }}
      />
    );
  }
  if (bentuk === "kotak" || !bentuk) gaya.borderRadius = 2;
  return <span style={gaya} />;
}

export default function PengaturanJtm() {
  const { per, loading, simpan, hapus } = useJtmRef();

  // Kode pangkal menjadi awalan nama segmen ("GH GOMONG") dan dibaca ulang
  // saat impor — jadi satu kata, dan tidak boleh sama dengan jenis titik lain.
  const periksaPangkal = (kode: string) => {
    const k = kode.trim().toLowerCase();
    if (!/^[a-z0-9]+$/.test(k)) return "Kode satu kata huruf/angka, tanpa spasi atau titik (mis. gh).";
    const terpakai = [...TITIK_TETAP, ...per("penanda").map((p) => kodeTitik(p.kode).toLowerCase())];
    if (terpakai.includes(k)) return `Kode "${k}" sudah dipakai jenis titik lain.`;
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2 text-ink-soft text-sm">
        <Loader2 size={18} className="animate-spin" /> Memuat pengaturan…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AmbangLapanganJtm />

      <div className={`${CARD} p-5`}>
        <p className={EYEBROW}>Pengaturan JTM</p>
        <p className="text-xs text-ink-soft mt-1 max-w-3xl">
          Isian formulir dan daftar di bawah ini <b>data, bukan kode</b>. Penghantar baru muncul tiap kali ada
          pembangunan, dan penanda menyusul tiap kali ada jenis peralatan baru — kalau daftarnya
          ditulis di kode, tiap tambahan berarti menunggu rilis.
        </p>
      </div>

      <IsianJtm />

      <AmbangDtJtm />

      {DAFTAR.map((d) => (
        <Bagian
          key={d.kategori}
          judul={d.judul}
          bantu={d.bantu}
          pakaiIkon={d.pakaiIkon}
          isi={per(d.kategori)}
          kategori={d.kategori}
          periksa={d.kategori === "pangkal" ? periksaPangkal : undefined}
          onSimpan={simpan}
          onHapus={hapus}
        />
      ))}
    </div>
  );
}

function Bagian({
  judul,
  bantu,
  pakaiIkon,
  isi,
  kategori,
  periksa,
  onSimpan,
  onHapus,
}: {
  judul: string;
  bantu: string;
  pakaiIkon: boolean;
  isi: RefBaris[];
  kategori: Kategori;
  /** Penjaga kode sebelum ditambahkan — pesan galat, atau null bila boleh. */
  periksa?: (kode: string) => string | null;
  onSimpan: (v: RefBaris) => Promise<boolean>;
  onHapus: (k: Kategori, kode: string) => Promise<boolean>;
}) {
  const [kode, setKode] = useState("");
  const [label, setLabel] = useState("");
  const [bentuk, setBentuk] = useState<Bentuk>("kotak");
  const [warna, setWarna] = useState("#1D3573");
  const [sibuk, setSibuk] = useState(false);
  const galatKode = kode.trim() && periksa ? periksa(kode) : null;

  const tambah = async () => {
    setSibuk(true);
    const urutan = isi.reduce((m, x) => Math.max(m, x.urutan), 0) + 10;
    const ok = await onSimpan({
      kategori,
      kode,
      label,
      bentuk: pakaiIkon ? bentuk : null,
      warna: pakaiIkon ? warna : null,
      urutan,
      aktif: true,
    });
    setSibuk(false);
    if (ok) {
      setKode("");
      setLabel("");
    }
  };

  return (
    <div className={`${CARD} p-5`}>
      <p className={EYEBROW}>{judul}</p>
      <p className="text-[11px] text-ink-muted mt-1 max-w-3xl">{bantu}</p>

      <div className="mt-3 space-y-1.5">
        {isi.map((b) => (
          <Baris key={b.kode} b={b} pakaiIkon={pakaiIkon} onSimpan={onSimpan} onHapus={onHapus} />
        ))}
        {isi.length === 0 && <p className="text-xs text-ink-muted py-2">Belum ada isinya.</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <input
          value={kode}
          onChange={(e) => setKode(e.target.value)}
          placeholder={kategori === "ukuran" ? "kode (185)" : kategori === "pangkal" ? "kode (gh)" : "kode (recloser)"}
          className={`${FIELD} font-mono w-[150px]`}
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={kategori === "ukuran" ? "Label (185 mm²)" : kategori === "pangkal" ? "Label (Gardu Hubung)" : "Label tampilan"}
          className={`${FIELD} w-[200px]`}
        />
        {pakaiIkon && (
          <>
            <select
              value={bentuk}
              onChange={(e) => setBentuk(e.target.value as Bentuk)}
              className={`${FIELD} w-[150px]`}
            >
              {BENTUK.map((x) => (
                <option key={x.kode} value={x.kode}>
                  {x.label}
                </option>
              ))}
            </select>
            <input
              type="color"
              value={warna}
              onChange={(e) => setWarna(e.target.value)}
              className="h-9 w-12 rounded-lg border border-line bg-white p-1"
              aria-label="Warna"
            />
            <Ikon bentuk={bentuk} warna={warna} />
          </>
        )}
        <button
          onClick={() => void tambah()}
          disabled={!kode.trim() || !label.trim() || !!galatKode || sibuk}
          className={BTN_GHOST}
        >
          <Plus size={15} /> Tambah
        </button>
        {galatKode && <p className="basis-full text-[11px] text-danger">{galatKode}</p>}
      </div>
    </div>
  );
}

function Baris({
  b,
  pakaiIkon,
  onSimpan,
  onHapus,
}: {
  b: RefBaris;
  pakaiIkon: boolean;
  onSimpan: (v: RefBaris) => Promise<boolean>;
  onHapus: (k: Kategori, kode: string) => Promise<boolean>;
}) {
  const [label, setLabel] = useState(b.label);
  const [urutan, setUrutan] = useState(String(b.urutan));

  const ubah = (patch: Partial<RefBaris>) =>
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
      <span className="font-mono text-[11px] text-ink-muted w-[130px] truncate" title={b.kode}>
        {b.kode}
      </span>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => label.trim() && label !== b.label && ubah({})}
        className={`${FIELD} w-[200px]`}
        aria-label="Label"
      />

      {pakaiIkon && (
        <>
          <select
            value={b.bentuk ?? "kotak"}
            onChange={(e) => ubah({ bentuk: e.target.value as Bentuk })}
            className={`${FIELD} w-[150px]`}
          >
            {BENTUK.map((x) => (
              <option key={x.kode} value={x.kode}>
                {x.label}
              </option>
            ))}
          </select>
          <input
            type="color"
            value={b.warna ?? "#1D3573"}
            onChange={(e) => ubah({ warna: e.target.value })}
            className="h-9 w-12 rounded-lg border border-line bg-white p-1"
            aria-label="Warna"
          />
          <Ikon bentuk={b.bentuk} warna={b.warna} />
        </>
      )}

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
