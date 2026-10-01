"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity, ArrowLeft, Gauge, Loader2, PanelLeftOpen, RefreshCw, Tags, TriangleAlert } from "lucide-react";
import { BATAS_NAMA } from "./LapisanNama";
import { type CurrentUser, canSeeAllUnits } from "@/lib/roles";
import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import { usePetaDaftar, type Jaringan } from "../_hooks/usePetaDaftar";
import { usePetaIsi, ZOOM_GARDU, ZOOM_TIANG, type GarduPeta, type Kotak, type TiangPeta } from "../_hooks/usePetaIsi";
import { usePenandaJtm } from "../_hooks/usePenandaJtm";
import { useObjekPeta, type Terpilih } from "../_hooks/useObjekPeta";
import { useSuntingPeta } from "../_hooks/useSuntingPeta";
import { useSimulasiBuka } from "../_hooks/useSimulasiBuka";
import { useKesehatanPeta, type KesehatanGardu, type SaringKesehatan, type StatusKesehatan } from "../_hooks/useKesehatanPeta";
import PanelKesehatan from "./PanelKesehatan";
import { STATUS_UJUNG_PETA, useUjungPeta, type NadaUjung, type SaringUjung } from "../_hooks/useUjungPeta";
import { GARIS, PANEL } from "../_ui";
import PanelLapisan from "./PanelLapisan";
import PanelObjek from "./PanelObjek";
import PanelUjung from "./PanelUjung";

const PetaInner = dynamic(() => import("./PetaInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-[#0b1220] text-gray-500 text-sm gap-2">
      <Loader2 size={20} className="animate-spin" />
      Menyiapkan peta…
    </div>
  ),
});

/** Kotak batas apa pun yang bisa dilompati — penyulang, gardu, atau satu grup. */
/** Bulan berjalan menurut WITA (UTC+8). */
const bulanIni = () => {
  const w = new Date(Date.now() + 8 * 3600 * 1000);
  return { tahun: w.getUTCFullYear(), bulan: w.getUTCMonth() + 1 };
};

const SARING_AWAL: SaringUjung = {
  nada: new Set<NadaUjung>(["merah", "kuning", "hijau"]),
  status: new Set(STATUS_UJUNG_PETA),
  jauhDariUjung: null,
};

const SARING_KESEHATAN_AWAL: SaringKesehatan = {
  status: new Set<StatusKesehatan>(["merah", "kuning", "hijau"]),
  hanyaSisip: false,
  hanyaJurusan160: false,
};

const TOMBOL_ATAS =
  "h-9 px-3 rounded-xl text-[#e2e8f0] text-sm font-medium backdrop-blur-sm flex items-center gap-2 border hover:bg-white/5";

interface Batas {
  latMin: number | null;
  latMaks: number | null;
  lngMin: number | null;
  lngMaks: number | null;
}

