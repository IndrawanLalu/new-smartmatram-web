"use client";

import { CheckCircle2, ClipboardList } from "lucide-react";
import ModalShell from "@/app/admin/_components/ModalShell";
import { BTN_GHOST, BTN_PRIMARY, EYEBROW } from "@/app/admin/_ui";
import { fotoKecil } from "@/lib/fotoKecil";
import { statusTemuan, type BarisPerbaikan } from "../_hooks/usePerluPerbaikan";
import { NAMA_JALUR } from "./PerluPerbaikan";

/**
 * Rincian satu temuan di Perlu Perbaikan (10 Nov 2026): foto, uraian, asal,
 * penugasan, dan hasilnya bila sudah dikerjakan (teknisaplikasi butir 7:
 * daftar = tabel, rincian = modal).
 */

interface Props {
  b: BarisPerbaikan;
  onTutup: () => void;
  /** Ada bila temuan ini boleh ditugaskan (belum di-WO / belum bisa dikerjakan). */
  onTugaskan?: () => void;
  /** Sama syaratnya dengan onTugaskan — admin menyatakan temuan ini normal. */
  onTandaiNormal?: () => void;
}

const waktu = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const STATUS: Record<ReturnType<typeof statusTemuan>, string> = {
  belum: "Belum di-WO",
  sudah: "Sudah di-WO",
  dikerjakan: "Sudah dikerjakan",
  normal: "Dinyatakan normal",
};

function Foto({ url, label }: { url: string | null | undefined; label: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <p className={EYEBROW}>{label}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto lapangan dari Storage, ukuran diatur fotoKecil */}
      <img src={fotoKecil(url, 480)} alt={label} className="mt-1 w-full max-h-64 object-cover rounded-xl border border-line" />
    </a>
  );
}

export default function RincianTemuanModal({ b, onTutup, onTugaskan, onTandaiNormal }: Props) {
  const st = statusTemuan(b);
  const baris: [string, string | null | undefined][] = [
    ["Gardu", [b.gardu_kode, b.gardu_nama].filter(Boolean).join(" · ")],
    ["Alamat", b.gardu_alamat],
    ["Penyulang · ULP", [b.penyulang, b.ulp].filter(Boolean).join(" · ")],
    ["Asal temuan", b.sumber === "inspeksi_gardu" ? "Inspeksi Gardu" : "Pemeliharaan Gardu"],
    ["Bagian", b.bagian && b.bagian !== "-" ? b.bagian : null],
    ["Prioritas", b.prioritas],
    ["Ditemukan", `${waktu(b.ditemukan_pada)}${b.petugas_nama ? ` · ${b.petugas_nama}` : ""}`],
    ["Uraian / keterangan", [b.catatan, b.pr_keterangan, b.catatan_perbaikan].filter((t) => t && t.trim()).join(" · ") || null],
    ["Status", STATUS[st] + (b.tl_status === "Belum bisa" ? " · belum bisa dikerjakan" : "")],
    ["Work Order", b.jalur && st !== "normal" ? `${NAMA_JALUR[b.jalur] ?? b.jalur} · ${waktu(b.ditugaskan_pada)}` : null],
    [st === "normal" ? "Ditandai normal" : "Dikerjakan", b.dikerjakan ? `${waktu(b.dikerjakan.pada)}${b.dikerjakan.oleh ? ` · ${b.dikerjakan.oleh}` : ""}` : null],
    [st === "normal" ? "Alasan" : "Catatan regu", b.hasil_catatan],
  ];

  return (
    <ModalShell
      title={`${b.item_nama}: ${b.nilai_label ?? b.nilai ?? "—"}`}
      subtitle={`${b.gardu_kode} · ${STATUS[st]}`}
      maxWidth="max-w-2xl"
      onClose={onTutup}
      footer={(onTugaskan || onTandaiNormal) && (
        <>
          {onTandaiNormal && (
            <button onClick={onTandaiNormal} className={BTN_GHOST}>
              <CheckCircle2 size={14} /> Tandai normal
            </button>
          )}
          {onTugaskan && (
            <button onClick={onTugaskan} className={BTN_PRIMARY}>
              <ClipboardList size={14} /> Tugaskan
            </button>
          )}
        </>
      )}
    >
      <dl className="grid grid-cols-[140px_1fr] gap-x-3 gap-y-1.5 text-sm">
        {baris.filter(([, v]) => v && String(v).trim()).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-ink-muted text-xs pt-0.5">{k}</dt>
            <dd className="text-ink">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="grid sm:grid-cols-2 gap-3">
        <Foto url={b.foto_url} label="Foto temuan" />
        <Foto url={b.dikerjakan?.fotoSesudah} label={st === "normal" ? "Foto perbaikan" : "Foto sesudah perbaikan"} />
      </div>
      {!b.foto_url && b.sumber === "pemeliharaan" && (
        <p className="text-xs text-ink-muted">Foto temuan Pemeliharaan Gardu ada di catatan pemeliharaannya (tab Daftar).</p>
      )}
    </ModalShell>
  );
}
