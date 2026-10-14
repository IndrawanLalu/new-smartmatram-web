"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, ArrowLeft, ClipboardCheck, Columns2, Gauge, Hash, ListChecks, Move, RefreshCw, Ruler, Tags, TriangleAlert, Workflow } from "lucide-react";
import type { useAntreanPeta } from "../_hooks/useAntreanPeta";
import type { useGarduJanggal } from "../_hooks/useGarduJanggal";
import type { useKoreksiIsian } from "../_hooks/useKoreksiIsian";
import { TULIS_ISIAN, type useTulisIsian } from "../_hooks/useTulisIsian";
import MenuKelompok from "./MenuKelompok";
import TombolAtas, { GAYA_PADAM, TOMBOL_ATAS } from "./TombolAtas";

/**
 * Bilah alat di kanan atas peta: Mode SLD, tiga kelompok (JTM / JTR / Gardu)
 * yang meluncur keluar saat diklik — satu terbuka pada satu waktu — lalu Geser
 * titik, Nama tiang, Muat ulang, Kembali.
 */

type Menu = "jtm" | "jtr" | "gardu";

interface Saklar {
  aktif: boolean;
  setAktif: (v: boolean) => void;
}

interface Props {
  /** Admin ULP & UP3: alat sunting. */
  boleh: boolean;
  bolehSetujui: boolean;
  antrean: ReturnType<typeof useAntreanPeta>;
  koreksi: ReturnType<typeof useKoreksiIsian>;
  garduJanggal: ReturnType<typeof useGarduJanggal>;
  isian: ReturnType<typeof useTulisIsian>;
  kesehatan: Saklar;
  ujung: Saklar;
  geserBanyak: { aktif: boolean; mulai: () => void };
  nomorKabel: boolean;
  onNomorKabel: () => void;
  namaTiang: boolean;
  onNamaTiang: () => void;
  memuatUlang: boolean;
  onMuatUlang: () => void;
  /** Menutup panel benda sebelum mode yang memakai klik peta dinyalakan. */
  tutupObjek: () => void;
  onModeSld: () => void;
}