export default function PetaJaringan({ user }: { user: CurrentUser }) {
  const [ulp, setUlp] = useState(canSeeAllUnits(user.role) ? "" : (user.unit ?? ""));
  const [nyala, setNyala] = useState<Set<string>>(new Set());
  // Padam saat halaman dibuka, sama seperti lapisan lain. Peta ini berangkat
  // kosong dengan sengaja — yang muncul di layar adalah yang DIMINTA, bukan
  // yang kebetulan tersedia. Saklar yang menyala sendiri membuat 2.092 gardu
  // jadi latar tetap yang harus dimatikan lebih dulu tiap kali orang ingin
  // melihat satu penyulang dengan tenang.
  const [tampilGardu, setTampilGardu] = useState(false);
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const [fokus, setFokus] = useState<[[number, number], [number, number]] | null>(null);
  const [panel, setPanel] = useState(true);

  const { perFolder, semuaLapisan, loading, error, muat: muatDaftar } = usePetaDaftar(ulp || null);
  const penanda = usePenandaJtm();

  const pilihan = useMemo(
    () =>
      [...nyala].map((k) => {
        const [jaringan, ...sisa] = k.split(":");
        return { jaringan: jaringan as Jaringan, kode: sisa.join(":") };
      }),
    [nyala],
  );

  const { rute, tiang, gardu, sibuk, terpotong, muatUlang: muatUlangPeta } = usePetaIsi(kotak, pilihan, tampilGardu);

  // ── Tahap 2: pilih, sunting, tegangan ujung ────────────────────────────────
  const oleh = user.name ?? user.email ?? "";
  // Penjaga hak ULP ada di database; ini hanya menyembunyikan tombol.
  const boleh = user.role === "UP3" || user.role === "admin";
  const [terpilih, setTerpilih] = useState<Terpilih | null>(null);
  const [geser, setGeser] = useState<{ lat: number; lng: number } | null>(null);
  const [modeInduk, setModeInduk] = useState(false);
  const [calonInduk, setCalonInduk] = useState<TiangPeta | null>(null);
  /** Ganti induk JTR wajib beralasan — diisi di panel, dipakai saat tiang diklik. */
  const [alasanInduk, setAlasanInduk] = useState("");
  const objek = useObjekPeta(terpilih);
  const sunting = useSuntingPeta(oleh);
  const simulasi = useSimulasiBuka();

  const jalankanSimulasi = async () => {
    if (terpilih?.jenis !== "tiang") return;
    const h = await simulasi.jalankan(terpilih.id);
    // Peta dibawa ke seluruh wilayah padam — hasilnya harus terlihat utuh.
    if (h?.batas && h.jumlah_tiang > 0) {
      setFokus([
        [h.batas[0], h.batas[1]],
        [h.batas[2], h.batas[3]],
      ]);
    }
  };

  const [namaTiang, setNamaTiang] = useState(false);
  const [memuatUlang, setMemuatUlang] = useState(false);

  /** Muat ulang isi peta yang terlihat + daftar lapisan + rincian yang
   *  terbuka — tanpa memuat ulang halaman (pilihan lapisan & posisi tetap). */
  const muatUlangSemua = async () => {
    setMemuatUlang(true);
    objek.muatUlang();
    try {
      await Promise.all([muatDaftar(), muatUlangPeta()]);
    } finally {
      setMemuatUlang(false);
    }
  };

  const [ujungAktif, setUjungAktif] = useState(false);
  const [bulanUjung, setBulanUjung] = useState(bulanIni);
  const [saringUjung, setSaringUjung] = useState<SaringUjung>(SARING_AWAL);
  const ujung = useUjungPeta(ujungAktif, ulp, bulanUjung.tahun, bulanUjung.bulan, saringUjung);

  const [kesehatanAktif, setKesehatanAktif] = useState(false);
  const [saringKesehatan, setSaringKesehatan] = useState<SaringKesehatan>(SARING_KESEHATAN_AWAL);
  const kesehatan = useKesehatanPeta(kesehatanAktif, ulp, saringKesehatan);
  const pilihKesehatan = useCallback(
    (g: KesehatanGardu) => {
      if (geser || modeInduk) return;
      setTerpilih({ jenis: "gardu", kode: g.kode, ulp: g.ulp, lat: g.lat, lng: g.lng });
    },
    [geser, modeInduk],
  );

  const segarkan = () => {
    objek.muatUlang();
    void muatUlangPeta();
  };

  // Stabil — `Isi` di peta di-memo, dan ribuan objeknya tidak boleh digambar
  // ulang hanya karena panel berubah.
  const pilihTiang = useCallback(
    (t: TiangPeta) => {
      if (geser) return;
      if (modeInduk) {
        if (terpilih?.jenis !== "tiang" || t.id === terpilih.id) return;
        // Induk JTR harus tiang JTR gardu yang sama.
        if (terpilih.jaringan === "jtr" && (t.jaringan !== "jtr" || t.kelompok !== terpilih.kelompok)) return;
        setCalonInduk(t);
        return;
      }
      setTerpilih({ jenis: "tiang", id: t.id, kelompok: t.kelompok, lat: t.lat, lng: t.lng, kode: t.kode, jaringan: t.jaringan === "jtr" ? "jtr" : "jtm" });
    },
    [geser, modeInduk, terpilih],
  );
  const pilihGardu = useCallback(
    (g: GarduPeta) => {
      if (geser || modeInduk) return;
      setTerpilih({ jenis: "gardu", kode: g.kode, ulp: g.ulp, lat: g.lat, lng: g.lng });
    },
    [geser, modeInduk],
  );
  const aturGeser = useCallback((lat: number, lng: number) => setGeser({ lat, lng }), []);
  const tutupObjek = () => {
    simulasi.tutup();
    setTerpilih(null);
    setGeser(null);
    setModeInduk(false);
    setAlasanInduk("");
  };

  /** Koreksi JTR: semua per gardu yang sedang dipilih (`terpilih.kelompok`). */
  const koreksiJtr = async (fn: (id: string, gardu: string) => Promise<boolean>) => {
    if (terpilih?.jenis !== "tiang" || terpilih.jaringan !== "jtr") return false;
    const ok = await fn(terpilih.id, terpilih.kelompok);
    if (ok) segarkan();
    return ok;
  };
  const gantiIndukJtr = async (indukId: string | null) => {
    const ok = await koreksiJtr((id, g) => sunting.indukJtr(id, g, indukId, alasanInduk));
    if (ok) {
      setModeInduk(false);
      setAlasanInduk("");
    }
    return ok;
  };

  const simpanGeser = async (alasan: string) => {
    if (!terpilih || !geser) return false;
    const ok =
      terpilih.jenis === "tiang"
        ? await sunting.geserTiang(terpilih.id, geser.lat, geser.lng, alasan)
        : await sunting.geserGardu(terpilih.kode, terpilih.ulp, geser.lat, geser.lng, alasan);
    if (ok) {
      setTerpilih({ ...terpilih, lat: geser.lat, lng: geser.lng });
      setGeser(null);
      segarkan();
    }
    return ok;
  };

  const alih = useCallback((jaringan: Jaringan, kode: string) => {
    setNyala((s) => {
      const b = new Set(s);
      const k = `${jaringan}:${kode}`;
      if (b.has(k)) b.delete(k); else b.add(k);
      return b;
    });
  }, []);

  /** Menyalakan atau memadamkan satu penyulang penuh sekaligus. */
  const alihBanyak = useCallback((jaringan: Jaringan, kode: string[], nyalakan: boolean) => {
    setNyala((s) => {
      const b = new Set(s);
      for (const k of kode) {
        if (nyalakan) b.add(`${jaringan}:${k}`);
        else b.delete(`${jaringan}:${k}`);
      }
      return b;
    });
  }, []);

  const hanya = useCallback((jaringan: Jaringan, kode: string | string[]) => {
    const daftar = Array.isArray(kode) ? kode : [kode];
    setNyala(new Set(daftar.map((k) => `${jaringan}:${k}`)));
  }, []);

  const lompat = useCallback((b: Batas) => {
    if (b.latMin === null || b.latMaks === null || b.lngMin === null || b.lngMaks === null) return;
    setFokus([
      [b.latMin, b.lngMin],
      [b.latMaks, b.lngMaks],
    ]);
  }, []);

  const zoom = kotak?.zoom ?? 0;
  const jumlahObjek =
    rute.reduce((n, r) => n + r.bentang.length, 0) + tiang.length * 2 + gardu.length + ujung.titik.length * 2 + kesehatan.gardu.length;
  const adaGarduPilihan = pilihan.some((p) => p.jaringan === "gardu");
  const adaJaringan = pilihan.some((p) => p.jaringan !== "gardu");

  return (
    <div className="h-full flex">
      {panel ? (
        <PanelLapisan
          user={user}
          perFolder={perFolder}
          semuaLapisan={semuaLapisan}
          loading={loading}
          error={error}
          ulp={ulp}
          onUlp={(v) => { setUlp(v); setNyala(new Set()); }}
          nyala={nyala}
          onAlih={alih}
          onAlihBanyak={alihBanyak}
          onHanya={hanya}
          tampilGardu={tampilGardu}
          onTampilGardu={setTampilGardu}
          onLompat={lompat}
          onTutup={() => setPanel(false)}
        />
      ) : (
        <button
          onClick={() => setPanel(true)}
          className="absolute z-[1100] top-3 left-3 h-9 px-3 rounded-xl text-[#e2e8f0] text-sm font-medium shadow-lg flex items-center gap-2 border"
          style={{ background: PANEL, borderColor: GARIS }}
        >
          <PanelLeftOpen size={16} /> Lapisan
        </button>
      )}

      <div className="flex-1 min-w-0 relative">
        <PetaInner
          rute={rute} tiang={tiang} gardu={gardu}
          fokus={fokus} onKotak={setKotak} penanda={penanda}
          onPilihTiang={pilihTiang} onPilihGardu={pilihGardu}
          sorot={terpilih ? { lat: terpilih.lat, lng: terpilih.lng } : null}
          geser={geser} onGeser={aturGeser}
          ujung={ujung.titik} bolehSetujuiUjung={boleh} oleh={oleh}
          onUjungDisetujui={ujung.tandaiDisetujui}
          simulasi={simulasi.hasil}
          kesehatan={kesehatan.gardu}
          onPilihKesehatan={pilihKesehatan}
          namaTiang={namaTiang}
        />

        {terpilih && (
          <PanelObjek
            key={terpilih.jenis === "tiang" ? terpilih.id : `${terpilih.ulp}-${terpilih.kode}`}
            terpilih={terpilih}
            tiang={objek.tiang}
            gardu={objek.gardu}
            galat={objek.galat}
            pilihan={objek.pilihan}
            penanda={penanda}
            boleh={boleh}
            geser={geser}
            onMulaiGeser={() => setGeser({ lat: terpilih.lat, lng: terpilih.lng })}
            onBatalGeser={() => setGeser(null)}
            onSimpanGeser={simpanGeser}
            modeInduk={modeInduk}
            onGantiInduk={() => setModeInduk(true)}
            onBatalInduk={() => setModeInduk(false)}
            onUbahAtribut={async (isi) => {
              if (terpilih.jenis !== "tiang") return false;
              const ok = await sunting.ubahAtribut(terpilih.id, isi);
              if (ok) segarkan();
              return ok;
            }}
            onPercabangan={async (nyala) => {
              if (terpilih.jenis !== "tiang") return false;
              const ok = await sunting.tandaiPercabangan(terpilih.id, nyala);
              if (ok) segarkan();
              return ok;
            }}
            onBatalkan={async (alasan) => {
              if (terpilih.jenis !== "tiang") return false;
              const ok = await sunting.batalkan(terpilih.id, alasan);
              if (ok) {
                tutupObjek();
                void muatUlangPeta();
              }
              return ok;
            }}
            onTutup={tutupObjek}
            simulasi={simulasi.hasil}
            simulasiSibuk={simulasi.sibuk}
            onSimulasi={() => void jalankanSimulasi()}
            onTutupSimulasi={simulasi.tutup}
            alasanInduk={alasanInduk}
            onAlasanInduk={setAlasanInduk}
            onPangkalGardu={() => gantiIndukJtr(null)}
            onNamaJtr={async (kode) => {
              const ok = await koreksiJtr((id, g) => sunting.namaJtr(id, g, kode));
              if (ok && terpilih.jenis === "tiang") setTerpilih({ ...terpilih, kode: kode.trim().toUpperCase() });
              return ok;
            }}
            onKabelJtr={(lama, baru, jenis, ukuran, hilir) =>
              koreksiJtr((id, g) => sunting.kabelJtr(id, g, lama, baru, jenis, ukuran, hilir))}
            onJurusanJtr={(jurusan, hilir) => koreksiJtr((id, g) => sunting.jurusanJtr(id, g, jurusan, hilir))}
          />
        )}

        {!terpilih && (ujungAktif || kesehatanAktif) && (
          <div className="absolute z-[1050] top-14 right-3 bottom-3 flex flex-col gap-2 overflow-y-auto pointer-events-none [&>*]:pointer-events-auto">
            {kesehatanAktif && (
              <PanelKesehatan
                saring={saringKesehatan}
                onSaring={setSaringKesehatan}
                hitung={kesehatan.hitung}
                jumlah={kesehatan.gardu.length}
                sibuk={kesehatan.sibuk}
                galat={kesehatan.galat}
                onTutup={() => setKesehatanAktif(false)}
              />
            )}
            {ujungAktif && (
          <PanelUjung
            tahun={bulanUjung.tahun}
            bulan={bulanUjung.bulan}
            onBulan={(tahun, bulan) => setBulanUjung({ tahun, bulan })}
            saring={saringUjung}
            onSaring={setSaringUjung}
            jumlah={ujung.titik.length}
            total={ujung.total}
            sibuk={ujung.sibuk}
            galat={ujung.galat}
            onTutup={() => setUjungAktif(false)}
          />
            )}
          </div>
        )}

        {calonInduk && terpilih?.jenis === "tiang" && terpilih.jaringan === "jtr" && (
          <ConfirmDialog
            title={`Jadikan ${calonInduk.kode} induk ${terpilih.kode}?`}
            message={
              alasanInduk.trim()
                ? `Kabel JTR gardu ${terpilih.kelompok} di tiang ini akan menyambung dari ${calonInduk.kode}. Nama tiang tidak berubah otomatis — ganti namanya bila perlu.`
                : "Isi dulu alasannya di panel kanan."
            }
            confirmLabel="Ganti induk"
            onConfirm={async () => {
              const t = calonInduk;
              setCalonInduk(null);
              if (alasanInduk.trim()) await gantiIndukJtr(t.id);
            }}
            onClose={() => setCalonInduk(null)}
          />
        )}

        {calonInduk && terpilih?.jenis === "tiang" && terpilih.jaringan !== "jtr" && (
          <ConfirmDialog
            title={`Jadikan ${calonInduk.kode} induk ${terpilih.kode}?`}
            message="Jalur jaringan tiang ini akan menyambung dari tiang yang Anda klik. Nama tiang tidak berubah otomatis — kalau urutannya jadi janggal, nomori ulang penyulangnya dari tab Tiang di Inspeksi JTM."
            confirmLabel="Ganti induk"
            onConfirm={async () => {
              const t = calonInduk;
              setCalonInduk(null);
              const ok = await sunting.ubahInduk(terpilih.id, t.id);
              if (ok) {
                setModeInduk(false);
                segarkan();
              }
            }}
            onClose={() => setCalonInduk(null)}
          />
        )}

        {/* ── Bilah keadaan ──────────────────────────────────────────────────
            Penghitung objek berdiri di sini SEJAK AWAL, bukan ditambahkan
            kalau nanti terasa berat. Waktu peta melambat, yang pertama
            dibutuhkan adalah angka — bukan tebakan tentang lapisan mana yang
            bocor. */}
        <div className="absolute z-[1000] bottom-3 left-3 flex flex-wrap items-center gap-2 text-[11px] max-w-[calc(100%-1.5rem)]">
          <div
            className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm flex items-center gap-2 tabular-nums font-mono text-gray-300 border"
            style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
          >
            {sibuk && <Loader2 size={11} className="animate-spin text-[#5eead4]" />}
            <span>zoom {zoom}</span>
            <span className="text-gray-600">|</span>
            <span>{jumlahObjek.toLocaleString("id-ID")} objek</span>
            {tiang.length > 0 && <span className="text-gray-500">{tiang.length} tiang</span>}
            {gardu.length > 0 && <span className="text-gray-500">{gardu.length} gardu</span>}
          </div>

          {adaJaringan && zoom < ZOOM_TIANG && (
            <div
              className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm text-gray-400 border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Perbesar ke zoom {ZOOM_TIANG} untuk melihat tiang satu per satu
            </div>
          )}

          {!adaGarduPilihan && tampilGardu && zoom < ZOOM_GARDU && (
            <div
              className="rounded-lg px-2.5 py-1.5 backdrop-blur-sm text-gray-400 border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Perbesar untuk melihat gardu — atau centang penyulangnya di folder Gardu
            </div>
          )}

          {terpotong && (
            <div className="rounded-lg bg-amber-500/90 text-white px-2.5 py-1.5 flex items-center gap-1.5">
              <TriangleAlert size={12} />
              Terlalu banyak tiang di layar — sebagian tidak digambar
            </div>
          )}
          {namaTiang && tiang.length > BATAS_NAMA && (
            <div className="rounded-lg bg-[#0b1220]/85 text-[#e2e8f0] px-2.5 py-1.5 border" style={{ borderColor: GARIS }}>
              Nama tiang tampil setelah diperbesar ({tiang.length} tiang di layar, maks {BATAS_NAMA})
            </div>
          )}
        </div>

        <div className="absolute z-[1000] top-3 right-3 flex items-center gap-2">
          <button
            onClick={() => void muatUlangSemua()}
            disabled={memuatUlang}
            className={TOMBOL_ATAS}
            style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            title="Muat ulang isi peta sesudah menyunting — pilihan lapisan & posisi tetap"
          >
            <RefreshCw size={15} className={memuatUlang ? "animate-spin" : ""} /> Muat ulang
          </button>
          <button
            onClick={() => setNamaTiang((v) => !v)}
            className={`${TOMBOL_ATAS} ${namaTiang ? "ring-1 ring-[#00897B]" : ""}`}
            style={{ background: namaTiang ? "rgba(0,137,123,0.35)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
            title="Tulis nama tiap tiang di peta"
          >
            <Tags size={15} /> Nama tiang
          </button>
          <button
            onClick={() => setKesehatanAktif((v) => !v)}
            className={`${TOMBOL_ATAS} ${kesehatanAktif ? "ring-1 ring-[#00897B]" : ""}`}
            style={{ background: kesehatanAktif ? "rgba(0,137,123,0.35)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
            title="Warnai gardu menurut beban, jatuh tegangan, dan tegangan ujung"
          >
            <Activity size={15} /> Kesehatan gardu
          </button>
          <button
            onClick={() => setUjungAktif((v) => !v)}
            className={`${TOMBOL_ATAS} ${ujungAktif ? "ring-1 ring-[#00897B]" : ""}`}
            style={{ background: ujungAktif ? "rgba(0,137,123,0.35)" : "rgba(10,22,40,0.85)", borderColor: GARIS }}
            title="Tampilkan titik ukur tegangan ujung"
          >
            <Gauge size={15} /> Tegangan ujung
          </button>
          <Link href="/admin/dashboard" className={TOMBOL_ATAS} style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}>
            <ArrowLeft size={15} /> Kembali
          </Link>
        </div>

        {nyala.size === 0 && !loading && (
          <div className="absolute z-[1000] inset-x-0 top-1/2 -translate-y-1/2 grid place-items-center pointer-events-none px-4">
            <p
              className="rounded-xl text-gray-300 text-sm px-4 py-3 max-w-sm text-center leading-relaxed backdrop-blur-sm border"
              style={{ background: "rgba(10,22,40,0.85)", borderColor: GARIS }}
            >
              Pilih penyulang atau gardu di panel kiri — atau ketik namanya di kotak cari.
              <span className="block text-gray-500 text-xs mt-1">
                Peta sengaja dibuka kosong supaya tidak menarik puluhan ribu titik yang belum
                tentu Anda butuhkan.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
