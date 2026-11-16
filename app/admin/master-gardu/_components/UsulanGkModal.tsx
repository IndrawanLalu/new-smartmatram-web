"use client";

import { labelAlasanGk } from "@/lib/garduKhusus";
import { fotoKecil } from "@/lib/fotoKecil";
import { EYEBROW } from "@/app/admin/_ui";
import ModalShell from "@/app/admin/_components/ModalShell";
import PutusanUsulan from "@/app/admin/_components/PutusanUsulan";
import type { UsulanGk } from "../_hooks/useGarduKhusus";
import { MODUL_GK } from "./TabelUsulanGk";

const waktu = (s: string) => new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Rincian satu usulan gardu khusus: foto, alasan, keterangan → Setujui / Tolak. */
export default function UsulanGkModal({
  u, boleh, onTutup, onPutuskan,
}: {
  u: UsulanGk;
  boleh: boolean;
  onTutup: () => void;
  onPutuskan: (setuju: boolean, alasan: string) => Promise<unknown>;
}) {
  const foto = [u.foto_url, ...u.foto_lain].filter((x): x is string => !!x);
  return (
    <ModalShell
      title={`Usulan gardu khusus — ${u.kode}`}
      subtitle={[u.nama, u.penyulang, u.ulp].filter(Boolean).join(" · ")}
      maxWidth="max-w-2xl"
      onClose={onTutup}
    >
      <div className="flex flex-wrap gap-2">
        {foto.map((f, i) => (
          <a key={f} href={f} target="_blank" rel="noreferrer" title={`Foto ${i + 1}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- foto Supabase Storage, ukuran tak tentu */}
            <img src={fotoKecil(f, 480)} alt={`Foto ${u.kode} ${i + 1}`} className="h-40 w-auto rounded-xl border border-line object-cover hover:opacity-90" />
          </a>
        ))}
      </div>

      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-2 text-sm">
        <dt className={EYEBROW}>Alasan</dt>
        <dd className="text-ink">{u.alasan.map(labelAlasanGk).join(" · ")}</dd>
        <dt className={EYEBROW}>Keterangan</dt>
        <dd className="text-ink whitespace-pre-wrap">{u.keterangan ?? "—"}</dd>
        <dt className={EYEBROW}>Pengusul</dt>
        <dd className="text-ink-soft">
          {u.pengusul_nama ?? "—"} · {waktu(u.diusulkan_at)}
          {u.modul ? ` · dari ${MODUL_GK[u.modul] ?? u.modul}` : ""}
        </dd>
        {u.lat !== null && u.lng !== null && (
          <>
            <dt className={EYEBROW}>Posisi</dt>
            <dd>
              <a href={`https://www.google.com/maps?q=${u.lat},${u.lng}`} target="_blank" rel="noreferrer" className="text-navy-600 hover:underline">
                {u.lat.toFixed(6)}, {u.lng.toFixed(6)}
              </a>
            </dd>
          </>
        )}
        {u.status !== "menunggu" && (
          <>
            <dt className={EYEBROW}>Putusan</dt>
            <dd className="text-ink-soft">
              {u.status === "disetujui" ? "Disetujui" : "Ditolak"} oleh {u.penilai_nama ?? "—"}
              {u.dinilai_at ? ` · ${waktu(u.dinilai_at)}` : ""}
              {u.alasan_putusan ? ` — “${u.alasan_putusan}”` : ""}
            </dd>
          </>
        )}
      </dl>

      {u.status === "menunggu" && boleh && (
        <>
          <p className="text-xs text-ink-soft">
            Disetujui → gardu ini jadi gardu khusus, item WO Inspeksi Gardu, Inspeksi JTR, dan Pemeliharaan Gardu yang
            masih terbuka dibatalkan otomatis. Ditolak → kembali ke petugas di HP beserta alasannya.
          </p>
          <PutusanUsulan labelTolak="Tolak" onPutuskan={onPutuskan} />
        </>
      )}
    </ModalShell>
  );
}
