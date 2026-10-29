"use client";

import { useCallback } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useToast } from "@/app/admin/_components/Toast";

/**
 * Suntingan admin dari peta (`scripts/peta-sunting.sql`). Penjaga hak ULP &
 * alasan ada di database; pesan tolaknya diteruskan apa adanya.
 */
export function useSuntingPeta(oleh: string) {
  const toast = useToast();

  const jalankan = useCallback(
    async <T,>(fn: string, arg: Record<string, unknown>, sukses: (d: T) => string) => {
      const { data, error } = await supabaseBrowser.rpc(fn, arg);
      if (error) {
        toast.error(
          error.message.includes("Could not find the function")
            ? "Fungsi sunting peta belum ada — jalankan scripts/peta-sunting.sql di Supabase."
            : error.message,
        );
        return false;
      }
      toast.success(sukses(data as T));
      return true;
    },
    [toast],
  );

  const geserTiang = (id: string, lat: number, lng: number, alasan: string) =>
    jalankan<{ kode: string; geser_m: number }>(
      "geser_titik_tiang",
      { p_id: id, p_lat: lat, p_lng: lng, p_alasan: alasan, p_oleh: oleh },
      (d) => `${d.kode} digeser ${d.geser_m} m.`,
    );

  const geserGardu = (kode: string, ulp: string, lat: number, lng: number, alasan: string) =>
    jalankan<{ kode: string; geser_m: number | null }>(
      "geser_titik_gardu",
      { p_kode: kode, p_ulp: ulp, p_lat: lat, p_lng: lng, p_alasan: alasan, p_oleh: oleh },
      (d) => (d.geser_m === null ? `Titik ${d.kode} diisi.` : `${d.kode} digeser ${d.geser_m} m.`),
    );

  const ubahAtribut = (id: string, isi: Record<string, string>) =>
    jalankan<number>("ubah_atribut_tiang", { p_id: id, p_isi: isi, p_oleh: oleh }, (n) =>
      n === 0 ? "Tidak ada yang berubah." : `${n} isian diperbarui.`,
    );

  /** Titik pertemuan dua penyulang: induk tiang ini DI PENYULANG YANG MENUMPANG.
   *  `indukId` null = kembali ikut induk batangnya. */
  const indukPenyulang = (id: string, penyulang: string, indukId: string | null) =>
    jalankan<{ kode: string; penyulang: string; induk: string | null }>(
      "atur_induk_penyulang",
      { p_tiang_id: id, p_penyulang: penyulang, p_induk_id: indukId, p_oleh: oleh },
      (d) =>
        d.induk
          ? `${d.kode} di ${d.penyulang} kini menyambung dari ${d.induk}.`
          : `${d.kode} di ${d.penyulang} kembali ikut induk batangnya.`,
    );

  /** Tiang bersama: penyulang pemilik peralatannya (jtm-peralatan-tiang-bersama.sql). */
  const pemilikPeralatan = (id: string, penyulang: string | null) =>
    jalankan<{ kode: string; penyulang: string | null }>(
      "atur_pemilik_peralatan",
      { p_tiang_id: id, p_penyulang: penyulang, p_oleh: oleh },
      (d) => (d.penyulang ? `Peralatan ${d.kode} kini milik ${d.penyulang}.` : `Pemilik peralatan ${d.kode} dikosongkan.`),
    );

  const tandaiPercabangan = (id: string, nyala: boolean) =>
    jalankan<unknown>("tandai_percabangan_jtm", { p_tiang_id: id, p_nyala: nyala, p_oleh: oleh }, () =>
      nyala ? "Ditandai percabangan." : "Tanda percabangan dilepas.",
    );

  const ubahInduk = (id: string, indukId: string | null) =>
    jalankan<unknown>("ubah_induk_tiang_jtm", { p_tiang_id: id, p_induk_id: indukId, p_oleh: oleh }, () =>
      "Induk tiang diganti.",
    );

  /** Rantai induk terbalik karena salah pilih pangkal (`jtm-balik-arah.sql`).
   *  `penyulang` = penyulang yang menumpang: rantai induk khususnya saja
   *  (`jtm-balik-arah-tumpang.sql`); null = batang. */
  const balikArah = (dari: string, ke: string, hulu: string | null, alasan: string, penyulang: string | null) =>
    jalankan<{ tiang: unknown[]; segmen: unknown[] }>(
      "balik_arah_jtm",
      { p_dari: dari, p_ke: ke, p_hulu: hulu, p_alasan: alasan, p_oleh: oleh, ...(penyulang ? { p_penyulang: penyulang } : {}) },
      (d) => `Arah ${d.tiang.length} tiang dibalik${d.segmen.length ? `, ${d.segmen.length} segmen ditukar` : ""}.`,
    );

  /** Tiang kedua gardu portal (`buat_pasangan_portal`, jtm-hak-akses-portal.sql). */
  const buatPasanganPortal = (id: string) =>
    jalankan<{ kode: string; dari: string }>("buat_pasangan_portal", { p_tiang_id: id, p_oleh: oleh }, (d) =>
      `Pasangan portal ${d.kode} dibuat 2 m dari ${d.dari}. Geser titiknya kalau letaknya berbeda.`,
    );

  /** Penyulang yang salah menumpang: namanya, segmennya, & penilaiannya dihapus (`jtm-lepas-tumpang.sql`). */
  const lepasTumpangJtm = (id: string, penyulang: string, alasan: string) =>
    jalankan<{ kode: string; penyulang: string; penilaian: number }>(
      "lepas_tumpang_jtm",
      { p_tiang_id: id, p_penyulang: penyulang, p_alasan: alasan, p_nama: oleh },
      (d) => `${d.penyulang} dilepas dari tiang ini — ${d.kode} dihapus${d.penilaian ? `, ${d.penilaian} penilaian ikut terhapus` : ""}.`,
    );

  /** Penyulang `penyulang` menumpang di tiang ini, menyambung dari `dariId` (`jtm-tumpang-dari-peta.sql`). */
  const tumpangDari = (id: string, dariId: string, penyulang: string) =>
    jalankan<{ kode: string; penyulang: string; dari: string; tiang: string }>(
      "tumpang_jtm_dari_peta",
      { p_tiang_id: id, p_dari_id: dariId, p_penyulang: penyulang, p_oleh: oleh },
      (d) => `${d.penyulang} kini lewat ${d.tiang} sebagai ${d.kode}, menyambung dari ${d.dari}.`,
    );

  /** Tambah tiang JTM yang lolos dititik (jtm-tambah-pulihkan-tiang.sql).
   *  Galat DIKEMBALIKAN, bukan hanya di-toast: "sudah berdiri" dijawab panel
   *  dengan centang "batang berbeda". */
  const tambahTiang = async (isi: {
    indukId: string; lat: number; lng: number; anakId: string | null; penyulang: string; batangBeda: boolean; alasan: string;
  }): Promise<{ id: string; kode: string } | string> => {
    const { data, error } = await supabaseBrowser.rpc("tambah_tiang_meja_jtm", {
      p_induk_id: isi.indukId, p_lat: isi.lat, p_lng: isi.lng, p_anak_id: isi.anakId,
      p_penyulang: isi.penyulang, p_batang_beda: isi.batangBeda, p_alasan: isi.alasan, p_oleh: oleh,
    });
    if (error) {
      return error.message.includes("Could not find the function")
        ? "Fungsi tambah tiang belum ada — jalankan scripts/jtm-tambah-pulihkan-tiang.sql di Supabase."
        : error.message;
    }
    const d = data as { id: string; kode: string; segmen: string[] };
    toast.success(`Tiang ${d.kode} ditambahkan${d.segmen.length ? ` ke segmen ${d.segmen.join(", ")}` : ""}.`);
    return d;
  };

  const batalkan = (id: string, alasan: string) =>
    jalankan<unknown>("batalkan_tiang", { p_id: id, p_nama: oleh, p_alasan: alasan }, () =>
      "Tiang dibatalkan (salah input).",
    );

  // ── JTR, per gardu (`scripts/peta-koreksi-jtr.sql`) ──
  const indukJtr = (id: string, gardu: string, indukId: string | null, alasan: string) =>
    jalankan<string>("koreksi_induk_jtr", { p_id: id, p_gardu: gardu, p_induk_id: indukId, p_alasan: alasan, p_nama: oleh },
      (k) => (k === "(gardu)" ? "Tiang kini berpangkal langsung di gardu." : `Induk diganti ke ${k}.`),
    );

  const namaJtr = (id: string, gardu: string, kode: string) =>
    jalankan<string>("ubah_nama_tiang_jtr", { p_id: id, p_gardu: gardu, p_kode: kode, p_nama: oleh },
      (k) => `Nama tiang kini ${k}.`,
    );

  const kabelJtr = (
    id: string, gardu: string, lama: number, baru: number, jenis: string, ukuran: string, hilir: boolean,
  ) =>
    jalankan<{ diubah: number; dilewati: string[] }>(
      "ubah_kabel_jtr",
      { p_id: id, p_gardu: gardu, p_nomor_lama: lama, p_nomor_baru: baru, p_jenis: jenis || null, p_ukuran: ukuran || null, p_hilir: hilir, p_nama: oleh },
      (d) =>
        `Kabel diperbarui di ${d.diubah} tiang.` +
        (d.dilewati.length ? ` Dilewati (sudah punya kabel ke-${baru}): ${d.dilewati.join(", ")}.` : ""),
    );

  const jurusanJtr = (id: string, gardu: string, jurusan: string, hilir: boolean) =>
    jalankan<number>("ubah_jurusan_tiang_jtr", { p_id: id, p_gardu: gardu, p_jurusan: jurusan, p_hilir: hilir, p_nama: oleh },
      (n) => `${n} tiang pindah ke jurusan ${jurusan}.`,
    );

  const gabungJtr = (kembar: string, gardu: string, batang: string, alasan: string) =>
    jalankan<string>("gabung_tiang_jtr", { p_kembar: kembar, p_gardu: gardu, p_batang: batang, p_alasan: alasan, p_nama: oleh },
      (b) => `Digabung — gardu ${gardu} kini menumpang di batang ${b}.`,
    );

  /** Jurusan satu kabel JTR (`jtr-jurusan-kabel-web.sql`). */
  const jurusanKabelJtr = (id: string, gardu: string, nomor: number, jurusan: string) =>
    jalankan<{ kode: string; nomor: number; jurusan: string }>(
      "atur_jurusan_kabel_jtr",
      { p_tiang_id: id, p_gardu: gardu, p_nomor: nomor, p_jurusan: jurusan, p_oleh: oleh },
      (d) => `${d.kode} kabel ke-${d.nomor}: jurusan ${d.jurusan}.`,
    );

  /** Asal satu kabel JTR: tiang lain, atau langsung dari gardu (`jtr-asal-kabel.sql`). */
  const asalKabelJtr = (id: string, gardu: string, nomor: number, huluId: string | null, dariGardu: boolean) =>
    jalankan<{ kode: string; nomor: number; asal: string }>(
      "atur_asal_kabel_jtr",
      { p_tiang_id: id, p_gardu: gardu, p_nomor: nomor, p_hulu_id: dariGardu ? null : huluId, p_dari_gardu: dariGardu, p_oleh: oleh },
      (d) => `${d.kode} kabel ke-${d.nomor}: asal ${d.asal === "gardu" ? "langsung dari gardu" : d.asal}.`,
    );

  const lepasTumpangJtr = (tumpangId: string, alasan: string) =>
    jalankan<unknown>("lepas_tumpang_jtr", { p_tumpang_id: tumpangId, p_alasan: alasan, p_nama: oleh },
      () => "Dilepas dari batang.",
    );

  return {
    geserTiang, geserGardu, ubahAtribut, tandaiPercabangan, indukPenyulang, pemilikPeralatan, ubahInduk, balikArah, batalkan, lepasTumpangJtm, tumpangDari, buatPasanganPortal,
    tambahTiang,
    indukJtr, namaJtr, kabelJtr, jurusanJtr, gabungJtr, lepasTumpangJtr, asalKabelJtr, jurusanKabelJtr,
  };
}
