"use client";

import { useCallback } from "react";
import type { CurrentUser } from "@/lib/roles";
import { useToast } from "@/app/admin/_components/Toast";
import SusunWoGardu from "@/app/admin/_components/SusunWoGardu";
import { masukkanKeWoBulanan, muatGarduBulanan, muatTerikatBulanan, type JenisWoBulanan } from "@/lib/woGarduBulanan";

/**
 * Tab "Susun WO" Pemeliharaan Gardu & Pengukuran (W3/W4, 27 Okt 2026): pilih
 * gardu sendiri di samping Rencana Excel & terbit otomatis yang tetap jalan.
 * Gardu pilihan masuk ke WO bulan itu (lib/woGarduBulanan.ts).
 */

const TEKS: Record<JenisWoBulanan, { judul: string; labelBelum: string; nama: string }> = {
  hargardu: { judul: "Susun WO Pemeliharaan Gardu", labelBelum: "belum pernah dipelihara", nama: "WO Pemeliharaan" },
  pengukuran: { judul: "Susun WO Pengukuran", labelBelum: "belum pernah diukur", nama: "WO Pengukuran" },
};

const TANPA_TERIKAT = new Set<string>();

interface Props {
  user: CurrentUser;
  jenis: JenisWoBulanan;
  /** Sesudah tersimpan: bulan WO (YYYY-MM) — halaman pindah ke Daftar WO bulan itu. */
  onSelesai: (bulan: string) => void;
}

export default function SusunWoBulanan({ user, jenis, onSelesai }: Props) {
  const toast = useToast();
  const t = TEKS[jenis];
  const muatGardu = useCallback((ulp: string) => muatGarduBulanan(jenis, ulp), [jenis]);
  const muatTerikat = useCallback((ulp: string, bulan: string) => muatTerikatBulanan(jenis, ulp, bulan), [jenis]);

  return (
    <SusunWoGardu
      user={user}
      judul={t.judul}
      contohNama=""
      labelBelum={t.labelBelum}
      bulanan
      muatGardu={muatGardu}
      muatTerikat={muatTerikat}
      terikat={TANPA_TERIKAT}
      regu={[]}
      woTerbuka={[]}
      woAwal={null}
      onTerbitkan={async (v) => {
        const bulan = v.tglWo.slice(0, 7);
        try {
          const h = await masukkanKeWoBulanan(jenis, v.ulp, bulan, v.gardu, user.name ?? user.email ?? "");
          const lewat = h.dilewati.length + h.ditolak.length;
          toast.success(`${h.masuk} gardu masuk ${t.nama} ${v.ulp}${lewat ? ` · ${lewat} dilewati` : ""}.`);
          if (h.ditolak.length) toast.error(h.ditolak.slice(0, 3).map((x) => `${x.objek}: ${x.sebab}`).join(" · "));
          onSelesai(bulan);
          return true;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : String(e));
          return false;
        }
      }}
      onTambah={async () => false}
    />
  );
}
