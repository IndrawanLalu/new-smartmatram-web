"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, PanelLeftOpen } from "lucide-react";
import type { CurrentUser } from "@/lib/roles";
import { useMilikPenanda } from "@/lib/milikPenanda";
import { bingkaiBatas, bingkaiSekitar, bingkaiTitik, DEKAT, type Bingkai } from "../_lib/bingkai";
import { useLapisanNyala, type AwalPeta } from "../_hooks/useLapisanNyala";
import { useLatarPeta } from "../_hooks/useLatarPeta";
import { useModeSld } from "../_hooks/useModeSld";
import { usePetaDaftar } from "../_hooks/usePetaDaftar";
import { usePetaIsi, type Kotak } from "../_hooks/usePetaIsi";
import { usePenandaJtm } from "../_hooks/usePenandaJtm";
import { useObjekPeta } from "../_hooks/useObjekPeta";
import { usePilihObjek } from "../_hooks/usePilihObjek";
import { useSuntingPeta } from "../_hooks/useSuntingPeta";
import { useGeserBanyak } from "../_hooks/useGeserBanyak";
import { useKoreksiIsian } from "../_hooks/useKoreksiIsian";
import { useTulisIsian } from "../_hooks/useTulisIsian";
import { useIndukLoncat } from "../_hooks/useIndukLoncat";
import { useGarduJanggal } from "../_hooks/useGarduJanggal";
import { useSimulasiBuka } from "../_hooks/useSimulasiBuka";
import { useAntreanPeta } from "../_hooks/useAntreanPeta";
import { useCariLokasi } from "../_hooks/useCariLokasi";
import { useRencanaPeta } from "../_hooks/useRencanaPeta";
import { useLapisanKesehatan, useLapisanPohon, useLapisanUjung } from "../_hooks/useLapisanTambahan";
import { useRincianPenyulang } from "../_hooks/useRincianPenyulang";
import { useSegmenPeta } from "../_hooks/useSegmenPeta";
import { useTiangMilik } from "../_hooks/useTiangMilik";
import { GARIS, PANEL } from "../_ui";
import BilahAtas from "./BilahAtas";
import BilahAtasSld from "./BilahAtasSld";
import BilahKeadaan from "./BilahKeadaan";
import CariLokasi from "./CariLokasi";
import LegendaIsian from "./LegendaIsian";
import ObjekTerpilih from "./ObjekTerpilih";
import PanelGarduJanggal from "./PanelGarduJanggal";
import PanelGeserBanyak from "./PanelGeserBanyak";
import PanelKanan from "./PanelKanan";
import PanelRencana from "./PanelRencana";
import PanelKoreksiIsian from "./PanelKoreksiIsian";
import PanelLapisan from "./PanelLapisan";
import PanelSld from "./PanelSld";
import PilihLatar from "./PilihLatar";
import PenelusurPeta from "./PenelusurPeta";
import PersetujuanJtmPeta from "./PersetujuanJtmPeta";
import RincianPenyulang from "./RincianPenyulang";
import RincianSegmen from "./RincianSegmen";
import { GAYA_PADAM } from "./TombolAtas";
import TugaskanPohonPeta from "./TugaskanPohonPeta";

/**
 * Peta Jaringan — perakit. Keadaan tiap urusan tinggal di hook-nya sendiri
 * (`_hooks/useLapisanNyala`, `usePilihObjek`, `useAntreanPeta`,
 * `useLapisanTambahan`, `useTulisIsian`), dan tiap bagian layar di
 * komponennya (BilahAtas, BilahKeadaan, ObjekTerpilih, PanelKanan,
 * PenelusurPeta). Di sini hanya: menyambungkan, dan memutuskan apa yang
 * tampil bersamaan.
 *
 * Mode SLD (`useModeSld`): peta hanya menggambar garis ringkas, pangkal,
 * keypoint, gardu. Lapisan & alat mode biasa DISEMBUNYIKAN, bukan dipadamkan —
 * keluar dari Mode SLD memunculkan lagi semuanya seperti tadi.
 */

const PetaInner = dynamic(() => import("./PetaInner"), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full grid place-items-center bg-[#0b1220] text-gray-500 text-sm gap-2">
      <Loader2 size={20} className="animate-spin" />
      Menyiapkan peta…
    </div>
  ),
});

