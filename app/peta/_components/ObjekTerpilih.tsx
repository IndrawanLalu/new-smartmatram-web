"use client";

import type { Banding } from "@/app/admin/jtr/_hooks/useApprovalJtr";
import type { MilikPenanda } from "@/lib/milikPenanda";
import type { AntreanJtr } from "../_hooks/useAntreanJtr";
import type { useObjekPeta } from "../_hooks/useObjekPeta";
import type { Penanda } from "../_hooks/usePenandaJtm";
import type { PilihObjek } from "../_hooks/usePilihObjek";
import type { HasilSimulasi } from "../_hooks/useSimulasiBuka";
import type { useSuntingPeta } from "../_hooks/useSuntingPeta";
import BalikArahJtm from "./BalikArahJtm";
import DialogObjek from "./DialogObjek";
import PanelObjek from "./PanelObjek";
import type { IsiTambah } from "./TambahTiangJtm";

/**
 * Panel benda yang diklik + semua sambungan suntingnya ke database, dan
 * dialog konfirmasi yang menyertainya (gabung tiang kembar, ganti induk).
 * Tiap suntingan yang berhasil menyegarkan peta lewat `segarkan`.
 */

interface Props {
  p: PilihObjek;
  objek: ReturnType<typeof useObjekPeta>;
  sunting: ReturnType<typeof useSuntingPeta>;
  penanda: Map<string, Penanda>;
  boleh: boolean;
  oleh: string;
  /** Panel disembunyikan selama mode geser titik banyak tiang. */
  tampilPanel: boolean;
  segarkan: () => void;
  muatUlangPeta: () => void;
  onPortalBerubah: () => void;
  milik: Map<string, MilikPenanda>;
  simulasi: { hasil: HasilSimulasi | null; sibuk: boolean; tutup: () => void };
  onSimulasi: () => void;
  inspeksiJtr: AntreanJtr | null;
  onDiputuskanJtr: () => void;
  onSorotBanding: (b: Banding | null) => void;
}

