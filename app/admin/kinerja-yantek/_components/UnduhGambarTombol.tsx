"use client";

import { useState } from "react";
import { ImageDown, Loader2 } from "lucide-react";
import { useToast } from "@/app/admin/_components/Toast";
import Tombol from "@/app/admin/_kit/Tombol";

/**
 * Unduh gambar laporan Rekap Kinerja (PNG 1920×1080, `/api/gambar/rekap-kinerja`)
 * untuk ULP & bulan yang sedang dipilih di saringan. Gambarnya satu ULP satu
 * bulan — "Semua ULP" dan "seluruh tahun" belum punya gambarnya, jadi tombolnya
 * mati dan menyebut alasannya.
 */

interface UnduhGambarTombolProps {
  ulp: string;
  tahun: number;
  /** 0 = seluruh tahun. */
  bulan: number;
}

export default function UnduhGambarTombol({ ulp, tahun, bulan }: UnduhGambarTombolProps) {
  const toast = useToast();
  const [membuat, setMembuat] = useState(false);

  const alasanMati =
    ulp === "SEMUA" ? "Pilih satu ULP dulu — gambarnya per ULP."
    : bulan === 0 ? "Pilih satu bulan dulu — gambarnya per bulan."
    : null;

  async function unduh() {
    setMembuat(true);
    try {
      const p = new URLSearchParams({ ulp, bulan: `${tahun}-${String(bulan).padStart(2, "0")}`, unduh: "1" });
      const res = await fetch(`/api/gambar/rekap-kinerja?${p.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Gagal membuat gambar");
      const nama = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "rekap-kinerja.png";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nama;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${nama} terunduh.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gagal membuat gambar");
    } finally {
      setMembuat(false);
    }
  }

  // Judul di pembungkus: tombol mati tidak menerima kursor, jadi alasannya
  // tidak akan tampil kalau dipasang di tombolnya.
  return (
    <span title={alasanMati ?? "Unduh gambar laporan (PNG) untuk dibagikan"} className="inline-flex">
      <Tombol
        onClick={unduh}
        disabled={membuat || alasanMati !== null}
        ikon={membuat ? <Loader2 size={15} className="animate-spin" /> : <ImageDown size={15} />}
      >
        {membuat ? "Membuat gambar…" : "Unduh Gambar"}
      </Tombol>
    </span>
  );
}
