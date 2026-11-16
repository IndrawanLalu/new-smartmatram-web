"use client";

import { useMemo, useState } from "react";
import { labelAlasanGk } from "@/lib/garduKhusus";
import { CHIP, CHIP_OFF, CHIP_ON, EYEBROW } from "@/app/admin/_ui";
import { BarisMemuat, DuaBaris, KartuTabel, Kolom, TD } from "@/app/admin/_kit/Tabel";
import type { UsulanGk } from "../_hooks/useGarduKhusus";
import UsulanGkModal from "./UsulanGkModal";

const STATUS: Record<UsulanGk["status"], { teks: string; cls: string }> = {
  menunggu: { teks: "Menunggu persetujuan", cls: "bg-blue-50 text-blue-700 border-blue-200" },
  disetujui: { teks: "Disetujui", cls: "bg-green-50 text-green-700 border-green-200" },
  ditolak: { teks: "Ditolak", cls: "bg-red-50 text-red-700 border-red-200" },
};

export const MODUL_GK: Record<string, string> = {
  inspeksi_gardu: "Inspeksi Gardu",
  inspeksi_jtr: "Inspeksi JTR",
  pemeliharaan_gardu: "Pemeliharaan Gardu",
};

const waktu = (s: string) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

/** Usulan gardu khusus dari HP. Bawaan: yang menunggu saja. */
export default function TabelUsulanGk({
  usulan, boleh, onPutuskan,
}: {
  usulan: UsulanGk[] | null;
  boleh: boolean;
  onPutuskan: (id: string, setuju: boolean, alasan: string) => Promise<boolean>;
}) {
  const [semua, setSemua] = useState(false);
  const [buka, setBuka] = useState<UsulanGk | null>(null);
  const menunggu = (usulan ?? []).filter((u) => u.status === "menunggu").length;
  const tampil = useMemo(() => (usulan ?? []).filter((u) => semua || u.status === "menunggu"), [usulan, semua]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className={EYEBROW}>Usulan dari HP</p>
        <button onClick={() => setSemua(false)} className={`${CHIP} ${!semua ? CHIP_ON : CHIP_OFF}`}>Menunggu · {menunggu}</button>
        <button onClick={() => setSemua(true)} className={`${CHIP} ${semua ? CHIP_ON : CHIP_OFF}`}>Semua · {usulan?.length ?? 0}</button>
      </div>

      {usulan && tampil.length === 0 ? (
        <p className="text-sm text-ink-soft px-1">{semua ? "Belum ada usulan dari HP." : "Tidak ada usulan yang menunggu."}</p>
      ) : (
        <KartuTabel>
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Kolom>Gardu</Kolom>
                <Kolom>Alasan</Kolom>
                <Kolom>Keterangan</Kolom>
                <Kolom>Pengusul</Kolom>
                <Kolom>Status</Kolom>
              </tr>
            </thead>
            <tbody>
              {!usulan ? (
                <BarisMemuat kolom={5} baris={3} />
              ) : (
                tampil.map((u) => (
                  <tr key={u.id} onClick={() => setBuka(u)} className="cursor-pointer hover:bg-navy-50/50">
                    <td className={TD}><DuaBaris utama={<b>{u.kode}</b>} bawah={u.nama ?? u.ulp} /></td>
                    <td className={`${TD} max-w-56`}>{u.alasan.map(labelAlasanGk).join(" · ")}</td>
                    <td className={`${TD} max-w-64 text-ink-soft truncate`}>{u.keterangan ?? "—"}</td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <DuaBaris utama={u.pengusul_nama ?? "—"} bawah={`${waktu(u.diusulkan_at)}${u.modul ? ` · ${MODUL_GK[u.modul] ?? u.modul}` : ""}`} />
                    </td>
                    <td className={TD}>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border whitespace-nowrap ${STATUS[u.status].cls}`}>
                        {STATUS[u.status].teks}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </KartuTabel>
      )}

      {buka && (
        <UsulanGkModal
          u={buka}
          boleh={boleh}
          onTutup={() => setBuka(null)}
          onPutuskan={async (setuju, alasan) => {
            if (await onPutuskan(buka.id, setuju, alasan)) setBuka(null);
          }}
        />
      )}
    </div>
  );
}