export default function ObjekTerpilih({
  p, objek, sunting, penanda, boleh, oleh, tampilPanel, segarkan, muatUlangPeta, onPortalBerubah, milik,
  simulasi, onSimulasi, inspeksiJtr, onDiputuskanJtr, onSorotBanding,
}: Props) {
  const { terpilih } = p;

  /** Suntingan satu tiang; berhasil = peta disegarkan. */
  const suntingTiang = async (fn: (id: string) => Promise<boolean>) => {
    if (terpilih?.jenis !== "tiang") return false;
    const ok = await fn(terpilih.id);
    if (ok) segarkan();
    return ok;
  };

  const aturIndukPenyulang = async (indukId: string | null) => {
    if (terpilih?.jenis !== "tiang" || !p.indukPenyulang) return false;
    const ok = await sunting.indukPenyulang(terpilih.id, p.indukPenyulang, indukId);
    if (ok) {
      p.setModeInduk(false);
      p.setIndukPenyulang(null);
      segarkan();
    }
    return ok;
  };

  /** Koreksi JTR: semua per gardu yang sedang dipilih (`terpilih.kelompok`). */
  const koreksiJtr = async (fn: (id: string, gardu: string) => Promise<boolean>) => {
    if (terpilih?.jenis !== "tiang" || terpilih.jaringan !== "jtr") return false;
    const ok = await fn(terpilih.id, terpilih.kelompok);
    if (ok) segarkan();
    return ok;
  };
  const gantiIndukJtr = async (indukId: string | null) => {
    const ok = await koreksiJtr((id, g) => sunting.indukJtr(id, g, indukId, p.alasanInduk));
    if (ok) {
      p.setModeInduk(false);
      p.setAlasanInduk("");
    }
    return ok;
  };

  const simpanGeser = async (alasan: string) => {
    if (!terpilih || !p.geser) return false;
    const ok =
      terpilih.jenis === "tiang"
        ? await sunting.geserTiang(terpilih.id, p.geser.lat, p.geser.lng, alasan)
        : await sunting.geserGardu(terpilih.kode, terpilih.ulp, p.geser.lat, p.geser.lng, alasan);
    if (ok) {
      p.setTerpilih({ ...terpilih, lat: p.geser.lat, lng: p.geser.lng });
      p.setGeser(null);
      segarkan();
    }
    return ok;
  };

  /** Tambah tiang JTM: tersimpan → panel pindah ke tiang baru (atributnya bisa langsung diisi). */
  const simpanTambah = async (isi: IsiTambah) => {
    if (terpilih?.jenis !== "tiang" || !p.geser) return "Letak tiang belum ditentukan";
    const pos = p.geser;
    const h = await sunting.tambahTiang({
      indukId: terpilih.id, lat: pos.lat, lng: pos.lng, anakId: isi.anakId,
      penyulang: terpilih.kelompok, batangBeda: isi.batangBeda, alasan: isi.alasan,
    });
    if (typeof h === "string") return h;
    p.setTambah(false);
    p.setGeser(null);
    p.setTerpilih({ jenis: "tiang", id: h.id, kelompok: terpilih.kelompok, lat: pos.lat, lng: pos.lng, kode: h.kode, jaringan: "jtm" });
    segarkan();
    return null;
  };

  /** Batang hilang dari peta / lapisan (dibatalkan / lepas tumpang): panel ditutup. */
  const tutupLaluMuat = (ok: boolean) => {
    if (ok) {
      p.tutup();
      muatUlangPeta();
    }
    return ok;
  };

  return (
    <>
      {terpilih && tampilPanel && (
        <PanelObjek
          key={terpilih.jenis === "tiang" ? terpilih.id : `${terpilih.ulp}-${terpilih.kode}`}
          terpilih={terpilih}
          tiang={objek.tiang}
          gardu={objek.gardu}
          galat={objek.galat}
          pilihan={objek.pilihan}
          penanda={penanda}
          boleh={boleh}
          geser={p.geser}
          onMulaiGeser={() => p.setGeser({ lat: terpilih.lat, lng: terpilih.lng })}
          onBatalGeser={() => p.setGeser(null)}
          onSimpanGeser={simpanGeser}
          modeInduk={p.modeInduk}
          onGantiInduk={() => p.setModeInduk(true)}
          tambah={p.tambah}
          onMulaiTambah={() => {
            // Mulai ±20 m di utara induknya; admin menyeret ke letak sebenarnya.
            p.setTambah(true);
            p.setGeser({ lat: terpilih.lat + 0.00018, lng: terpilih.lng });
          }}
          onPosisiTambah={p.aturGeser}
          onSimpanTambah={simpanTambah}
          onBatalTambah={() => {
            p.setTambah(false);
            p.setGeser(null);
          }}
          modeHilir={p.modeHilir}
          onSambungHilir={() => p.setModeHilir(true)}
          onBatalHilir={() => p.setModeHilir(false)}
          onBatalInduk={() => {
            p.setModeInduk(false);
            p.setIndukPenyulang(null);
          }}
          indukPenyulang={p.indukPenyulang}
          balik={p.balik ? { ke: p.balik.ke?.kode ?? null } : null}
          onBalikArah={() => p.setBalik({ ke: null })}
          onTanpaHulu={() => p.balik?.ke && p.setCalonBalik({ ke: p.balik.ke, hulu: null })}
          onBatalBalik={() => p.setBalik(null)}
          onIndukPenyulang={(x) => {
            p.setIndukPenyulang(x);
            p.setModeInduk(true);
          }}
          onIkutBatang={() => aturIndukPenyulang(null)}
          onUbahAtribut={(isi) => suntingTiang((id) => sunting.ubahAtribut(id, isi))}
          onPercabangan={(nyala) => suntingTiang((id) => sunting.tandaiPercabangan(id, nyala))}
          onBuatPasangan={async () => {
            const ok = await suntingTiang((id) => sunting.buatPasanganPortal(id));
            if (ok) onPortalBerubah();
            return ok;
          }}
          onNamaBerubah={segarkan}
          milikPenanda={
            terpilih.jenis === "tiang"
              ? ([...milik].find(([k]) => k.startsWith(`${terpilih.id}|`))?.[1] ?? null)
              : null
          }
          onPemilikPeralatan={(x) => suntingTiang((id) => sunting.pemilikPeralatan(id, x))}
          onBatalkan={async (alasan) => {
            if (terpilih.jenis !== "tiang") return false;
            return tutupLaluMuat(await sunting.batalkan(terpilih.id, alasan));
          }}
          onLepasTumpangJtm={async (penyulang, alasan) => {
            if (terpilih.jenis !== "tiang") return false;
            return tutupLaluMuat(await sunting.lepasTumpangJtm(terpilih.id, penyulang, alasan));
          }}
          onTutup={p.tutup}
          simulasi={simulasi.hasil}
          simulasiSibuk={simulasi.sibuk}
          onSimulasi={onSimulasi}
          onTutupSimulasi={simulasi.tutup}
          alasanInduk={p.alasanInduk}
          onAlasanInduk={p.setAlasanInduk}
          onPangkalGardu={() => gantiIndukJtr(null)}
          onNamaJtr={async (kode) => {
            const ok = await koreksiJtr((id, g) => sunting.namaJtr(id, g, kode));
            if (ok && terpilih.jenis === "tiang") p.setTerpilih({ ...terpilih, kode: kode.trim().toUpperCase() });
            return ok;
          }}
          onKabelJtr={(lama, baru, jenis, ukuran, hilir) =>
            koreksiJtr((id, g) => sunting.kabelJtr(id, g, lama, baru, jenis, ukuran, hilir))}
          onAsalJtr={(nomor, huluId, dariGardu) =>
            koreksiJtr((id, g) => sunting.asalKabelJtr(id, g, nomor, huluId, dariGardu))}
          onJurusanKabelJtr={(nomor, jurusan) => koreksiJtr((id, g) => sunting.jurusanKabelJtr(id, g, nomor, jurusan))}
          onJurusanJtr={(jurusan, hilir) => koreksiJtr((id, g) => sunting.jurusanJtr(id, g, jurusan, hilir))}
          inspeksiJtr={inspeksiJtr}
          oleh={oleh}
          onDiputuskan={onDiputuskanJtr}
          onSorot={onSorotBanding}
          modeGabung={p.modeGabung}
          onMulaiGabung={() => p.setModeGabung(true)}
          onBatalGabung={() => p.setModeGabung(false)}
          onLepasTumpang={async (alasan) => {
            const tid = objek.tiang?.jtr?.tumpangId;
            if (!tid) return false;
            return tutupLaluMuat(await sunting.lepasTumpangJtr(tid, alasan));
          }}
        />
      )}
      {p.calonBalik && terpilih?.jenis === "tiang" && (
        <BalikArahJtm
          key={`${p.calonBalik.ke.id}-${p.calonBalik.hulu?.id ?? ""}`}
          dariId={terpilih.id}
          keId={p.calonBalik.ke.id}
          huluId={p.calonBalik.hulu?.id ?? null}
          oleh={oleh}
          onBalik={async (alasan) => {
            const c = p.calonBalik;
            const ok = !!c && (await sunting.balikArah(terpilih.id, c.ke.id, c.hulu?.id ?? null, alasan));
            if (ok) segarkan();
            return ok;
          }}
          onTutup={() => p.setCalonBalik(null)}
          onSelesai={() => {
            p.setCalonBalik(null);
            p.setBalik(null);
            segarkan();
          }}
        />
      )}
      <DialogObjek p={p} sunting={sunting} segarkan={segarkan} onIndukPenyulang={aturIndukPenyulang} onIndukJtr={gantiIndukJtr} />
    </>
  );
}