/** Lapisan yang disembunyikan selama "Segmen ini saja" — satu larik tetap,
 *  supaya peta tidak menggambar ulang lapisan kosong di tiap render. */
const TANPA: never[] = [];

export default function PetaJaringan({ user, awal }: { user: CurrentUser; awal?: AwalPeta }) {
  const lapisan = useLapisanNyala(user, awal);
  const { ulp, nyala, pilihan, nyalakan } = lapisan;
  // Padam saat halaman dibuka, sama seperti lapisan lain. Peta ini berangkat
  // kosong dengan sengaja — yang muncul di layar adalah yang DIMINTA, bukan
  // yang kebetulan tersedia. Saklar yang menyala sendiri membuat 2.092 gardu
  // jadi latar tetap yang harus dimatikan lebih dulu tiap kali orang ingin
  // melihat satu penyulang dengan tenang.
  const [tampilGardu, setTampilGardu] = useState(false);
  const [kotak, setKotak] = useState<Kotak | null>(null);
  const [fokus, setFokus] = useState<Bingkai | null>(null);
  const [panel, setPanel] = useState(true);

  const { daftar, perFolder, semuaLapisan, loading, error, muat: muatDaftar } = usePetaDaftar(ulp || null);
  const sld = useModeSld({ ulp, nyala, awal: awal?.sld, daftarJtm: perFolder.jtm });
  const modeSld = sld.aktif;
  const [latar, setLatar] = useLatarPeta(modeSld ? "sld" : "biasa");
  const penanda = usePenandaJtm();
  // Mode SLD tidak menarik tiang sama sekali — SLD punya datanya sendiri.
  // Gardu titik tegangan ujung ikut digambar lewat lapisan Gardu yang sama —
  // garis putus-putus lapisan ujung berpangkal di gardunya. "Tampilkan JTR"
  // menambah lapisan JTR gardu itu, hanya yang memang punya tiang JTR.
  const ujung = useLapisanUjung(ulp);
  const pilihanIsi = useMemo(() => {
    if (ujung.titik.length === 0) return pilihan;
    const ada = new Set(pilihan.map((p) => `${p.jaringan}:${p.kode}`));
    const punyaJtr = new Map(
      daftar.filter((d) => d.jaringan === "gardu" && d.jumlahTiang > 0).map((d) => [d.kode.toUpperCase(), d.kode]),
    );
    const tambahan: typeof pilihan = [];
    for (const kode of new Set(ujung.titik.map((t) => t.gardu_kode))) {
      const jtr = ujung.tampilJtr ? punyaJtr.get(kode.toUpperCase()) : undefined;
      if (jtr && !ada.has(`jtr:${jtr}`)) tambahan.push({ jaringan: "jtr", kode: jtr });
      else if (!ada.has(`gardu:${kode}`)) tambahan.push({ jaringan: "gardu", kode });
    }
    return [...pilihan, ...tambahan];
  }, [pilihan, daftar, ujung.titik, ujung.tampilJtr]);
  const { rute, tiang, gardu, sibuk, terpotong, muatUlang: muatUlangPeta } =
    usePetaIsi(kotak, modeSld ? TANPA : pilihanIsi, modeSld ? false : tampilGardu);
  const indukLoncat = useIndukLoncat();
  // Gardu & peralatan di tiang yang dipakai beberapa penyulang hanya digambar di
  // lapisan pemiliknya; titik pertemuan & yang belum dipilih di semua (10 Okt 2026).
  const milikPenanda = useMilikPenanda();

  // ── Pilih & sunting ────────────────────────────────────────────────────────
  const oleh = user.name ?? user.email ?? "";
  // Penjaga hak ULP ada di database; ini hanya menyembunyikan tombol.
  const boleh = user.role === "UP3" || user.role === "admin";
  const sunting = useSuntingPeta(oleh);
  const geserBanyak = useGeserBanyak(oleh);
  const koreksi = useKoreksiIsian(oleh);
  // Gardu janggal: kode gardu di tiang vs master gardu (kelompok Gardu, 10 Okt 2026).
  const garduJanggal = useGarduJanggal(ulp, oleh);
  const simulasi = useSimulasiBuka();
  const pilih = usePilihObjek({ geserBanyak, koreksi, onTutup: simulasi.tutup });
  const { terpilih, setTerpilih } = pilih;
  const objek = useObjekPeta(terpilih);
  const isian = useTulisIsian(koreksi, tiang);

  // ── "Segmen ini saja" (12 Okt 2026) ────────────────────────────────────────
  // Dari pohon segmen di folder JTM, atau otomatis selama satu inspeksi JTM
  // dibuka persetujuannya. Selama aktif peta HANYA menggambar segmen itu —
  // lapisan lain disembunyikan (pilihan user), bukan dipadamkan: kembali ke
  // semua jaringan memunculkan lagi pilihan lapisan yang tadi.
  const [segmenTampil, setSegmenTampil] = useState<string | null>(null);
  // Kartu penyulang (12 Okt 2026): klik nama penyulang JTM = gabungan semua
  // segmennya. Tertutup sendiri begitu penyulang itu tidak lagi menyala.
  const [kartuPenyulang, setKartuPenyulang] = useState<{ kode: string; ulp: string } | null>(null);
  const rincianPenyulang = useRincianPenyulang(kartuPenyulang);

  const antrean = useAntreanPeta({
    ulp, boleh, nyalakan, setFokus, setTerpilih, setSegmenTampil, terpilih, semuaLapisan, awalJtr: awal?.jtr,
  });
  const { jtr, jtm, portal } = antrean;

  const segmenId = jtm.buka ? jtm.buka.segmen_id : segmenTampil;
  const segmenPeta = useSegmenPeta(segmenId);
  const satuSegmen = segmenId !== null;
  // Persetujuan membingkai peta sendiri (sorot tiang, termasuk tiang dinilai
  // di luar anggota segmen); pohon segmen dibingkai di sini.
  const batasSegmen = segmenPeta.batas;
  const bukaJtm = jtm.buka;
  useEffect(() => {
    if (batasSegmen && !bukaJtm) setFokus(batasSegmen);
  }, [batasSegmen, bukaJtm]);

  const { tiangPeta, tandaMilik } = useTiangMilik(satuSegmen ? segmenPeta.tiang : tiang, milikPenanda.milik);

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
  // Nomor kabel JTR di tiap tiang — yang paling sering dicek admin (1/2/3).
  const [nomorKabel, setNomorKabel] = useState(false);

  const segarkan = () => {
    objek.muatUlang();
    isian.peta.muatUlang();
    indukLoncat.muatUlang();
    milikPenanda.muatUlang();
    garduJanggal.muatUlang();
    void muatUlangPeta();
  };

  const [memuatUlang, setMemuatUlang] = useState(false);
  /** Muat ulang isi peta yang terlihat + daftar lapisan + rincian yang
   *  terbuka — tanpa memuat ulang halaman (pilihan lapisan & posisi tetap). */
  const muatUlangSemua = async () => {
    setMemuatUlang(true);
    if (modeSld) {
      try {
        await Promise.all([muatDaftar(), sld.muatUlang()]);
      } finally {
        setMemuatUlang(false);
      }
      return;
    }
    objek.muatUlang();
    isian.peta.muatUlang();
    try {
      jtr.muatUlang();
      jtm.muatUlang();
      indukLoncat.muatUlang();
      milikPenanda.muatUlang();
      garduJanggal.muatUlang();
      await Promise.all([muatDaftar(), muatUlangPeta()]);
    } finally {
      setMemuatUlang(false);
    }
  };

  const kesehatan = useLapisanKesehatan(ulp);
  const pohon = useLapisanPohon(ulp, nyala);
  // Dibuka dari WO Perabasan (/peta?pohon=1): semua penyulang pohon menyala
  // SEKALI begitu daftarnya terbaca — sesudah itu pilihan sepenuhnya milik pengguna.
  const [pohonAwalDipasang, setPohonAwalDipasang] = useState(!awal?.pohon);
  if (!pohonAwalDipasang && pohon.daftar.length > 0) {
    setPohonAwalDipasang(true);
    lapisan.tambah(pohon.daftar.map((l) => `pohon:${l.kode}`));
  }

  const lompat = useCallback((b: Parameters<typeof bingkaiBatas>[0]) => {
    const x = bingkaiBatas(b);
    if (x) setFokus(x);
  }, []);
  const lompatDekat = (lat: number, lng: number) => setFokus(bingkaiSekitar(lat, lng, DEKAT));

  // ── Cari lokasi/koordinat (20 Okt 2026) ────────────────────────────────────
  // Peta dibingkai ke titik + semua objek terdekatnya. Klik hasil = nyalakan
  // lapisannya lalu buka objeknya, seperti mengklik di peta.
  const cari = useCariLokasi();
  const { titik: titikCari, hasil: hasilCari } = cari;
  useEffect(() => {
    if (!titikCari) return;
    const semua = hasilCari ? [titikCari, ...hasilCari.jtm, ...hasilCari.gardu, ...hasilCari.jtr] : [titikCari];
    setFokus(bingkaiTitik(semua, 0.0004));
  }, [titikCari, hasilCari]);
  // ── Rencana perbaikan JTR (dari Analisis JTR) ─────────────────────────────
  // Peta dibingkai ke seluruh jurusan itu begitu rencananya selesai dihitung.
  const rencana = useRencanaPeta(awal?.rencana ?? null);
  const semuaRencana = rencana.bingkai;
  useEffect(() => {
    if (semuaRencana?.length) setFokus(bingkaiTitik(semuaRencana, 0.0004));
  }, [semuaRencana]);

  const bukaHasil = (kunci: string, t: NonNullable<typeof terpilih>) => {
    setSegmenTampil(null);
    nyalakan(kunci);
    setTerpilih(t);
    lompatDekat(t.lat, t.lng);
  };

  const zoom = kotak?.zoom ?? 0;
  const jumlahObjek =
    rute.reduce((n, r) => n + r.bentang.length, 0) + tiang.length * 2 + gardu.length + ujung.titik.length * 2 + kesehatan.gardu.length
    + pohon.temuan.length + pohon.dirabas.length + pohon.cek.length;
  /** Panel rincian (segmen / penyulang) hanya saat tidak ada yang lebih mendesak. */
  const bebas = !jtm.buka && !terpilih && !geserBanyak.aktif;
  /** Lapisan di atas jaringan yang disembunyikan: "Segmen ini saja" & Mode SLD. */
  const sembunyi = satuSegmen || modeSld;
  const masukSld = () => {
    pilih.tutup();
    sld.alih(true);
  };

  return (
    <div className="h-full flex">
      {panel ? (
        <PanelLapisan
          user={user}
          perFolder={perFolder}
          pohon={pohon.daftar}
          saringPohon={pohon.saring}
          onSaringPohon={pohon.setSaring}
          perSumberPohon={pohon.perSumber}
          semuaLapisan={[...semuaLapisan, ...pohon.daftar]}
          loading={loading}
          error={error}
          ulp={ulp}
          onUlp={(v) => { lapisan.gantiUlp(v); setSegmenTampil(null); }}
          nyala={nyala}
          onAlih={lapisan.alih}
          onAlihBanyak={lapisan.alihBanyak}
          onHanya={lapisan.hanya}
          tampilGardu={tampilGardu}
          onTampilGardu={setTampilGardu}
          onLompat={lompat}
          onTutup={() => setPanel(false)}
          segmenAktif={segmenId}
          onSegmen={(x) => { jtm.setBuka(null); setTerpilih(null); setKartuPenyulang(null); setSegmenTampil(x.id); }}
          onPenyulang={(l) => { jtm.setBuka(null); setTerpilih(null); setSegmenTampil(null); setKartuPenyulang({ kode: l.kode, ulp: l.ulp }); }}
          sld={modeSld ? { keterangan: sld.keterangan } : undefined}
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
          rute={satuSegmen ? TANPA : rute} tiang={tiangPeta} gardu={satuSegmen ? TANPA : gardu}
          fokus={fokus} onKotak={setKotak} penanda={penanda}
          onPilihTiang={pilih.pilihTiang} onPilihGardu={pilih.pilihGardu}
          sorot={terpilih ? { lat: terpilih.lat, lng: terpilih.lng } : null}
          geser={pilih.geser} onGeser={pilih.aturGeser}
          geserBanyak={modeSld ? TANPA : geserBanyak.daftar} onSeretBanyak={geserBanyak.seret}
          ujung={sembunyi ? TANPA : ujung.titik} bolehSetujuiUjung={boleh} oleh={oleh}
          onUjungDisetujui={ujung.tandaiDisetujui}
          sorotUjung={ujung.periksa}
          pohonTemuan={sembunyi ? TANPA : pohon.temuan}
          pohonDirabas={sembunyi ? TANPA : pohon.dirabas}
          pohonCek={sembunyi ? TANPA : pohon.cek}
          onTugaskanPohon={boleh ? (t) => pohon.setTugas([t]) : undefined}
          simulasi={modeSld ? null : simulasi.hasil}
          kesehatan={sembunyi ? TANPA : kesehatan.gardu}
          onPilihKesehatan={pilih.pilihKesehatan}
          namaTiang={namaTiang}
          nomorKabel={nomorKabel}
          antrean={jtr.aktif && !sembunyi ? jtr.antrean : null}
          onPilihAntrean={jtr.pilih}
          sorotPerubahan={sembunyi ? null : (jtr.sorotBanding?.tiang ?? null)}
          sorotJtm={modeSld ? null : jtm.sorot}
          sorotKoreksi={sembunyi ? TANPA : garduJanggal.aktif ? garduJanggal.sorot : koreksi.sorot}
          isian={isian.tampil && !sembunyi ? { nilaiDi: isian.peta.nilaiDi, warna: isian.peta.warna } : null}
          loncat={indukLoncat.loncat}
          tandaMilik={tandaMilik}
          latar={latar}
          sld={modeSld ? { graf: sld.graf, warna: sld.warna, gardu: sld.gardu, label: sld.label } : null}
          cari={modeSld ? { titik: null, hasil: null } : { titik: titikCari, hasil: hasilCari }}
          rencana={sembunyi ? null : rencana}
        />

        <PilihLatar latar={latar} onLatar={setLatar} />

        {modeSld ? (
          <>
            <PanelSld graf={sld.graf} memuat={sld.memuat} ringkas={sld.ringkas} warna={sld.warna} gardu={sld.gardu} penanda={penanda} />
            <BilahAtasSld
              onKeluar={() => sld.alih(false)}
              label={sld.label}
              onLabel={sld.alihLabel}
              memuatUlang={memuatUlang}
              onMuatUlang={() => void muatUlangSemua()}
            />
          </>
        ) : (
          <>
        {isian.tampil && <LegendaIsian nama={isian.nama} legenda={isian.peta.legenda} />}

        {garduJanggal.aktif && (
          <PanelGarduJanggal
            g={garduJanggal}
            boleh={boleh}
            onLompat={lompatDekat}
            onBuka={(r) => {
              garduJanggal.setAktif(false);
              setTerpilih({ jenis: "tiang", id: r.tiang_id, kelompok: r.penyulang_tiang ?? "", lat: r.lat, lng: r.lng, kode: r.tiang_kode, jaringan: "jtm" });
              lompatDekat(r.lat, r.lng);
            }}
          />
        )}

        {koreksi.aktif && (
          <PanelKoreksiIsian
            k={koreksi}
            ulp={ulp || null}
            onLompat={lompatDekat}
            tampil={isian.tampil}
            onTampil={(v) => isian.setTulis(v ? "ukuran_konduktor" : null)}
          />
        )}

        {geserBanyak.aktif && (
          <PanelGeserBanyak
            daftar={geserBanyak.daftar}
            jumlahTergeser={geserBanyak.tergeser.length}
            onBuang={geserBanyak.buang}
            onKeluar={geserBanyak.keluar}
            onSimpan={async (alasan) => {
              const ok = await geserBanyak.simpan(alasan);
              if (ok) void muatUlangPeta();
              return ok;
            }}
          />
        )}

        {jtm.buka && !terpilih && !geserBanyak.aktif && (
          <PersetujuanJtmPeta
            key={jtm.buka.id}
            d={jtm.buka}
            oleh={oleh}
            onTutup={() => jtm.setBuka(null)}
            onDiputuskan={() => {
              jtm.setBuka(null);
              jtm.muatUlang();
              segarkan();
            }}
            onSorot={jtm.sorotSegmen}
            segmen={segmenPeta}
          />
        )}

        {segmenTampil && bebas && <RincianSegmen s={segmenPeta} onSemua={() => setSegmenTampil(null)} />}

        {kartuPenyulang && nyala.has(`jtm:${kartuPenyulang.kode}`) && !segmenTampil && bebas && (
          <RincianPenyulang p={rincianPenyulang} onTutup={() => setKartuPenyulang(null)} />
        )}

        <ObjekTerpilih
          p={pilih}
          objek={objek}
          sunting={sunting}
          penanda={penanda}
          boleh={boleh}
          oleh={oleh}
          tampilPanel={!geserBanyak.aktif}
          segarkan={segarkan}
          muatUlangPeta={() => void muatUlangPeta()}
          onPortalBerubah={portal.muatUlang}
          milik={milikPenanda.milik}
          simulasi={simulasi}
          onSimulasi={() => void jalankanSimulasi()}
          inspeksiJtr={jtr.inspeksiTerpilih}
          onDiputuskanJtr={() => {
            jtr.muatUlang();
            jtr.setSorotBanding(null);
            segarkan();
          }}
          onSorotBanding={jtr.setSorotBanding}
        />

        {!terpilih && !geserBanyak.aktif && (
          <PanelKanan
            kesehatan={kesehatan}
            pohon={pohon}
            pohonAktif={lapisan.pohonAktif}
            onTutupPohon={lapisan.padamkanPohon}
            ujung={ujung}
            boleh={boleh}
            oleh={oleh}
            onFokus={setFokus}
            atas={rencana.aktif ? <PanelRencana s={rencana} /> : null}
          />
        )}

        {pohon.tugas && (
          <TugaskanPohonPeta daftar={pohon.tugas} oleh={oleh} onTutup={() => pohon.setTugas(null)} onSelesai={pohon.muatUlang} />
        )}

        <PenelusurPeta antrean={antrean} />

        <CariLokasi
          c={cari}
          onJtm={(x) => bukaHasil(`jtm:${x.penyulang}`, { jenis: "tiang", id: x.tiang_id, kelompok: x.penyulang, lat: x.lat, lng: x.lng, kode: x.kode, jaringan: "jtm" })}
          onGardu={(x) => bukaHasil(`gardu:${x.kode}`, { jenis: "gardu", kode: x.kode, ulp: x.ulp, lat: x.lat, lng: x.lng })}
          onJtr={(x) => bukaHasil(`jtr:${x.gardu_kode}`, { jenis: "tiang", id: x.tiang_id, kelompok: x.gardu_kode, lat: x.lat, lng: x.lng, kode: x.kode, jaringan: "jtr" })}
        />

        <BilahAtas
          boleh={boleh}
          bolehSetujui={boleh}
          antrean={antrean}
          koreksi={koreksi}
          garduJanggal={garduJanggal}
          isian={isian}
          kesehatan={kesehatan}
          ujung={ujung}
          geserBanyak={geserBanyak}
          nomorKabel={nomorKabel}
          onNomorKabel={() => setNomorKabel((v) => !v)}
          namaTiang={namaTiang}
          onNamaTiang={() => setNamaTiang((v) => !v)}
          memuatUlang={memuatUlang}
          onMuatUlang={() => void muatUlangSemua()}
          tutupObjek={pilih.tutup}
          onModeSld={masukSld}
        />
          </>
        )}

        <BilahKeadaan
          sibuk={modeSld ? sld.memuat.length > 0 : sibuk}
          zoom={zoom}
          jumlahObjek={modeSld ? sld.jumlahSimpul : jumlahObjek}
          jumlahTiang={tiangPeta.length}
          tiangDiLayar={tiang.length}
          jumlahGardu={gardu.length}
          sebutZoomTiang={lapisan.adaJaringan && !sembunyi}
          sebutZoomGardu={!modeSld && !lapisan.adaGarduPilihan && tampilGardu}
          terpotong={terpotong && !sembunyi}
          adaLabel={!modeSld && (namaTiang || nomorKabel || isian.tampil)}
        />

        {modeSld && sld.graf.length === 0 && sld.memuat.length === 0 && !loading && (
          <div className="absolute z-[1000] inset-x-0 top-1/2 -translate-y-1/2 grid place-items-center pointer-events-none px-4">
            <p
              className="rounded-xl text-gray-300 text-sm px-4 py-3 max-w-sm text-center leading-relaxed backdrop-blur-sm border"
              style={GAYA_PADAM}
            >
              Centang penyulang JTM di panel kiri.
              <span className="block text-gray-500 text-xs mt-1">
                SLD disusun dari tiang yang sudah dititik — hanya pangkal, keypoint, gardu, dan garis di antaranya.
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
