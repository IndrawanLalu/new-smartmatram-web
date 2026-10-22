"use client";

import ConfirmDialog from "@/app/admin/_components/ConfirmDialog";
import BatalkanModal from "@/app/admin/_components/BatalkanModal";
import type { PilihObjek } from "../_hooks/usePilihObjek";
import type { useSuntingPeta } from "../_hooks/useSuntingPeta";

/**
 * Konfirmasi sesudah tiang KEDUA diklik dalam mode gabung atau ganti induk:
 * gabungkan tiang kembar JTR, ganti induk JTR, sambungkan di penyulang yang
 * menumpang, ganti induk batang JTM, atau sambung hilir JTM.
 */

interface Props {
  p: PilihObjek;
  sunting: ReturnType<typeof useSuntingPeta>;
  segarkan: () => void;
  onIndukPenyulang: (indukId: string) => Promise<boolean>;
  onIndukJtr: (indukId: string) => Promise<boolean>;
}

export default function DialogObjek({ p, sunting, segarkan, onIndukPenyulang, onIndukJtr }: Props) {
  const { terpilih, calonGabung, calonInduk, calonHilir, indukPenyulang, alasanInduk } = p;
  if (terpilih?.jenis !== "tiang") return null;
  const jtr = terpilih.jaringan === "jtr";

  if (calonGabung && jtr) {
    return (
      <BatalkanModal
        judul={`Gabungkan ${terpilih.kode} ke batang ${calonGabung.kode}?`}
        keterangan={`Untuk tiang KEMBAR: ${terpilih.kode} dan ${calonGabung.kode} ternyata batang yang sama. Gardu ${terpilih.kelompok} lalu menumpang di ${calonGabung.kode} — nama ${terpilih.kode}, induk, kabel, dan tiang sesudahnya ikut.`}
        peringatan={`Batang ${terpilih.kode} dibatalkan (titiknya tidak dipakai lagi).`}
        labelTombol="Gabungkan"
        placeholder="Alasan — mis. GPS meleset, batangnya sama dengan tiang JTM"
        onTutup={() => p.setCalonGabung(null)}
        onBatalkan={async (alasan) => {
          const t = calonGabung;
          const ok = await sunting.gabungJtr(terpilih.id, terpilih.kelompok, t.id, alasan);
          if (ok) {
            p.setCalonGabung(null);
            p.setModeGabung(false);
            p.setTerpilih({ ...terpilih, id: t.id, lat: t.lat, lng: t.lng });
            segarkan();
          }
          return ok;
        }}
      />
    );
  }

  if (calonHilir && !jtr) {
    const tutupHilir = () => p.setCalonHilir(null);
    return (
      <ConfirmDialog
        title={`Sambungkan ${calonHilir.kode} dari ${terpilih.kode}?`}
        message={`${calonHilir.kode} beserta tiang sesudahnya akan menyambung dari ${terpilih.kode}; sambungan lamanya lepas. Ditolak kalau ${terpilih.kode} justru berada di hilir ${calonHilir.kode}. Nama tidak berubah otomatis — pakai Ganti nama (hilir ikut) bila perlu.`}
        confirmLabel="Sambungkan"
        onConfirm={async () => {
          const t = calonHilir;
          tutupHilir();
          const ok = await sunting.ubahInduk(t.id, terpilih.id);
          if (ok) {
            p.setModeHilir(false);
            segarkan();
          }
        }}
        onClose={tutupHilir}
      />
    );
  }

  if (!calonInduk) return null;
  const tutup = () => p.setCalonInduk(null);

  if (jtr) {
    return (
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
          tutup();
          if (alasanInduk.trim()) await onIndukJtr(t.id);
        }}
        onClose={tutup}
      />
    );
  }

  if (indukPenyulang) {
    return (
      <ConfirmDialog
        title={`Sambungkan ${terpilih.kode} dari ${calonInduk.kode} di ${indukPenyulang}?`}
        message={`Di penyulang ${indukPenyulang}, tiang ini menyambung dari ${calonInduk.kode}. Induk di penyulang pemiliknya tidak berubah. Nama ${indukPenyulang} tiang ini tidak berubah otomatis — Generate ulang nama ${indukPenyulang} sesudahnya.`}
        confirmLabel="Sambungkan"
        onConfirm={async () => {
          const t = calonInduk;
          tutup();
          await onIndukPenyulang(t.id);
        }}
        onClose={tutup}
      />
    );
  }

  return (
    <ConfirmDialog
      title={`Jadikan ${calonInduk.kode} induk ${terpilih.kode}?`}
      message="Jalur jaringan tiang ini akan menyambung dari tiang yang Anda klik. Nama tiang tidak berubah otomatis — kalau urutannya jadi janggal, nomori ulang penyulangnya dari tab Tiang di Inspeksi JTM."
      confirmLabel="Ganti induk"
      onConfirm={async () => {
        const t = calonInduk;
        tutup();
        const ok = await sunting.ubahInduk(terpilih.id, t.id);
        if (ok) {
          p.setModeInduk(false);
          segarkan();
        }
      }}
      onClose={tutup}
    />
  );
}