export default function BilahAtas({
  boleh, bolehSetujui, antrean, koreksi, garduJanggal, isian, kesehatan, ujung, geserBanyak,
  nomorKabel, onNomorKabel, namaTiang, onNamaTiang, memuatUlang, onMuatUlang, tutupObjek, onModeSld,
}: Props) {
  const [menuBuka, setMenuBuka] = useState<Menu | null>(null);
  const bukaMenu = (m: Menu) => setMenuBuka((x) => (x === m ? null : m));
  const { jtr, jtm, portal } = antrean;

  return (
    <div className="absolute z-[1000] top-3 right-3 flex items-center gap-2">
      <TombolAtas ikon={<Workflow size={15} />} nada="mint" onClick={onModeSld} title="Hanya garis, pangkal, keypoint, dan gardu — dengan simulasi lepas">
        Mode SLD
      </TombolAtas>
      <MenuKelompok
        label="JTM"
        terbuka={menuBuka === "jtm"}
        onBuka={() => bukaMenu("jtm")}
        angka={(bolehSetujui ? jtm.antrean.length : 0) + (boleh ? portal.daftar.length : 0)}
        warnaAngka="#60A5FA"
        menyala={jtm.aktif || koreksi.aktif || isian.tampil || portal.aktif}
        kelas={TOMBOL_ATAS}
      >
        {bolehSetujui && (
          <TombolAtas
            ikon={<ClipboardCheck size={15} />}
            aktif={jtm.aktif}
            nada="biru"
            lencana={jtm.antrean.length}
            onClick={jtm.alih}
            title="Antrean inspeksi JTM yang menunggu persetujuan"
          >
            Persetujuan JTM
          </TombolAtas>
        )}
        {boleh && (
          <TombolAtas
            ikon={<ListChecks size={15} />}
            aktif={koreksi.aktif}
            nada="mint"
            onClick={() => {
              tutupObjek();
              if (koreksi.aktif) koreksi.keluar();
              else {
                garduJanggal.setAktif(false);
                koreksi.mulai();
              }
            }}
            title="Betulkan isian inspeksi JTM (mis. ukuran kabel) per rentang tiang, atau yang janggal"
          >
            Koreksi isian
          </TombolAtas>
        )}
        {koreksi.aktif ? (
          <TombolAtas
            ikon={<Ruler size={15} />}
            aktif={isian.tampil}
            onClick={() => isian.setTulis((v) => (v ? null : "ukuran_konduktor"))}
            title="Tulis isian yang sedang dikoreksi di tiap tiang"
          >
            {isian.nama}
          </TombolAtas>
        ) : (
          TULIS_ISIAN.map((x) => (
            <TombolAtas
              key={x.kode}
              ikon={<Ruler size={15} />}
              aktif={isian.tulis === x.kode}
              onClick={() => isian.setTulis(isian.tulis === x.kode ? null : x.kode)}
              title={x.judul}
            >
              {x.nama}
            </TombolAtas>
          ))
        )}
        {boleh && (
          <TombolAtas
            ikon={<Columns2 size={15} />}
            aktif={portal.aktif}
            nada="ungu"
            lencana={portal.daftar.length}
            onClick={portal.alih}
            title="Gardu portal yang baru tercatat satu tiang — buatkan tiang keduanya"
          >
            Portal
          </TombolAtas>
        )}
      </MenuKelompok>

      <MenuKelompok
        label="JTR"
        terbuka={menuBuka === "jtr"}
        onBuka={() => bukaMenu("jtr")}
        angka={bolehSetujui ? jtr.antrean.length : 0}
        warnaAngka="#FACC15"
        menyala={jtr.aktif || nomorKabel}
        kelas={TOMBOL_ATAS}
      >
        {bolehSetujui && (
          <TombolAtas
            ikon={<ClipboardCheck size={15} />}
            aktif={jtr.aktif}
            nada="kuning"
            lencana={jtr.antrean.length}
            onClick={jtr.alih}
            title="Antrean inspeksi JTR yang menunggu persetujuan"
          >
            Persetujuan JTR
          </TombolAtas>
        )}
        <TombolAtas
          ikon={<Hash size={15} />}
          aktif={nomorKabel}
          onClick={onNomorKabel}
          title="Tulis nomor kabel JTR tiap tiang — merah = satu kabel bernomor selain 1 (hampir pasti salah catat)"
        >
          Nomor kabel
        </TombolAtas>
      </MenuKelompok>

      <MenuKelompok
        label="Gardu"
        terbuka={menuBuka === "gardu"}
        onBuka={() => bukaMenu("gardu")}
        angka={garduJanggal.jumlah}
        warnaAngka="#F59E0B"
        menyala={kesehatan.aktif || ujung.aktif || garduJanggal.aktif}
        kelas={TOMBOL_ATAS}
      >
        <TombolAtas
          ikon={<TriangleAlert size={15} />}
          aktif={garduJanggal.aktif}
          nada="jingga"
          lencana={garduJanggal.jumlah}
          onClick={() => {
            tutupObjek();
            if (koreksi.aktif) koreksi.keluar();
            garduJanggal.setAktif(!garduJanggal.aktif);
          }}
          title="Kode gardu di tiang yang penyulangnya beda dengan master gardu, atau dipakai lebih dari satu tiang"
        >
          Gardu janggal
        </TombolAtas>
        <TombolAtas
          ikon={<Activity size={15} />}
          aktif={kesehatan.aktif}
          onClick={() => kesehatan.setAktif(!kesehatan.aktif)}
          title="Warnai gardu menurut beban, jatuh tegangan, dan tegangan ujung"
        >
          Kesehatan gardu
        </TombolAtas>
        <TombolAtas
          ikon={<Gauge size={15} />}
          aktif={ujung.aktif}
          onClick={() => ujung.setAktif(!ujung.aktif)}
          title="Tampilkan titik ukur tegangan ujung"
        >
          Tegangan ujung
        </TombolAtas>
      </MenuKelompok>

      <span className="w-px h-6 bg-white/15" aria-hidden />
      {boleh && (
        <TombolAtas
          ikon={<Move size={15} />}
          aktif={geserBanyak.aktif}
          nada="mint"
          disabled={geserBanyak.aktif}
          onClick={() => {
            tutupObjek();
            geserBanyak.mulai();
          }}
          title="Geser titik banyak tiang sekaligus, simpan dengan satu alasan"
        >
          Geser titik
        </TombolAtas>
      )}
      <TombolAtas ikon={<Tags size={15} />} aktif={namaTiang} onClick={onNamaTiang} title="Tulis nama tiap tiang di peta">
        Nama tiang
      </TombolAtas>
      <TombolAtas
        ikon={<RefreshCw size={15} className={memuatUlang ? "animate-spin" : ""} />}
        disabled={memuatUlang}
        onClick={onMuatUlang}
        title="Muat ulang isi peta sesudah menyunting — pilihan lapisan & posisi tetap"
      >
        Muat ulang
      </TombolAtas>
      <Link href="/admin/dashboard" className={TOMBOL_ATAS} style={GAYA_PADAM}>
        <ArrowLeft size={15} /> Kembali
      </Link>
    </div>
  );
}
